import { SoundCloudTrack, Track } from './types'

const BASE_URL = 'https://api.soundcloud.com'

/**
 * Busca faixas no SoundCloud por texto
 * Nota: SoundCloud requer aprovação de API — use o client_id do seu app
 */
export async function searchSoundCloudTracks(query: string, limit = 6): Promise<Track[]> {
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID
  if (!clientId) return []

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    client_id: clientId,
  })

  const res = await fetch(`${BASE_URL}/tracks?${params}`)
  if (!res.ok) return []

  const tracks = (await res.json()) as SoundCloudTrack[]

  return tracks.map((t): Track => ({
    id: `sc-${t.id}`,
    title: t.title,
    artist: t.user.username,
    bpm: t.bpm ?? 0,
    key: '',
    energy: 5, // SoundCloud não fornece energia — será estimado pela IA
    genre: t.genre,
    artworkUrl: t.artwork_url ?? undefined,
    durationMs: t.duration,
    source: 'soundcloud',
  }))
}
