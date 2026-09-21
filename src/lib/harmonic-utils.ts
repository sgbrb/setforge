import { Track } from './types'

/**
 * Roda de Camelot — mapeamento de compatibilidade harmônica
 * Regras:
 * - Mesmo código: match perfeito (100)
 * - Números adjacentes, mesma letra: muito suave (90)
 * - Mesmo número, letra diferente: muda humor (85)
 * - Números adjacentes, letras diferentes: funciona com tensão (70)
 */
export function getCamelotCompatibility(keyA: string, keyB: string): number {
  if (!keyA || !keyB) return 50

  const a = keyA.toUpperCase().trim()
  const b = keyB.toUpperCase().trim()

  // Match perfeito
  if (a === b) return 100

  const numA = parseInt(a.slice(0, -1), 10)
  const letterA = a.slice(-1)
  const numB = parseInt(b.slice(0, -1), 10)
  const letterB = b.slice(-1)

  // Validação
  if (isNaN(numA) || isNaN(numB)) return 50

  // Mesmo número, letra diferente (relativa maior/menor)
  if (numA === numB && letterA !== letterB) return 85

  const diff = Math.abs(numA - numB)
  const isAdjacent = diff === 1 || diff === 11 // 12→1 é adjacente

  // Números adjacentes, mesma letra
  if (isAdjacent && letterA === letterB) return 90

  // Números adjacentes, letras diferentes
  if (isAdjacent && letterA !== letterB) return 70

  return 50
}

/**
 * Compatibilidade de BPM
 * - ≤3 BPM: perfeito (100)
 * - ≤6 BPM: bom (80)
 * - ≤10 BPM: aceitável (60)
 * - >10 BPM: difícil (30)
 */
export function getBpmCompatibility(bpmA: number, bpmB: number): number {
  if (!bpmA || !bpmB) return 50

  const diff = Math.abs(bpmA - bpmB)

  if (diff <= 3) return 100
  if (diff <= 6) return 80
  if (diff <= 10) return 60
  return 30
}

/**
 * Score combinado de transição (0-100)
 * Peso: 60% Camelot, 40% BPM
 */
export function getTransitionScore(trackA: Track, trackB: Track): number {
  const camelot = getCamelotCompatibility(trackA.key, trackB.key)
  const bpm = getBpmCompatibility(trackA.bpm, trackB.bpm)

  return Math.round(camelot * 0.6 + bpm * 0.4)
}

/**
 * Encontra faixas compatíveis com uma referência
 * Retorna as faixas com score >= minScore, ordenadas por score
 */
export function findCompatibleTracks(
  reference: Track,
  library: Track[],
  minScore: number = 70
): Array<{ track: Track; score: number }> {
  return library
    .filter(t => t.id !== reference.id)
    .map(track => ({
      track,
      score: getTransitionScore(reference, track),
    }))
    .filter(item => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
}