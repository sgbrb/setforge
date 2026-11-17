import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { setlistId, bpmTarget, energyAvg } = await req.json()
    if (!setlistId) return NextResponse.json({ error: 'ID do setlist obrigatório' }, { status: 400 })

    await prisma.likedSetlist.upsert({
      where: {
        userId_setlistId: {
          userId: session.user.id,
          setlistId: setlistId,
        },
      },
      create: {
        userId: session.user.id,
        setlistId: setlistId,
        bpmTarget: bpmTarget || null,
        energyAvg: energyAvg || null,
      },
      update: {},
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/setlist/like-setlist] Erro:', err)
    return NextResponse.json({ error: 'Erro ao curtir set' }, { status: 500 })
  }
}