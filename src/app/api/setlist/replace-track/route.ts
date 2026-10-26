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

    // 1. Carrega o setlist
    const setlist = await prisma.setlist.findUnique({
      where: { id: setlistId },
      include: { tracks: { orderBy: { position: 'asc' } } },
    })

    if (!setlist) return NextResponse.json({ error: 'Setlist não encontrado' }, { status: 404 })

    // 🆕 Lê a lista de músicas rejeitadas do banco
    const rejectedIds = setlist.rejectedTrackIds
      ? setlist.rejectedTrackIds.split(',').filter(Boolean)
      : []

    const tracks = setlist.tracks
    const index = positionToReplace - 1
    const prevTrack = index > 0 ? tracks[index - 1] : null
    const nextTrack = index < tracks.length - 1 ? tracks[index + 1] : null

    // 2. Pega os IDs dos últimos 20 sets
    const recentSets = await prisma.setlist.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { tracks: { select: { trackId: true } } },
    })
    const usedIds = new Set<string>()
    for (const s of recentSets) {
      for (const t of s.tracks) {
        if (t.trackId) usedIds.add(t.trackId)
      }
    }

    // 3. Busca as candidatas
    const currentIds = tracks.map(t => t.trackId).filter(Boolean) as string[]
    const allBlocked = [...currentIds, ...rejectedIds]

    const allCandidates = await prisma.track.findMany({
      where: {
        userId: session.user.id,
        id: { notIn: allBlocked },
        segments: { not: Prisma.DbNull },
      },
      select: { id: true, title: true, artist: true, bpm: true, key: true, segments: true, durationSec: true },
    })

    // 4. Separa novas e repetidas
    const freshCandidates = allCandidates.filter(c => !usedIds.has(c.id))

    if (freshCandidates.length === 0) {
      return NextResponse.json({
        error: 'Não há faixas inéditas para este BPM/Tom. Tente aumentar o BPM Range.'
      }, { status: 400 })
    }

    // 5. Acha a melhor
    let bestCandidate = null
    let bestScore = -1

    for (const c of freshCandidates) {
      let score = 0
      if (prevTrack) score += getTransitionScore(prevTrack as any, c as any, index - 1, tracks.length)
      if (nextTrack) score += getTransitionScore(c as any, nextTrack as any, index, tracks.length)

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

    // 🆕 Salva a música escolhida na lista de rejeitadas do banco
    const newRejectedIds = [...rejectedIds, bestCandidate.id].join(',')

    await prisma.setlist.update({
      where: { id: setlistId },
      data: { rejectedTrackIds: newRejectedIds }
    })

    // Atualiza a faixa
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