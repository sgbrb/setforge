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

    // Penalidade por uso (Regra A quebrada em níveis)
    const SETS_RECENT = 5
    const SETS_MEDIUM = 20
    const SETS_OLD = 50
    const PENALTY_RECENT = 0.8
    const PENALTY_MEDIUM = 0.5
    const PENALTY_OLD = 0.2

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

    // 5. 🆕 FILTRO DE DIVERSIDADE (antes do TSP)
    const recentForDiversity = await prisma.setlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: { tracks: { select: { trackId: true } } },
    })

    const usedIds = new Set<string>()
    for (const set of recentForDiversity) {
      for (const t of set.tracks) {
        if (t.trackId) usedIds.add(t.trackId)
      }
    }

    let filteredLibrary = library.filter(t => !usedIds.has(t.id))

    if (filteredLibrary.length < 60) {
      console.log(`[diversity] Filtro muito agressivo (${filteredLibrary.length} faixas). Usando pool original.`)
      filteredLibrary = library
    } else {
      console.log(`[diversity] Pool filtrado: ${library.length} → ${filteredLibrary.length} faixas (removidas ${usedIds.size} gastas)`)
    }

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

    // 7. LOOP DE RETRY
    let lastResult: ReturnType<typeof generateSmartSet> | null = null
    let lastSignature: ReturnType<typeof buildSetlistSignature> | null = null
    let attemptUsed = 0

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const seed = baseSeed + attempt
      attemptUsed = attempt + 1

      const result = generateSmartSet(filteredLibrary, {
        count: setSize,
        bpmTarget,
        bpmRange,
        minCamelotScore,
        seed,
        multiStart: 100,
        twoOptPasses: 2,
        usagePenalty,
      })

      if (result.tracks.length === 0) {
        return NextResponse.json(
          {
            error: 'Nenhuma faixa compatível com os filtros. Tenta aumentar o bpmRange ou tirar o camelotStrict.',
            candidates: result.candidates,
          },
          { status: 400 }
        )
      }

      const signature = buildSetlistSignature(
        result.tracks.map(t => ({ trackId: t.id, title: t.title }))
      )

      const isDuplicate = recentSignatures.some(sig =>
        signaturesMatch(sig, signature)
      )

      if (!isDuplicate) {
        // 8. AUTO-FIX (tenta zerar transições ruins)
        let finalTracks = result.tracks
        let fixIterations = 1
        let fixScore = result.averageScore

        try {
          const fixResult = await autoFixSetlist(
            result.tracks,
            analyses,
            durations,
            prisma,
            userId,
            3
          )
          finalTracks = fixResult.tracks
          fixIterations = fixResult.iterations
          fixScore = fixResult.finalScore
          console.log(`[auto-fix] ${fixIterations} iterações · score final ${fixScore}`)
        } catch (err) {
          console.warn('[auto-fix] Falhou, usando set original:', err)
        }

        // 9. Salva no banco + retorna
        const savedSetlist = await prisma.setlist.create({
          data: {
            name: `Smart · ${new Date().toLocaleDateString('pt-BR')}`,
            eventType: 'Smart',
            duration: 'auto',
            energyCurve: 'auto',
            audience: null,
            analysis: `Setlist gerado por TSP · score médio ${fixScore}/100 · ${fixIterations} iteração(ões) auto-fix · ${attemptUsed} tentativa(s)`,
            djTip: null,
            peakMoment: null,
            totalDuration: `${finalTracks.length} faixas`,
            userId,
            folderId: (typeof body.folderId === 'string' && body.folderId !== 'all') ? body.folderId : null,
            tracks: {
              create: finalTracks.map((t, i) => ({
                position: i + 1,
                trackId: t.id,
                title: t.title,
                artist: t.artist,
                bpm: t.bpm,
                key: t.key,
                energy: t.energy,
                transitionNote: null,
              })),
            },
          },
        })

        return NextResponse.json({
          id: savedSetlist.id,
          tracks: finalTracks,
          averageScore: fixScore,
          worstScore: result.worstScore,
          candidates: result.candidates,
          requestedCount: result.requestedCount,
          effectiveCount: result.effectiveCount,
          elapsedMs: result.elapsedMs,
          seed: result.seed,
          attempts: attemptUsed,
          autoFixIterations: fixIterations,
          duplicate: false,
          filters: {
            bpmTarget,
            bpmRange,
            camelotStrict: !!body.camelotStrict,
            setSize,
          },
        })
      }

      lastResult = result
      lastSignature = signature
    }

    // 10. Todas as tentativas deram duplicado
    if (!lastResult) {
      return NextResponse.json(
        { error: 'Não foi possível gerar nenhum setlist.' },
        { status: 500 }
      )
    }

    const savedSetlist = await prisma.setlist.create({
      data: {
        name: `Smart · ${new Date().toLocaleDateString('pt-BR')}`,
        eventType: 'Smart',
        duration: 'auto',
        energyCurve: 'auto',
        audience: null,
        analysis: `Setlist gerado por TSP (duplicata após ${attemptUsed} tentativas) · score médio ${lastResult.averageScore}/100`,
        djTip: null,
        peakMoment: null,
        totalDuration: `${lastResult.tracks.length} faixas`,
        userId,
        folderId: (typeof body.folderId === 'string' && body.folderId !== 'all') ? body.folderId : null,
        tracks: {
          create: lastResult.tracks.map((t, i) => ({
            position: i + 1,
            trackId: t.id,
            title: t.title,
            artist: t.artist,
            bpm: t.bpm,
            key: t.key,
            energy: t.energy,
            transitionNote: null,
          })),
        },
      },
    })

    return NextResponse.json({
      id: savedSetlist.id,
      tracks: lastResult.tracks,
      averageScore: lastResult.averageScore,
      worstScore: lastResult.worstScore,
      candidates: lastResult.candidates,
      requestedCount: lastResult.requestedCount,
      effectiveCount: lastResult.effectiveCount,
      elapsedMs: lastResult.elapsedMs,
      seed: lastResult.seed,
      attempts: attemptUsed,
      duplicate: true,
      warning: `Esse set já apareceu nos últimos ${RECENT_SETLISTS_FOR_EQUALITY} setlists. Tentei ${MAX_RETRIES} seeds diferentes mas todas geraram o mesmo conjunto. Tenta mudar os filtros (BPM/Camelot) ou aumenta a biblioteca.`,
      filters: {
        bpmTarget,
        bpmRange,
        camelotStrict: !!body.camelotStrict,
        setSize,
      },
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