import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/folders
 * Lista todas as pastas do usuário logado.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const folders = await prisma.folder.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { tracks: true } },
      },
    })

    return NextResponse.json({ folders })
  } catch (error) {
    console.error('[folders GET] Erro:', error)
    return NextResponse.json({ error: 'Erro ao listar pastas' }, { status: 500 })
  }
}

/**
 * POST /api/folders
 * Cria uma pasta nova.
 * Body: { name: string }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { name } = await req.json()

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const folder = await prisma.folder.create({
      data: {
        name: name.trim(),
        userId: session.user.id,
      },
    })

    return NextResponse.json({ folder }, { status: 201 })
  } catch (error) {
    console.error('[folders POST] Erro:', error)
    return NextResponse.json({ error: 'Erro ao criar pasta' }, { status: 500 })
  }
}

/**
 * PATCH /api/folders
 * Renomeia uma pasta existente.
 * Body: { id: string, name: string }
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { id, name } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 })
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    // Confirma que a pasta pertence ao usuário
    const existing = await prisma.folder.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })
    }

    const folder = await prisma.folder.update({
      where: { id },
      data: { name: name.trim() },
    })

    return NextResponse.json({ folder })
  } catch (error) {
    console.error('[folders PATCH] Erro:', error)
    return NextResponse.json({ error: 'Erro ao renomear pasta' }, { status: 500 })
  }
}

/**
 * DELETE /api/folders?id=xxx
 * Deleta uma pasta. As faixas dentro dela ficam sem pasta (folderId = null).
 */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 })
    }

    // Confirma que a pasta pertence ao usuário
    const folder = await prisma.folder.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!folder) {
      return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })
    }

    await prisma.folder.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[folders DELETE] Erro:', error)
    return NextResponse.json({ error: 'Erro ao deletar pasta' }, { status: 500 })
  }
}