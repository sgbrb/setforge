import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/setlist
 *
 * Retorna o último setlist do usuário logado, com todas as faixas
 * e os dados completos pra reconstruir a UI no F5.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const setlist = await prisma.setlist.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        tracks: {
          orderBy: { position: 'asc' },
        },
      },
    })

    if (!setlist) {
      return NextResponse.json({ setlist: null })
    }

    // 🔑 Reconstroi o payload no MESMO formato que /api/generate-setlist retorna
    return NextResponse.json({
      id: setlist.id,
      setlist: setlist.tracks.map(t => ({
        id: t.trackId || t.id,  // 🆕 prefere o ID original
        position: t.position,
        title: t.title,
        artist: t.artist,
        bpm: t.bpm,
        key: t.key,
        energy: t.energy,
        transitionNote: t.transitionNote,
      })),
      analysis: setlist.analysis || '',
      djTip: setlist.djTip || '',
      peakMoment: setlist.peakMoment || '',
      totalDuration: setlist.totalDuration || '0',
    })
  } catch (error) {
    console.error('[api/setlist] Erro no GET:', error)
    return NextResponse.json(
      { error: 'Erro ao carregar setlist' },
      { status: 500 }
    )
  }
}