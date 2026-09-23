import { Track } from './types'
import { getTransitionScore } from './harmonic-utils'

/**
 * Calcula a ordem ótima de um conjunto de faixas usando algoritmo guloso (greedy).
 */
export function computeOptimalOrder(
  tracks: Track[],
  startLow: boolean = true
): Track[] {
  if (tracks.length <= 1) return [...tracks]

  const remaining = [...tracks]

  if (startLow) {
    remaining.sort((a, b) => {
      if (a.energy !== b.energy) return a.energy - b.energy
      return (a.bpm || 0) - (b.bpm || 0)
    })
  } else {
    remaining.sort((a, b) => {
      if (a.energy !== b.energy) return b.energy - a.energy
      return (b.bpm || 0) - (a.bpm || 0)
    })
  }

  const ordered: Track[] = [remaining.shift()!]

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1]

    let bestIdx = 0
    let bestScore = -1

    for (let i = 0; i < remaining.length; i++) {
      const score = getTransitionScore(last, remaining[i])
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }

    ordered.push(remaining.splice(bestIdx, 1)[0])
  }

  return ordered
}

/**
 * Calcula o score médio de uma ordem de faixas (0-100).
 */
export function scoreOrder(tracks: Track[]): number {
  if (tracks.length <= 1) return 100
  let total = 0
  for (let i = 0; i < tracks.length - 1; i++) {
    total += getTransitionScore(tracks[i], tracks[i + 1])
  }
  return Math.round(total / (tracks.length - 1))
}

/**
 * Calcula o score individual de cada transição de uma ordem.
 */
export function scoreTransitions(tracks: Track[]): Array<{
  from: Track
  to: Track
  score: number
}> {
  const result: Array<{ from: Track; to: Track; score: number }> = []
  for (let i = 0; i < tracks.length - 1; i++) {
    result.push({
      from: tracks[i],
      to: tracks[i + 1],
      score: getTransitionScore(tracks[i], tracks[i + 1]),
    })
  }
  return result
}

/**
 * Retorna uma matriz NxN com o score entre cada par de faixas.
 * `matrix[i][j]` = score da transição de `tracks[i]` para `tracks[j]`.
 * Diagonal = 100.
 */
export function buildCompatibilityMatrix(tracks: Track[]): number[][] {
  const n = tracks.length
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 100
    for (let j = i + 1; j < n; j++) {
      const score = getTransitionScore(tracks[i], tracks[j])
      matrix[i][j] = score
      matrix[j][i] = score
    }
  }

  return matrix
}