import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFile } from 'fs/promises'
import { prisma } from '@/lib/prisma'
import { parseRekordboxXml, filterAudioTracks } from '@/lib/rekordbox-import'

export const runtime = 'nodejs'
export const maxDuration = 300

// 🆕 Path absoluto (XML tá no Desktop)
const XML_PATH_FALLBACK = 'C:\\Users\\bruno\\OneDrive\\Desktop\\rekordbox-full.xml'

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    // ============================================================
    // 1. LÊ O XML (upload do cliente OU fallback do disco)
    // ============================================================
    let xmlContent: string

    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      // Upload do cliente
      const formData = await req.formData()
      const file = formData.get('xml') as File | null
      if (!file) {
        return NextResponse.json(
          { error: 'Nenhum arquivo XML enviado' },
          { status: 400 }
        )
      }
      xmlContent = await file.text()
      console.log(`📖 XML recebido via upload: ${file.name}`)
    } else {
      // Fallback: lê do disco
      console.log(`📖 Lendo XML do disco: ${XML_PATH_FALLBACK}`)
      xmlContent = await readFile(XML_PATH_FALLBACK, 'utf-8')
    }

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
    // 3. AUTENTICAÇÃO
    // ============================================================
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    console.log(`👤 Usuário: ${session.user.email}`)

    // ============================================================
    // 4. UPSERT em chunks de 100 (preserva as 215 existentes)
    // ============================================================
    const BATCH_SIZE = 500
    let created = 0
    let updated = 0

    for (let i = 0; i < validTracks.length; i += BATCH_SIZE) {
      const batch = validTracks.slice(i, i + BATCH_SIZE)

      const results = await prisma.$transaction(
        batch.map(t => prisma.track.upsert({
          where: { rekordboxId: t.trackId },
          update: {
            title: t.name,
            artist: t.artist || '',
            bpm: Math.round(t.bpm),
            key: t.key || '',                 // ✅ Camelot já convertido
            durationSec: t.durationSec,       // ✅ nome correto
          },
          create: {
            userId: session.user.id,
            rekordboxId: t.trackId,
            title: t.name,
            artist: t.artist || '',
            bpm: Math.round(t.bpm),
            key: t.key || '',                 // ✅ Camelot
            durationSec: t.durationSec,       // ✅ nome correto
            firstBeatSec: 0,
            energy: 7,
            folderId: null,
            segments: undefined,
          },
        }))
      )

      for (const r of results) {
        if (r.createdAt === r.updatedAt) created++
        else updated++
      }

      console.log(`   Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} processadas`)
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
      updated,
      userId: session.user.id,
    })
  } catch (error: any) {
    console.error('❌ Erro no import:', error)
    return NextResponse.json(
      { error: error.message || 'Erro desconhecido' },
      { status: 500 }
    )
  }
}