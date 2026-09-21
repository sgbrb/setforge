import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchTracksWithFeatures, getAudioFeatures } from '@/lib/spotify'

export async function GET(req: NextRequest) {
  // 🔒 Verifica autenticação
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const action = req.nextUrl.searchParams.get('action')

    if (action === 'search') {
      const q = req.nextUrl.searchParams.get('q')
      if (!q) return NextResponse.json({ error: 'Parâmetro q obrigatório' }, { status: 400 })
      const tracks = await searchTracksWithFeatures(q)
      return NextResponse.json({ tracks })
    }

    if (action === 'features') {
      const ids = req.nextUrl.searchParams.get('ids')?.split(',') ?? []
      if (!ids.length) return NextResponse.json({ error: 'Parâmetro ids obrigatório' }, { status: 400 })
      const features = await getAudioFeatures(ids)
      return NextResponse.json({ features })
    }

    return NextResponse.json({ error: 'Action inválida. Use: search | features' }, { status: 400 })
  } catch (error) {
    console.error('Spotify error:', error)
    return NextResponse.json({ error: 'Erro na API do Spotify' }, { status: 500 })
  }
}