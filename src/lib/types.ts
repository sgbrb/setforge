export interface Track {
  id: string
  folderId?: string | null       // 🆕 pasta à qual pertence (null = sem pasta)
  title: string
  artist: string
  bpm: number
  key: string
  energy: number       // 1–10
  genre?: string
  danceability?: number // 0–1 (Spotify)
  source?: 'spotify' | 'soundcloud' | 'youtube' | 'manual' | 'upload' | 'beatport'
  firstBeatSec?: number   // 🆕 offset do primeiro beat (segundos)
  spotifyId?: string
  previewUrl?: string
  artworkUrl?: string
  durationMs?: number
}

export interface Folder {
  id: string
  name: string
  trackCount: number
  createdAt: string
}

export interface SetConfig {
  eventType: string
  duration: string
  energyCurve: string
  audience: string
}

export interface SetlistTrack extends Track {
  position: number
  transitionNote?: string
}

export interface GeneratedSetlist {
  setlist: SetlistTrack[]
  totalDuration: string
  analysis: string
  peakMoment: string
  djTip: string
}

export interface SpotifyAudioFeatures {
  tempo: number        // BPM
  key: number          // 0–11 (C, C#, D, ...)
  mode: number         // 0 = minor, 1 = major
  energy: number       // 0–1
  danceability: number // 0–1
  valence: number      // 0–1 (positividade)
  duration_ms: number
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: { name: string }[]
  album: { images: { url: string }[] }
  preview_url: string | null
  duration_ms: number
}

export interface SoundCloudTrack {
  id: number
  title: string
  user: { username: string }
  bpm: number | null
  genre: string
  artwork_url: string | null
  duration: number
  stream_url?: string
}