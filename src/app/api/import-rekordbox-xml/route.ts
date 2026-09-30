import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { parseRekordboxXml, filterAudioTracks } from '@/lib/rekordbox-import'

export const runtime = 'nodejs'
export const maxDuration = 300

const XML_PATH = path.join(process.cwd(), 'rekordbox-full.xml')

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    // ============================================================
    // 1. LÊ O XML
    // ============================================================
    console.log(`📖 Lendo XML: ${XML_PATH}`)
    const xmlContent = await readFile(XML_PATH, 'utf-8')
    console.log(`   Tamanho: ${(xmlContent.length / 1024 / 1024).toFixed(2)} MB`)

    // ============================================================
    // 2. PARSEIA + FILTRA
    // ============================================================
    const collection = parseRekordboxXml(xmlContent)
    console.log(`   Entries: ${collection.entries}`)
    console.log(`   Tracks:  ${collection.tracks.length}`)

    const validTracks = filterAudioTracks(collection.tracks, 60)
    console.log(`   Válidas: ${validTracks.length}`)

    if (validTracks.length === 0) {
      return NextResponse.json({ error: 'Nenhuma faixa válida' }, { status: 400 })
    }

    // ============================================================
    // 3. BUSCA USUÁRIO
    // ============================================================
    const user = await prisma.user.findFirst()
    if (!user) {
      return NextResponse.json({ error: 'Nenhum usuário no banco' }, { status: 400 })
    }
    console.log(`👤 Usuário: ${user.email}`)

    // ============================================================
    // 4. LIMPA O QUE JÁ EXISTE (idempotente)
    // ============================================================
    const deleted = await prisma.track.deleteMany({ where: { userId: user.id } })
    console.log(`🗑️ Deletadas (pré-import): ${deleted.count}`)

    // ============================================================
    // 5. BATCH INSERT com createMany (10-50x mais rápido)
    // ============================================================
    const BATCH_SIZE = 1000
    let created = 0

    for (let i = 0; i < validTracks.length; i += BATCH_SIZE) {
      const batch = validTracks.slice(i, i + BATCH_SIZE)

      const data = batch.map(t => ({
        userId: user.id,
        title: t.name,
        artist: t.artist,
        bpm: t.bpm,
        key: t.key,
        durationSec: t.durationSec,
        firstBeatSec: t.firstBeatSec,
        energy: 7,
        fileHash: t.trackId, // TrackID do Rekordbox
      }))

      const result = await prisma.track.createMany({
        data,
        skipDuplicates: true,
      })

      created += result.count
      console.log(`   Lote ${Math.floor(i / BATCH_SIZE) + 1}: +${result.count} (total: ${created})`)
    }

    // ============================================================
    // 6. RESULTADO
    // ============================================================
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`✅ Import concluído em ${elapsed}s (${created} faixas)`)

    return NextResponse.json({
      success: true,
      elapsedSec: Number(elapsed),
      entries: collection.entries,
      parsed: collection.tracks.length,
      valid: validTracks.length,
      created,
      userId: user.id,
    })
  } catch (error: any) {
    console.error('❌ Erro no import:', error)
    return NextResponse.json(
      { error: error.message || 'Erro desconhecido' },
      { status: 500 }
    )
  }
}