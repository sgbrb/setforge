import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 20

/**
 * GET /api/setlists?cursor=X
 *
 * Lista os setlists do usuário, paginado (20 por página, cursor-based).
 * Se `cursor` for passado, retorna os 20 seguintes (a partir daquele id).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const cursor = req.nextUrl.searchParams.get('cursor')

    const setlists = await prisma.setlist.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        createdAt: true,
        analysis: true,
        totalDuration: true,
        _count: { select: { tracks: true } },
      },
    })

    const hasMore = setlists.length > PAGE_SIZE
    const page = hasMore ? setlists.slice(0, PAGE_SIZE) : setlists
    const nextCursor = hasMore ? page[page.length - 1].id : null

    return NextResponse.json({
      setlists: page.map(s => ({
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        analysis: s.analysis,
        totalDuration: s.totalDuration,
        trackCount: s._count.tracks,
      })),
      hasMore,
      nextCursor,
    })
  } catch (error) {
    console.error('[api/setlists] Erro no GET:', error)
    return NextResponse.json(
      { error: 'Erro ao listar setlists' },
      { status: 500 }
    )
  }
}