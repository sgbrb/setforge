// Mapa de notas musicais (índice Spotify → nome da nota)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/**
 * Converte o índice de tom do Spotify para nome legível
 * key: 0–11, mode: 0 = menor, 1 = maior
 */
export function spotifyKeyToName(key: number, mode: number): string {
  if (key === -1) return 'Desconhecido'
  const note = NOTE_NAMES[key]
  return mode === 0 ? `${note}m` : note
}

/**
 * Converte energia do Spotify (0–1) para escala 1–10
 */
export function spotifyEnergyToScale(energy: number): number {
  return Math.round(energy * 9) + 1
}

/**
 * Compatibilidade de BPM entre duas faixas
 * Retorna true se a transição for suave (≤ 8 BPM de diferença)
 */
export function isBpmCompatible(bpm1: number, bpm2: number, tolerance = 8): boolean {
  return Math.abs(bpm1 - bpm2) <= tolerance
}

/**
 * Calcula diferença de BPM
 */
export function bpmDiff(bpm1: number, bpm2: number): number {
  return Math.abs(bpm1 - bpm2)
}

/**
 * Tons harmonicamente compatíveis (Camelot Wheel simplificado)
 */
const COMPATIBLE_KEYS: Record<string, string[]> = {
  'Am': ['Am', 'C', 'Em', 'Dm', 'Gm'],
  'C':  ['C', 'Am', 'F', 'G', 'Em'],
  'Dm': ['Dm', 'F', 'Am', 'Gm', 'Cm'],
  'F':  ['F', 'Dm', 'C', 'Bb', 'Am'],
  'Em': ['Em', 'G', 'Am', 'Bm', 'Cm'],
  'G':  ['G', 'Em', 'C', 'D', 'Bm'],
  'Bm': ['Bm', 'D', 'Em', 'F#m', 'G'],
  'D':  ['D', 'Bm', 'G', 'A', 'F#m'],
}

export function areKeysCompatible(key1: string, key2: string): boolean {
  const compatible = COMPATIBLE_KEYS[key1] || []
  return compatible.includes(key2)
}
