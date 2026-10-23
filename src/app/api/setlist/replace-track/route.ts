import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTransitionScore, getTargetEnergy } from '@/lib/harmonic-utils'
import { Prisma } from '@prisma/client'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { setlistId, positionToReplace } = body

    // 1. Carrega o setlist atual
    const setlist = await prisma.setlist.findUnique({
      where: { id: setlistId },
      include: { tracks: { orderBy: { position: 'asc' } } },
    })

    if (!setlist) return NextResponse.json({ error: 'Setlist não encontrado' }, { status: 404 })

    const tracks = setlist.tracks
    const index = positionToReplace - 1
    const prevTrack = index > 0 ? tracks[index - 1] : null
    const nextTrack = index < tracks.length - 1 ? tracks[index + 1] : null

    // 2. Busca candidatas no banco (que não estão no set)
    const currentIds = tracks.map(t => t.trackId).filter(Boolean) as string[]
    const candidates = await prisma.track.findMany({
      where: {
        userId: session.user.id,
        id: { notIn: currentIds },
        segments: { not: Prisma.DbNull },
      },
      select: { id: true, title: true, artist: true, bpm: true, key: true, segments: true, durationSec: true },
    })

    if (candidates.length === 0) {
      return NextResponse.json({ error: 'Nenhuma faixa disponível no banco para substituição.' }, { status: 400 })
    }

    // 3. Calcula a melhor substituta (olhando o mix point com a anterior e a próxima)
    let bestCandidate = null
    let bestScore = -1

    for (const c of candidates) {
      let score = 0
      if (prevTrack) {
        score += getTransitionScore(prevTrack as any, c as any, index - 1, tracks.length)
      }
      if (nextTrack) {
        score += getTransitionScore(c as any, nextTrack as any, index, tracks.length)
      }

      // Penaliza se a energia estiver muito fora da curva
      const targetEnergy = getTargetEnergy(index + 1, tracks.length)
      const cEnergy = (c.segments as any)?.energy || 0
      if (Math.abs(cEnergy - targetEnergy) > 2) score -= 15

      if (score > bestScore) {
        bestScore = score
        bestCandidate = c
      }
    }

    if (!bestCandidate) {
      return NextResponse.json({ error: 'Nenhuma substituta boa encontrada.' }, { status: 400 })
    }

    // 4. Atualiza a faixa no banco
    await prisma.setlistTrack.update({
      where: { id: tracks[index].id },
      data: {
        trackId: bestCandidate.id,
        title: bestCandidate.title,
        artist: bestCandidate.artist,
        bpm: bestCandidate.bpm,
        key: bestCandidate.key || '',
        energy: (bestCandidate.segments as any)?.energy || 7,
      },
    })

    return NextResponse.json({ success: true, newTrack: bestCandidate })
  } catch (err) {
    console.error('[api/setlist/replace-track] Erro:', err)
    return NextResponse.json({ error: 'Erro ao substituir faixa' }, { status: 500 })
  }
}