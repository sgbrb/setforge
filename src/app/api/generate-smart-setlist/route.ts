import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { generateSmartSet } from '@/lib/tsp'
import type { Track as FrontendTrack } from '@/lib/types'

const RECENT_SETLISTS_FOR_EXCLUSION = 4   // Regra A — não repetir faixas
const RECENT_SETLISTS_FOR_EQUALITY = 20   // Regra B — não repetir set igual
const MAX_RETRIES = 5                     // seeds: base+0, base+1, ..., base+4
const BASE_SEED = 42

/**
 * Normaliza título pra comparação (Regra B).
 * Lowercase, trim, espaços colapsados.
 */
function normalizeTitle(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Assinatura de um setlist pra comparação B1:
 * - Set de trackIds (ignora null/gen-xxx)
 * - Set de títulos normalizados
 *
 * Dois setlists são "iguais" se TODOS os trackIds reais batem
 * OU se todos os títulos normalizados batem.
 */
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

/**
 * Compara 2 assinaturas. Retorna true se forem iguais.
 * "Iguais" = mesmos trackIds (não-vazios) OU mesmos títulos (não-vazios).
 */
function signaturesMatch(
  a: { ids: Set<string>; titles: Set<string> },
  b: { ids: Set<string>; titles: Set<string> }
): boolean {
  // Se ambos têm ids reais e são idênticos → match
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

  // Se ambos têm títulos e são idênticos → match
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

/**
 * POST /api/generate-smart-setlist
 *
 * Gera um setlist inteligente usando TSP (nearest neighbor + 2-opt + or-opt).
 *
 * Regras aplicadas:
 * - A: exclui faixas dos últimos 4 setlists
 * - B1: não repete set igual (mesmas faixas, qualquer ordem) — últimos 20 setlists
 *       Tenta até 5 seeds diferentes. Se todas falharem, devolve a última + warning.
 *
 * Body (todos opcionais):
 *   {
 *     bpmTarget?: number
 *     bpmRange?: number
 *     camelotStrict?: boolean
 *     setSize?: number
 *     seed?: number
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userId = session.user.id

    // 1. Parse do body
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

    // 2. Busca os últimos 20 setlists do usuário (Regra A + Regra B)
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

    // Regra A: pega trackIds dos 4 mais recentes pra excluir
    const excludedTrackIds = new Set<string>()
    for (const sl of recentSetlists.slice(0, RECENT_SETLISTS_FOR_EXCLUSION)) {
      for (const t of sl.tracks) {
        if (t.trackId && !t.trackId.startsWith('gen-')) {
          excludedTrackIds.add(t.trackId)
        }
      }
    }

    // Regra B: assinaturas dos 20 últimos pra comparar
    const recentSignatures = recentSetlists.map(sl =>
      buildSetlistSignature(sl.tracks)
    )

    // 3. Busca faixas do usuário (bpm > 0, fora das excluídas)
    const prismaTracks = await prisma.track.findMany({
  where: {
    userId,
    bpm: { gt: 0 },
    ...(body.onlyAnalyzed ? { segments: { not: Prisma.DbNull } } : {}),
    ...(excludedTrackIds.size > 0
      ? { id: { notIn: [...excludedTrackIds] } }
      : {}),
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
      },
    })

    if (prismaTracks.length === 0) {
      return NextResponse.json(
        {
          error:
            'Nenhuma faixa disponível (todas com BPM foram excluídas pelos últimos 4 setlists?).',
        },
        { status: 400 }
      )
    }

    // 4. Converte Prisma.Track → types.Track
    const library: FrontendTrack[] = prismaTracks.map(t => ({
      id: t.id,
      folderId: t.folderId,
      title: t.title,
      artist: t.artist,
      bpm: t.bpm,
      key: t.key,
      energy: t.energy,
      firstBeatSec: t.firstBeatSec,
      durationMs:
        t.durationSec > 0 ? Math.round(t.durationSec * 1000) : undefined,
    }))

    // 5. Loop de retry (Regra B1 — até 5 seeds diferentes)
    let lastResult: ReturnType<typeof generateSmartSet> | null = null
    let lastSignature: ReturnType<typeof buildSetlistSignature> | null = null
    let attemptUsed = 0

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const seed = baseSeed + attempt
      attemptUsed = attempt + 1

      const result = generateSmartSet(library, {
        count: setSize,
        bpmTarget,
        bpmRange,
        minCamelotScore,
        seed,
        multiStart: 100,
        twoOptPasses: 2,
      })

      if (result.tracks.length === 0) {
        return NextResponse.json(
          {
            error:
              'Nenhuma faixa compatível com os filtros. Tenta aumentar o bpmRange ou tirar o camelotStrict.',
            candidates: result.candidates,
          },
          { status: 400 }
        )
      }

      // Constrói assinatura do resultado
      const signature = buildSetlistSignature(
        result.tracks.map(t => ({ trackId: t.id, title: t.title }))
      )

      // Compara com os últimos 20 (B1)
      const isDuplicate = recentSignatures.some(sig =>
        signaturesMatch(sig, signature)
      )

           if (!isDuplicate) {
        // Achou um set único — salva no banco + retorna
        const savedSetlist = await prisma.setlist.create({
          data: {
            name: `Smart · ${new Date().toLocaleDateString('pt-BR')}`,
            eventType: 'Smart',
            duration: 'auto',
            energyCurve: 'auto',
            audience: null,
            analysis: `Setlist gerado por TSP · score médio ${result.averageScore}/100 · pior ${result.worstScore}/100 · ${attemptUsed} tentativa(s)`,
            djTip: null,
            peakMoment: null,
            totalDuration: `${result.tracks.length} faixas`,
            userId,
            folderId: body.folderId ?? null,
            tracks: {
              create: result.tracks.map((t, i) => ({
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
          tracks: result.tracks,
          averageScore: result.averageScore,
          worstScore: result.worstScore,
          candidates: result.candidates,
          requestedCount: result.requestedCount,
          effectiveCount: result.effectiveCount,
          elapsedMs: result.elapsedMs,
          seed: result.seed,
          attempts: attemptUsed,
          duplicate: false,
          filters: {
            bpmTarget,
            bpmRange,
            camelotStrict: !!body.camelotStrict,
            setSize,
          },
        })
      }

      // Guarda pra caso todas as tentativas falhem
      lastResult = result
      lastSignature = signature
    }

    // 6. Todas as tentativas deram duplicado → devolve a última + warning
    if (!lastResult) {
      return NextResponse.json(
        { error: 'Não foi possível gerar nenhum setlist.' },
        { status: 500 }
      )
    }

        // Salva mesmo em duplicata (último resultado)
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
        folderId: body.folderId ?? null,
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