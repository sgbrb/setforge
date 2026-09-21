import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchYouTubeTracks } from '@/lib/youtube'
import { Track } from '@/lib/types'

// 🔒 Fontes desabilitadas temporariamente:
//
// import { searchTracksWithFeatures } from '@/lib/spotify'
//   → Pendente: requer conta Premium para criar app no Developer Dashboard
//     (contas Free não têm mais acesso à Web API desde 2025).
//
// import { searchBeatportTracks } from '@/lib/beatport'
//   → Pendente: Ator da Apify retorna 0 itens mesmo com token correto,
//     provavelmente bloqueado pelo Cloudflare do Beatport.
//
// import { searchSoundCloudTracks } from '@/lib/soundcloud'
//   → Descartado: API exige Artist Pro e proíbe "DJ apps" nos Termos.

export async function GET(req: NextRequest) {
  // 🔒 Verifica autenticação
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const query = req.nextUrl.searchParams.get('q')
    const sources = req.nextUrl.searchParams.get('sources') ?? 'youtube'

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ error: 'Query muito curta' }, { status: 400 })
    }

    const enabledSources = sources.split(',')
    const results: Track[] = []
    const promises: Promise<Track[]>[] = []

    // 🔒 Spotify (desabilitado)
    // if (enabledSources.includes('spotify')) {
    //   promises.push(
    //     searchTracksWithFeatures(query, 6).catch((err) => {
    //       console.error('[Spotify] erro:', err?.message ?? err)
    //       return []
    //     })
    //   )
    // }

    // 🔒 Beatport (desabilitado)
    // if (enabledSources.includes('beatport')) {
    //   promises.push(
    //     searchBeatportTracks(query, 6).catch((err) => {
    //       console.error('[Beatport] erro:', err?.message ?? err)
    //       return []
    //     })
    //   )
    // }

    // 🔒 SoundCloud (desabilitado)
    // if (enabledSources.includes('soundcloud')) {
    //   promises.push(
    //     searchSoundCloudTracks(query, 4).catch((err) => {
    //       console.error('[SoundCloud] erro:', err?.message ?? err)
    //       return []
    //     })
    //   )
    // }

    // ✅ YouTube (única fonte ativa)
    if (enabledSources.includes('youtube')) {
      promises.push(
        searchYouTubeTracks(query, 6).catch((err) => {
          console.error('[YouTube] erro:', err?.message ?? err)
          return []
        })
      )
    }

    const allResults = await Promise.all(promises)
    allResults.forEach(r => results.push(...r))

    // Deduplica por título+artista
    const seen = new Set<string>()
    const unique = results.filter(t => {
      const key = `${t.title.toLowerCase().slice(0, 20)}-${t.artist.toLowerCase().slice(0, 10)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return NextResponse.json({ tracks: unique, total: unique.length })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Erro na busca' }, { status: 500 })
  }
}