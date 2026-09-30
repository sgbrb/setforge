import { XMLParser } from 'fast-xml-parser'

// ============================================================
// TIPOS
// ============================================================

export interface RekordboxTrack {
  trackId: string
  name: string
  artist: string
  bpm: number
  key: string            // Camelot (8A, 4B, etc) — já convertido
  tonalityRaw: string    // Musical original (F#m, Gm, etc) — debug
  durationSec: number    // segundos (TotalTime)
  firstBeatSec: number   // offset do 1º beat (Inizio do 1º TEMPO)
  location: string       // path decodificado (C:\Users\...)
  dateAdded: string
  kind: string           // "Ficheiro MP3", "Ficheiro WAV"
  size: number
  sampleRate: number
  bitRate: number
}

export interface RekordboxCollection {
  entries: number
  tracks: RekordboxTrack[]
}

// ============================================================
// MAPA CAMELOT (portado do key_converter.py)
// ============================================================

const CAMELOT_MAP: Record<string, string> = {
  // MAJOR
  'C major': '8B',
  'C# major': '3B',
  'Db major': '3B',
  'D major': '10B',
  'D# major': '5B',
  'Eb major': '5B',
  'E major': '12B',
  'F major': '7B',
  'F# major': '2B',
  'Gb major': '2B',
  'G major': '9B',
  'G# major': '4B',
  'Ab major': '4B',
  'A major': '11B',
  'A# major': '6B',
  'Bb major': '6B',
  'B major': '1B',
  'Cb major': '1B',
  // MINOR
  'C minor': '5A',
  'C# minor': '12A',
  'Db minor': '12A',
  'D minor': '7A',
  'D# minor': '2A',
  'Eb minor': '2A',
  'E minor': '9A',
  'F minor': '4A',
  'F# minor': '11A',
  'Gb minor': '11A',
  'G minor': '6A',
  'G# minor': '1A',
  'Ab minor': '1A',
  'A minor': '8A',
  'A# minor': '3A',
  'Bb minor': '3A',
  'B minor': '10A',
  'Cb minor': '10A',
}

// ============================================================
// CONVERSÃO MUSICAL → CAMELOT
// ============================================================

/**
 * Normaliza a notação musical do Rekordbox pra "Note mode".
 * Ex: "F#m" → "F# minor"
 *     "Gm"  → "G minor"
 *     "F"   → "F major"
 *     "Abm" → "Ab minor"
 */
function normalizeTonality(raw: string): string {
  const s = raw.trim()
  if (!s) return ''

  // Se já tem espaço (formato "F# minor"), devolve
  if (s.includes(' ')) return s

  // Se termina com "m" minúsculo → minor
  if (s.endsWith('m')) {
    return `${s.slice(0, -1)} minor`
  }

  // Senão → major
  return `${s} major`
}

/**
 * Converte a tonality raw do Rekordbox em Camelot.
 * Ex: "F#m" → "11A"
 * Retorna '' se não conseguir.
 */
export function tonalityToCamelot(raw: string): string {
  const normalized = normalizeTonality(raw)
  return CAMELOT_MAP[normalized] || ''
}

// ============================================================
// PARSER
// ============================================================

/**
 * Decodifica um Location do Rekordbox pra path do Windows.
 * Ex: file://localhost/C:/Users/bruno/Downloads/musica.mp3
 *   → C:\Users\bruno\Downloads\musica.mp3
 */
function decodeLocation(location: string): string {
  if (!location) return ''

  let path = location

  // Remove prefixo "file://localhost/"
  path = path.replace(/^file:\/\/localhost\//i, '')
  path = path.replace(/^file:\/\//i, '')

  // Decodifica URL encoding (%20 → espaço, %C3%B8 → ø, etc)
  try {
    path = decodeURIComponent(path)
  } catch {
    // Se falhar, mantém o original
  }

  // Converte / pra \ (Windows)
  path = path.replace(/\//g, '\\')

  // Adiciona "C:" se faltar
  if (!path.match(/^[A-Za-z]:/)) {
    path = 'C:' + path
  }

  return path
}

/**
 * Pega o primeiro TEMPO pra extrair o offset do 1º beat.
 */
function extractFirstBeatSec(trackNode: any): number {
  const tempos = trackNode.TEMPO
  if (!tempos) return 0

  // Se for array, pega o primeiro
  const first = Array.isArray(tempos) ? tempos[0] : tempos
  const inizio = Number(first?.['@_Inizio'])
  return isNaN(inizio) ? 0 : inizio
}

/**
 * Faz o parsing do XML do Rekordbox e retorna a coleção.
 */
export function parseRekordboxXml(xmlContent: string): RekordboxCollection {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
    isArray: (name) => name === 'TRACK', // força TRACK a ser sempre array
  })

  const parsed = parser.parse(xmlContent)

  // Navega até a COLLECTION
  const collection = parsed?.DJ_PLAYLISTS?.COLLECTION
  if (!collection) {
    throw new Error('XML inválido: COLLECTION não encontrada')
  }

  const entries = Number(collection['@_Entries']) || 0
  let rawTracks = collection.TRACK || []

  if (!Array.isArray(rawTracks)) {
    rawTracks = [rawTracks]
  }

  const tracks: RekordboxTrack[] = rawTracks.map((t: any) => {
    const tonalityRaw = String(t['@_Tonality'] || '')
    return {
      trackId: String(t['@_TrackID'] || ''),
      name: String(t['@_Name'] || ''),
      artist: String(t['@_Artist'] || ''),
      bpm: Math.round(Number(t['@_AverageBpm']) || 0),
      key: tonalityToCamelot(tonalityRaw),
      tonalityRaw,
      durationSec: Number(t['@_TotalTime']) || 0,
      firstBeatSec: extractFirstBeatSec(t),
      location: decodeLocation(String(t['@_Location'] || '')),
      dateAdded: String(t['@_DateAdded'] || ''),
      kind: String(t['@_Kind'] || ''),
      size: Number(t['@_Size']) || 0,
      sampleRate: Number(t['@_SampleRate']) || 0,
      bitRate: Number(t['@_BitRate']) || 0,
    }
  })

  return { entries, tracks }
}

/**
 * Filtra apenas faixas de áudio válidas.
 */
export function filterAudioTracks(
  tracks: RekordboxTrack[],
  minDurationSec: number = 60
): RekordboxTrack[] {
  return tracks.filter(t => {
    if (t.durationSec < minDurationSec) return false
    if (!t.location) return false
    if (t.bpm <= 0) return false
    return true
  })
}