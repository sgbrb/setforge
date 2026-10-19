import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/tracks/check-hash?hash=...
 *
 * Verifica se já existe uma faixa com aquele hash SHA-256.
 * Usado pelo TrackUpload pra evitar duplicatas.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const hash = req.nextUrl.searchParams.get('hash')
    if (!hash) {
      return NextResponse.json({ error: 'hash obrigatório' }, { status: 400 })
    }

    const existing = await prisma.track.findFirst({
      where: { fileHash: hash, userId: session.user.id },
      select: { id: true, title: true },
    })

    return NextResponse.json({
      exists: !!existing,
      title: existing?.title ?? null,
      id: existing?.id ?? null,
    })
  } catch (error) {
    console.error('[api/tracks/check-hash] Erro:', error)
    return NextResponse.json({ error: 'Erro ao verificar hash' }, { status: 500 })
  }
}