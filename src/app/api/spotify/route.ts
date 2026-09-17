import { NextRequest, NextResponse } from 'next/server'
import { searchTracksWithFeatures, getAudioFeatures } from '@/lib/spotify'

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')

  // GET /api/spotify?action=search&q=nome+da+musica
  if (action === 'search') {
    const q = req.nextUrl.searchParams.get('q')
    if (!q) return NextResponse.json({ error: 'Parâmetro q obrigatório' }, { status: 400 })
    const tracks = await searchTracksWithFeatures(q)
    return NextResponse.json({ tracks })
  }

  // GET /api/spotify?action=features&ids=id1,id2,id3
  if (action === 'features') {
    const ids = req.nextUrl.searchParams.get('ids')?.split(',') ?? []
    if (!ids.length) return NextResponse.json({ error: 'Parâmetro ids obrigatório' }, { status: 400 })
    const features = await getAudioFeatures(ids)
    return NextResponse.json({ features })
  }

  return NextResponse.json({ error: 'Action inválida. Use: search | features' }, { status: 400 })
}
