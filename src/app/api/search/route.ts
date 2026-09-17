import { NextRequest, NextResponse } from 'next/server'
import { searchTracksWithFeatures } from '@/lib/spotify'
import { searchSoundCloudTracks } from '@/lib/soundcloud'
import { searchYouTubeTracks } from '@/lib/youtube'
import { Track } from '@/lib/types'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  const sources = req.nextUrl.searchParams.get('sources') ?? 'spotify,soundcloud,youtube'

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ error: 'Query muito curta' }, { status: 400 })
  }

  const enabledSources = sources.split(',')
  const results: Track[] = []

  // Busca em paralelo nas fontes habilitadas
  const promises: Promise<Track[]>[] = []

  if (enabledSources.includes('spotify')) {
    promises.push(searchTracksWithFeatures(query, 6).catch(() => []))
  }
  if (enabledSources.includes('soundcloud')) {
    promises.push(searchSoundCloudTracks(query, 4).catch(() => []))
  }
  if (enabledSources.includes('youtube')) {
    promises.push(searchYouTubeTracks(query, 3).catch(() => []))
  }

  const allResults = await Promise.all(promises)
  allResults.forEach(r => results.push(...r))

  // Deduplicação por título+artista similar
  const seen = new Set<string>()
  const unique = results.filter(t => {
    const key = `${t.title.toLowerCase().slice(0, 20)}-${t.artist.toLowerCase().slice(0, 10)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return NextResponse.json({ tracks: unique, total: unique.length })
}
