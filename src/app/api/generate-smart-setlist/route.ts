import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { generateSmartSet } from '@/lib/tsp'
import { autoFixSetlist } from '@/lib/setlist-auto-fix'
import type { Track as FrontendTrack } from '@/lib/types'

const RECENT_SETLISTS_FOR_EQUALITY = 100
const MAX_RETRIES = 5
const BASE_SEED = 42

function normalizeTitle(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function buildSetlistSignature(
  tracks: Array<{ trackId: string | null; title: string }>
): { ids: Set<string>; titles: Set<string> } {
  const ids = new Set<string>()
  const titles = new Set<string>()

  for (const t of tracks) {
    if (t.trackId && !t.trackId.startsWith('gen-')) {
      ids.add(t.trackId)
    }
    if (t.title) {
      titles.add(normalizeTitle(t.title))
    }
  }

  return { ids, titles }
}

function signaturesMatch(
  a: { ids: Set<string>; titles: Set<string> },
  b: { ids: Set<string>; titles: Set<string> }
): boolean {
  if (a.ids.size > 0 && b.ids.size > 0 && a.ids.size === b.ids.size) {
    let allIn = true
    for (const id of a.ids) {
      if (!b.ids.has(id)) {
        allIn = false
        break
      }
    }
    if (allIn) return true
  }

  if (
    a.titles.size > 0 &&
    b.titles.size > 0 &&
    a.titles.size === b.titles.size
  ) {
    let allIn = true
    for (const t of a.titles) {
      if (!b.titles.has(t)) {
        allIn = false
        break
      }
    }
    if (allIn) return true
  }

  return false
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userId = session.user.id

    let body: {
      bpmTarget?: number
      bpmRange?: number
      camelotStrict?: boolean
      setSize?: number
      seed?: number
      onlyAnalyzed?: boolean
      folderId?: string | null
    } = {}

    try {
      body = await req.json()
    } catch {
      // body vazio OK
    }

    const setSize = Math.max(1, Math.min(body.setSize ?? 30, 200))
    const bpmTarget =
      typeof body.bpmTarget === 'number' && body.bpmTarget > 0
        ? body.bpmTarget
        : null
    const bpmRange =
      typeof body.bpmRange === 'number' && body.bpmRange > 0
        ? body.bpmRange
        : 10
    const minCamelotScore = body.camelotStrict ? 85 : 0
    const baseSeed =
      typeof body.seed === 'number' ? body.seed : BASE_SEED

    // 2. Busca os últimos 100 setlists (Regra B)
    const recentSetlists = await prisma.setlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_SETLISTS_FOR_EQUALITY,
      include: {
        tracks: {
          select: { trackId: true, title: true },
        },
      },
    })

    // Penalidade por uso (Regra A)
    const SETS_RECENT = 10      // Lembra dos últimos 10 sets
    const SETS_MEDIUM = 30      // 30 sets
    const SETS_OLD = 100        // 100 sets
    const PENALTY_RECENT = 0.9  // Score cai 90% (praticamente banida)
    const PENALTY_MEDIUM = 0.7  // Score cai 70%
    const PENALTY_OLD = 0.4     // Score cai 40%

    const usagePenalty: Record<string, number> = {}
    for (let i = 0; i < recentSetlists.length; i++) {
      const setAge = i
      let penalty = 0
      if (setAge < SETS_RECENT) penalty = PENALTY_RECENT
      else if (setAge < SETS_MEDIUM) penalty = PENALTY_MEDIUM
      else if (setAge < SETS_OLD) penalty = PENALTY_OLD
      else continue

      for (const t of recentSetlists[i].tracks) {
        if (t.trackId && !t.trackId.startsWith('gen-')) {
          usagePenalty[t.trackId] = Math.max(usagePenalty[t.trackId] ?? 0, penalty)
        }
      }
    }

    const recentSignatures = recentSetlists.map(sl =>
      buildSetlistSignature(sl.tracks)
    )

    // 3. Busca faixas (COM segments)
    const prismaTracks = await prisma.track.findMany({
      where: {
        userId,
        bpm: { gt: 0 },
        segments: { not: Prisma.DbNull },
      },
      select: {
        id: true,
        folderId: true,
        title: true,
        artist: true,
        bpm: true,
        key: true,
        energy: true,
        durationSec: true,
        firstBeatSec: true,
        segments: true,
      },
    })

    if (prismaTracks.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma faixa disponível com análise estrutural.' },
        { status: 400 }
      )
    }

    // 4. Converte Prisma.Track → types.Track
    const library: FrontendTrack[] = prismaTracks.map(t => {
      const segs = t.segments as any
      return {
        id: t.id,
        folderId: t.folderId,
        title: t.title,
        artist: t.artist,
        bpm: t.bpm,
        key: t.key,
        energy: segs?.energy ?? 0,
        firstBeatSec: t.firstBeatSec,
        durationMs: t.durationSec > 0 ? Math.round(t.durationSec * 1000) : undefined,
      }
    })

    // 🆕 DEDUPLICAÇÃO: Evita colocar a mesma faixa 2x no setlist (mesmo que ids sejam diferentes)
    const uniqueLibraryMap = new Map<string, FrontendTrack>()
    for (const track of library) {
      const key = normalizeTitle(track.title)
      if (!uniqueLibraryMap.has(key)) {
        uniqueLibraryMap.set(key, track)
      }
    }
    const uniqueLibrary = Array.from(uniqueLibraryMap.values())
    console.log(`[dedup] Biblioteca: ${library.length} → ${uniqueLibrary.length} faixas únicas`)

    // 5. 🆕 FILTRO DE DIVERSIDADE E ROTAÇÃO (antes do TSP)
    const recentForDiversity = await prisma.setlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20, 
      include: { tracks: { select: { trackId: true } } },
    })

    const usedIds = new Set<string>()
    for (const set of recentForDiversity) {
      for (const t of set.tracks) {
        if (t.trackId) usedIds.add(t.trackId)
      }
    }

    // 🆕 Lógica de Rotação: Se a biblioteca for grande, remove as usadas recentemente
    let filteredLibrary = uniqueLibrary.filter(t => !usedIds.has(t.id))

    if (filteredLibrary.length < 60) {
      console.log(`[rotation] Poucas faixas após filtrar os últimos 5 sets (${filteredLibrary.length}). Usando pool original.`)
      filteredLibrary = uniqueLibrary
    } else {
      console.log(`[rotation] Pool filtrado: ${uniqueLibrary.length} → ${filteredLibrary.length} faixas (removidas ${usedIds.size} usadas nos últimos sets)`)
    }
     // 🆕 Log para ver quantas músicas foram banidas da rotação
    console.log(`[rotation] Removidas ${usedIds.size} faixas usadas nos últimos 20 sets.`);
    // 🆕 TRAVA DE SEGURANÇA: Remove faixas duplicadas pelo TÍTULO para o TSP não repetir
    const uniqueTitles = new Set<string>();
    const cleanLibrary = filteredLibrary.filter(t => {
      const normTitle = t.title.trim().toLowerCase();
      if (uniqueTitles.has(normTitle)) return false;
      uniqueTitles.add(normTitle);
      return true;
    });

    // 6. 🆕 PREPARA DADOS PRO AUTO-FIX (UMA VEZ, fora do loop)
    const allTracksWithSegments = await prisma.track.findMany({
      where: { userId, segments: { not: Prisma.DbNull } },
      select: { id: true, durationSec: true, segments: true },
    })

    const analyses: Record<string, any> = {}
    const durations: Record<string, number> = {}

    for (const t of allTracksWithSegments) {
      if (t.segments) {
        analyses[t.id] = t.segments
        durations[t.id] = t.durationSec ?? 0
      }
    }

    // 🆕 AUMENTAMOS AS TENTATIVAS: 50 seeds diferentes
    const MAX_TENTATIVAS = 50; 
    let lastResult: ReturnType<typeof generateSmartSet> | null = null;
    let lastSignature: ReturnType<typeof buildSetlistSignature> | null = null;
    let attemptUsed = 0;

    // 1. TENTA ACHAR O PADRÃO OURO (Score >= 80)
    for (let attempt = 0; attempt < MAX_TENTATIVAS; attempt++) {
      const seed = baseSeed + (attempt * 13); // Sementes variadas
      attemptUsed = attempt + 1;

      const result = generateSmartSet(cleanLibrary, {
        count: setSize,
        bpmTarget,
        bpmRange,
        minCamelotScore,
        seed,
        multiStart: 500, // 🆕 Aumentado de 100 para 200
        twoOptPasses: 2,
        usagePenalty,
        minTransitionScore: 80, // Força o padrão ouro
      });

      // Se não achou faixas, ignora essa tentativa
      if (result.tracks.length === 0) continue;

      // 🆕 Só aceita se o set for 100% perfeito
      if (!result.passedQualityCheck) {
        // Se não for perfeito, guarda apenas se for MELHOR que o último guardado
        if (!lastResult || result.worstScore > lastResult.worstScore) {
            lastResult = result; 
        }
        continue;
      }

      // Se passou no padrão ouro, verifica se não é duplicado
      const signature = buildSetlistSignature(
        result.tracks.map(t => ({ trackId: t.id, title: t.title }))
      );

      const isDuplicate = recentSignatures.some(sig =>
        signaturesMatch(sig, signature)
      );

      if (!isDuplicate) {
        console.log(`[padrao-ouro] Sucesso na tentativa ${attemptUsed}! Score ${result.averageScore}/100`);
        lastResult = result; 
        break; // ACHOU! Pode parar de tentar.
      }
      
      lastResult = result;
    }

    // 2. FALLBACK: Se não achou o padrão ouro de 80, tenta relaxar para 75
    let finalResult = lastResult;
    if (!finalResult || !finalResult.passedQualityCheck) {
       console.warn(`[padrao-ouro] Falhou em 50 tentativas. Tentando relaxar para 75...`);
       
       for (let attempt = 0; attempt < 20; attempt++) {
         const seed = baseSeed + (attempt * 13); // 🆕 Sementes variadas também no fallback
         const relaxedResult = generateSmartSet(cleanLibrary, {
           count: setSize, bpmTarget, bpmRange, minCamelotScore, seed,
           multiStart: 200, // 🆕 Aumentado
           twoOptPasses: 2, usagePenalty, minTransitionScore: 75,
         });
         
         // 🆕 Guarda se for melhor que o que já temos
         if (relaxedResult.tracks.length > 0 && (!finalResult || relaxedResult.worstScore > finalResult.worstScore)) {
            finalResult = relaxedResult;
         }
         
         // Se por acaso ele achar um set 100% perfeito no fallback (milagre), para de tentar
         if (relaxedResult.passedQualityCheck) break; 
       }
    }

    if (!finalResult || finalResult.tracks.length === 0) {
       return NextResponse.json({ 
         error: 'Não foi possível montar o set.',
         suggestion: 'Sua biblioteca não tem faixas compatíveis para este BPM/Tom. Tente mudar o BPM alvo ou aumentar o Range.'
       }, { status: 400 });
    }
    // 3. SALVA E RETORNA (A partir daqui, o código é o mesmo que você já tem)
    const signature = buildSetlistSignature(
      finalResult.tracks.map(t => ({ trackId: t.id, title: t.title }))
    );
    const isDuplicate = recentSignatures.some(sig => signaturesMatch(sig, signature));

    let finalTracks = finalResult.tracks;
    let fixIterations = 1;
    let fixScore = finalResult.averageScore;

    try {
      const fixResult = await autoFixSetlist(finalResult.tracks, analyses, durations, prisma, userId, 3);
      finalTracks = fixResult.tracks;
      fixIterations = fixResult.iterations;
      fixScore = fixResult.finalScore;
      console.log(`[auto-fix] ${fixIterations} iterações · score final ${fixScore}`);
    } catch (err) {
      console.warn('[auto-fix] Falhou, usando set original:', err);
    }

    const savedSetlist = await prisma.setlist.create({
      data: {
        name: `Smart · ${new Date().toLocaleDateString('pt-BR')}`,
        eventType: 'Smart',
        duration: 'auto',
        energyCurve: 'auto',
        audience: null,
        analysis: `Setlist gerado por TSP (Padrão Ouro) · score médio ${fixScore}/100 · ${attemptUsed} tentativa(s)`,
        djTip: null,
        peakMoment: null,
        totalDuration: `${finalTracks.length} faixas`,
        userId,
        folderId: (typeof body.folderId === 'string' && body.folderId !== 'all') ? body.folderId : null,
        tracks: {
          create: finalTracks.map((t, i) => ({
            position: i + 1, trackId: t.id, title: t.title, artist: t.artist,
            bpm: t.bpm, key: t.key, energy: t.energy, transitionNote: null,
          })),
        },
      },
    })

    return NextResponse.json({
      id: savedSetlist.id,
      tracks: finalTracks,
      averageScore: fixScore,
      worstScore: finalResult.worstScore,
      candidates: finalResult.candidates,
      requestedCount: finalResult.requestedCount,
      effectiveCount: finalResult.effectiveCount,
      elapsedMs: finalResult.elapsedMs,
      seed: finalResult.seed,
      attempts: attemptUsed,
      autoFixIterations: fixIterations,
      duplicate: isDuplicate,
      warning: isDuplicate ? `Esse set já apareceu nos últimos ${RECENT_SETLISTS_FOR_EQUALITY} setlists.` : undefined,
      filters: { bpmTarget, bpmRange, camelotStrict: !!body.camelotStrict, setSize },
    })
        } catch (error) {
      console.error('[api/generate-smart-setlist] Erro:', error)
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      return NextResponse.json(
        { error: `Erro: ${message}` },
        { status: 500 }
      )
    }
  }