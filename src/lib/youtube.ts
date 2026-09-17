import { Track } from './types'

/**
 * Busca vídeos no YouTube e retorna como faixas (sem BPM — precisa de análise de áudio)
 * Útil como fallback quando Spotify e SoundCloud não encontram a faixa
 */
export async function searchYouTubeTracks(query: string, limit = 5): Promise<Track[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return []

  const params = new URLSearchParams({
    part: 'snippet',
    q: `${query} official audio`,
    type: 'video',
    videoCategoryId: '10', // Música
    maxResults: String(limit),
    key: apiKey,
  })

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  if (!res.ok) return []

  const data = await res.json()
  const items = data.items ?? []

  return items.map((item: any): Track => ({
    id: `yt-${item.id.videoId}`,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    bpm: 0,   // YouTube não fornece BPM — análise de áudio necessária
    key: '',
    energy: 5,
    artworkUrl: item.snippet.thumbnails?.medium?.url,
    source: 'youtube',
  }))
}
