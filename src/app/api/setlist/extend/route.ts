import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { generateSmartSet } from '@/lib/tsp'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const { setlistId, additionalTracks } = body

    // 1. Pega o setlist atual
    const setlist = await prisma.setlist.findUnique({
      where: { id: setlistId },
      include: { tracks: { orderBy: { position: 'asc' } } },
    })
    if (!setlist) return NextResponse.json({ error: 'Setlist não encontrado' }, { status: 404 })

    const currentTracks = setlist.tracks
    const lastTrack = currentTracks[currentTracks.length - 1]

    // 2. Busca a biblioteca inteira, mas tira as que já estão no set
    const currentIds = currentTracks.map(t => t.trackId).filter(Boolean) as string[]
    const library = await prisma.track.findMany({
      where: {
        userId: session.user.id,
        id: { notIn: currentIds }, // Remove as que já estão no set
        segments: { not: Prisma.DbNull },
      },
    })

    // 3. Roda o TSP para achar as novas faixas, baseando-se na última faixa do set atual
    const result = generateSmartSet(library.map(t => ({
        id: t.id, title: t.title, artist: t.artist, bpm: t.bpm, key: t.key, 
        energy: (t.segments as any)?.energy || 7, folderId: t.folderId, source: 'upload'
    })), {
      count: additionalTracks,
      bpmTarget: lastTrack.bpm, // O alvo agora é o BPM da última faixa do set
      bpmRange: 10,
      minTransitionScore: 80,
    })

    if (result.tracks.length === 0) {
      return NextResponse.json({ error: 'Não foi possível encontrar faixas para expandir o set.' }, { status: 400 })
    }

    // 4. Salva as novas faixas no banco, mantendo a posição correta
    const startPosition = currentTracks.length
    await prisma.setlistTrack.createMany({
      data: result.tracks.map((t, i) => ({
        setlistId,
        position: startPosition + i + 1,
        trackId: t.id,
        title: t.title,
        artist: t.artist,
        bpm: t.bpm,
        key: t.key,
        energy: t.energy,
      })),
    })

    return NextResponse.json({ success: true, newCount: currentTracks.length + result.tracks.length })
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao expandir set' }, { status: 500 })
  }
}