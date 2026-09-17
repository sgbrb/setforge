import { SpotifyAudioFeatures, SpotifyTrack, Track } from './types'
import { spotifyKeyToName, spotifyEnergyToScale } from './music-utils'

let cachedToken: string | null = null
let tokenExpiresAt = 0

/**
 * Obtém token de acesso via Client Credentials (sem login do usuário)
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    throw new Error(`Spotify auth failed: ${res.status}`)
  }

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

/**
 * Busca faixas no Spotify por texto
 */
export async function searchSpotifyTracks(query: string, limit = 8): Promise<SpotifyTrack[]> {
  const token = await getAccessToken()
  const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit), market: 'BR' })

  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error(`Spotify search failed: ${res.status}`)
  const data = await res.json()
  return data.tracks.items as SpotifyTrack[]
}

/**
 * Busca audio features (BPM, tom, energia) de uma ou mais faixas
 */
export async function getAudioFeatures(trackIds: string[]): Promise<SpotifyAudioFeatures[]> {
  const token = await getAccessToken()
  const ids = trackIds.join(',')

  const res = await fetch(`https://api.spotify.com/v1/audio-features?ids=${ids}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error(`Spotify audio features failed: ${res.status}`)
  const data = await res.json()
  return data.audio_features as SpotifyAudioFeatures[]
}

/**
 * Busca e retorna faixas completas (metadados + audio features) em uma só chamada
 */
export async function searchTracksWithFeatures(query: string, limit = 6): Promise<Track[]> {
  const spotifyTracks = await searchSpotifyTracks(query, limit)
  if (!spotifyTracks.length) return []

  const ids = spotifyTracks.map(t => t.id)
  const features = await getAudioFeatures(ids)

  return spotifyTracks.map((track, i): Track => {
    const feat = features[i]
    return {
      id: `spotify-${track.id}`,
      spotifyId: track.id,
      title: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      bpm: feat ? Math.round(feat.tempo) : 0,
      key: feat ? spotifyKeyToName(feat.key, feat.mode) : '',
      energy: feat ? spotifyEnergyToScale(feat.energy) : 5,
      danceability: feat?.danceability,
      durationMs: track.duration_ms,
      previewUrl: track.preview_url ?? undefined,
      artworkUrl: track.album.images[0]?.url,
      source: 'spotify',
    }
  })
}
