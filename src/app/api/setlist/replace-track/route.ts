import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTransitionScore, getTargetEnergy } from '@/lib/harmonic-utils'
import { Prisma } from '@prisma/client'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const { setlistId, positionToReplace, rejectedIds = [], keyOffset = 0, targetEnergy = null } = body

    const setlist = await prisma.setlist.findUnique({
      where: { id: setlistId },
      include: { tracks: { orderBy: { position: 'asc' } } },
    })

    if (!setlist) return NextResponse.json({ error: 'Setlist não encontrado' }, { status: 404 })

    const tracks = setlist.tracks
    const index = positionToReplace - 1
    const prevTrack = index > 0 ? tracks[index - 1] : null
    const nextTrack = index < tracks.length - 1 ? tracks[index + 1] : null

    const currentTrack = tracks[index]
    const currentKey = currentTrack.key || ''
    
    let targetKeyNum: number | null = null
    let targetKeyLetter: string | null = null
    if (keyOffset !== 0 && currentKey) {
      const num = parseInt(currentKey.slice(0, -1), 10)
      const letter = currentKey.slice(-1)
      if (!isNaN(num)) {
        let newNum = num + keyOffset
        if (newNum > 12) newNum = 1
        if (newNum < 1) newNum = 12
        targetKeyNum = newNum
        targetKeyLetter = letter
      }
    }

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

        // 🆕 FILTRO ABSOLUTO DE ENERGIA
    // Se o usuário clicou em + ou -, só permitimos músicas com energia muito próxima
    let candidatesWithEnergy = allCandidates
    if (targetEnergy !== null) {
      candidatesWithEnergy = allCandidates.filter(c => {
        const cEnergy = (c.segments as any)?.energy || 0
        return Math.abs(cEnergy - targetEnergy) <= 0.5 // Tolerância de apenas 0.5 (quase exato)
      })
    }

    // Se o filtro de energia não achar nada, avisa o usuário
    if (candidatesWithEnergy.length === 0) {
      return NextResponse.json({ 
        error: `Nenhuma faixa com energia exata ${targetEnergy}. Tente outro valor ou adicione mais músicas.` 
      }, { status: 400 })
    }

    // 🆕 Aplica o filtro de Tom em cima da lista de energia
    let filtered = candidatesWithEnergy 
    if (keyOffset !== 0 && targetKeyNum !== null && targetKeyLetter !== null) {
      filtered = filtered.filter(c => {
        if (!c.key) return false
        const cNum = parseInt(c.key.slice(0, -1), 10)
        const cLetter = c.key.slice(-1)
        return cNum === targetKeyNum && cLetter === targetKeyLetter
      })
    }

    const freshCandidates = filtered.filter(c => !usedIds.has(c.id))

    if (freshCandidates.length === 0) {
      return NextResponse.json({ error: 'Nenhuma faixa inédita encontrada com esses filtros.' }, { status: 400 })
    }

    let bestCandidate = null
    let bestScore = -99999
    const curveEnergy = getTargetEnergy(index + 1, tracks.length)

    for (const c of freshCandidates) {
      let score = 0
      if (prevTrack) score += getTransitionScore(prevTrack as any, c as any, index - 1, tracks.length)
      if (nextTrack) score += getTransitionScore(c as any, nextTrack as any, index, tracks.length)
      if (score > bestScore) {
      bestScore = score
      bestCandidate = c
      }
      }
      
    
        
  

    if (!bestCandidate) {
      return NextResponse.json({ error: 'Nenhuma faixa encontrada.' }, { status: 400 })
    }

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