import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = params

  const folder = await prisma.folder.findFirst({
    where: { id, userId: session.user.id },
    include: {
      virtualTracks: {
        orderBy: { position: 'asc' },
        include: { track: true },
      },
    },
  })

  if (!folder) {
    return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })
  }

  return NextResponse.json({
    folder: {
      id: folder.id,
      name: folder.name,
      isVirtual: folder.isVirtual,
    },
    tracks: folder.virtualTracks.map(ft => ft.track),
  })
}
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = params
  const { trackIds } = await req.json()

  if (!Array.isArray(trackIds) || trackIds.length === 0) {
    return NextResponse.json({ error: 'trackIds é obrigatório' }, { status: 400 })
  }

  // Verifica se a pasta é virtual
  const folder = await prisma.folder.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!folder) {
    return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })
  }

  if (!folder.isVirtual) {
    return NextResponse.json({ error: 'Essa pasta não é virtual' }, { status: 400 })
  }

  // Cria os FolderTrack
  const result = await prisma.folderTrack.createMany({
    data: trackIds.map((trackId: string, i: number) => ({
      folderId: id,
      trackId,
      position: i,
    })),
    skipDuplicates: true,
  })

  return NextResponse.json({ added: result.count })
}