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
/**
 * PATCH /api/setlists/:id
 * Atualiza campos do setlist (ex: folderId).
 * Body: { folderId?: string | null }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = params
    const body = await req.json()
    const { folderId } = body

    // Confirma que o setlist é do usuário
    const setlist = await prisma.setlist.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!setlist) {
      return NextResponse.json({ error: 'Setlist não encontrado' }, { status: 404 })
    }

    // Se folderId foi passado, valida a pasta
    if (folderId !== undefined && folderId !== null) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId: session.user.id },
      })
      if (!folder) {
        return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })
      }
    }

    const updated = await prisma.setlist.update({
      where: { id },
      data: {
        ...(folderId !== undefined ? { folderId } : {}),
        ...(name !== undefined ? { name } : {}), 
      },
    })

    return NextResponse.json({ setlist: updated })
  } catch (error) {
    console.error('[api/setlists/:id] Erro no PATCH:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar setlist' },
      { status: 500 }
    )
  }
}