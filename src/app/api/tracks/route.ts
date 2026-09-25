import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/tracks
 * Lista faixas do usuário logado.
 * Query params:
 *   - folderId: opcional, filtra por pasta (use "null" para faixas sem pasta)
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const folderId = req.nextUrl.searchParams.get('folderId')

    const where: any = { userId: session.user.id }
    if (folderId === 'null') {
      where.folderId = null
    } else if (folderId) {
      where.folderId = folderId
    }

    const tracks = await prisma.track.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ tracks })
  } catch (error) {
    console.error('[tracks GET] Erro:', error)
    return NextResponse.json({ error: 'Erro ao listar faixas' }, { status: 500 })
  }
}

/**
 * POST /api/tracks
 * Cria ou atualiza uma faixa (upsert quando id é fornecido).
 * Body: { id?, title, artist?, bpm?, key?, energy?, durationSec?, folderId?, segments?, fileHash? }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, title, artist, bpm, key, energy, durationSec, folderId, segments, fileHash } = body

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title é obrigatório' }, { status: 400 })
    }

    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId: session.user.id },
      })
      if (!folder) {
        return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })
      }
    }

    // 🔧 UPSERT: cria se não existe, atualiza se existe (evita race condition)
    const track = id
      ? await prisma.track.upsert({
          where: { id },
          update: {
            title,
            artist: artist ?? '',
            bpm: bpm ?? 0,
            key: key ?? '',
            energy: energy ?? 7,
            durationSec: durationSec ?? 0,
            segments: segments ?? undefined,
            fileHash: fileHash ?? null,
          },
          create: {
            id,
            userId: session.user.id,
            title,
            artist: artist ?? '',
            bpm: bpm ?? 0,
            key: key ?? '',
            energy: energy ?? 7,
            durationSec: durationSec ?? 0,
            folderId: folderId ?? null,
            segments: segments ?? undefined,
            fileHash: fileHash ?? null,
          },
        })
      : await prisma.track.create({
          data: {
            userId: session.user.id,
            title,
            artist: artist ?? '',
            bpm: bpm ?? 0,
            key: key ?? '',
            energy: energy ?? 7,
            durationSec: durationSec ?? 0,
            firstBeatSec: body.firstBeatSec ?? 0,
            folderId: folderId ?? null,
            segments: segments ?? undefined,
            fileHash: fileHash ?? null,
          },
        })

    return NextResponse.json({ track }, { status: 201 })
  } catch (error) {
    console.error('[tracks POST] Erro:', error)
    return NextResponse.json({ error: 'Erro ao criar faixa' }, { status: 500 })
  }
}

/**
 * PATCH /api/tracks
 * Atualiza uma faixa existente OU cria se não existir (upsert).
 * Body: { id, title?, artist?, bpm?, key?, energy?, durationSec?, folderId?, segments? }
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 })
    }

    // Se folderId veio, confirma que a pasta pertence ao usuário (ou é null)
    if (updates.folderId !== undefined && updates.folderId !== null) {
      const folder = await prisma.folder.findFirst({
        where: { id: updates.folderId, userId: session.user.id },
      })
      if (!folder) {
        return NextResponse.json({ error: 'Pasta não encontrada' }, { status: 404 })
      }
    }

    // 🔧 UPSERT: se a faixa não existe (race condition), cria agora
    const track = await prisma.track.upsert({
      where: { id },
      update: updates,
      create: {
        id,
        userId: session.user.id,
        title: updates.title ?? 'Sem título',
        artist: updates.artist ?? '',
        bpm: updates.bpm ?? 0,
        key: updates.key ?? '',
        energy: updates.energy ?? 7,
        durationSec: updates.durationSec ?? 0,
        firstBeatSec: updates.firstBeatSec ?? 0,   // 🆕
        segments: updates.segments ?? undefined,
      },
    })

    return NextResponse.json({ track })
  } catch (error) {
    console.error('[tracks PATCH] Erro:', error)
    return NextResponse.json({ error: 'Erro ao atualizar faixa' }, { status: 500 })
  }
}

/**
 * DELETE /api/tracks?id=xxx
 * Deleta uma faixa.
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

    const existing = await prisma.track.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Faixa não encontrada' }, { status: 404 })
    }

    await prisma.track.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[tracks DELETE] Erro:', error)
    return NextResponse.json({ error: 'Erro ao deletar faixa' }, { status: 500 })
  }
}