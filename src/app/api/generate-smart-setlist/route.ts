import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSmartSet } from '@/lib/tsp'
import type { Track as FrontendTrack } from '@/lib/types'

/**
 * POST /api/generate-smart-setlist
 *
 * Gera um setlist inteligente usando TSP (nearest neighbor + 2-opt + or-opt).
 *
 * Body (todos opcionais):
 *   {
 *     bpmTarget?: number      // ex: 124
 *     bpmRange?: number       // ex: 10 (aceita 124 ± 10)
 *     camelotStrict?: boolean // se true, minCamelotScore = 85
 *     setSize?: number        // default: 30
 *     seed?: number           // default: 42
 *   }
 *
 * Retorno:
 *   {
 *     tracks: [...],
 *     averageScore: number,
 *     worstScore: number,
 *     candidates: number,
 *     elapsedMs: number,
 *     seed: number,
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userId = session.user.id

    // 1. Parse do body (todos opcionais)
    let body: {
      bpmTarget?: number
      bpmRange?: number
      camelotStrict?: boolean
      setSize?: number
      seed?: number
    } = {}

    try {
      body = await req.json()
    } catch {
      // body vazio é OK — usa defaults
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
    const seed = typeof body.seed === 'number' ? body.seed : 42

    // 2. Busca faixas do usuário (só as com bpm > 0)
    const prismaTracks = await prisma.track.findMany({
      where: {
        userId,
        bpm: { gt: 0 },
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
        { error: 'Nenhuma faixa com BPM no banco. Importa o XML primeiro.' },
        { status: 400 }
      )
    }

    // 3. Converte Prisma.Track → types.Track (que o TSP espera)
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

    // 4. Roda o TSP
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

    // 5. Retorna
    return NextResponse.json({
      tracks: result.tracks,
      averageScore: result.averageScore,
      worstScore: result.worstScore,
      candidates: result.candidates,
      elapsedMs: result.elapsedMs,
      seed: result.seed,
      // eco dos filtros usados (pra UI mostrar)
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