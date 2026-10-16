import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * DELETE /api/setlists/:id
 *
 * Deleta 1 setlist (só se for do usuário logado).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = params

    const setlist = await prisma.setlist.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!setlist) {
      return NextResponse.json({ error: 'Setlist não encontrado' }, { status: 404 })
    }

    await prisma.setlist.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/setlists/:id] Erro no DELETE:', error)
    return NextResponse.json(
      { error: 'Erro ao deletar setlist' },
      { status: 500 }
    )
  }
}