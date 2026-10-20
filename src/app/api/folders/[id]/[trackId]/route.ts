import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * DELETE /api/folders/[id]/[trackId]
 * Remove uma faixa de uma pasta virtual.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; trackId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id, trackId } = params

  try {
    await prisma.folderTrack.deleteMany({
      where: { folderId: id, trackId },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[folders/[id]/[trackId] DELETE] Erro:', error)
    return NextResponse.json({ error: 'Erro ao remover faixa' }, { status: 500 })
  }
}