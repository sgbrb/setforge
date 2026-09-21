declare module 'music-tempo' {
  interface MusicTempoOptions {
    tempo?: number
    expiryTime?: number
    maxBeatInterval?: number
    minBeatInterval?: number
  }

  interface MusicTempoResult {
    tempo: number
    beats: number[]
  }

  class MusicTempo {
    constructor(audioData: Float32Array | number[], options?: MusicTempoOptions)
    tempo: number
    beats: number[]
  }

  export = MusicTempo
}