// ============================================================
// TSP — Seleção inteligente de N faixas de uma biblioteca grande
// ============================================================
//
// Referência bibliográfica:
//   D. S. Johnson, L. A. McGeoch — "The Traveling Salesman Problem:
//   A Case Study in Local Optimization" (1997)
//   Applegate, Bixby, Chvátal, Cook — "The Traveling Salesman Problem:
//   A Computational Study" (2006)
//
// Algoritmo:
//   1. Pré-filtro (BPM ± range + Camelot estrito)
//   2. Construção greedy multi-start (100 sementes)
//   3. 2-opt (troca 2 arestas)
//   4. Or-opt (move blocos de 1-3 faixas)
//
// Objetivo: ~5% do ótimo global em < 5s para 9.378 faixas.
// ============================================================

import { Track } from './types'
import { getTransitionScore } from './harmonic-utils'

export interface TspOptions {
  count: number
  bpmTarget?: number | null
  bpmRange?: number
  minCamelotScore?: number
  seed?: number
  multiStart?: number
  twoOptPasses?: number
}

export interface TspResult {
  tracks: Track[]
  averageScore: number
  worstScore: number
  candidates: number
  elapsedMs: number
  seed: number
}

// ============================================================
// PRNG determinístico (Mulberry32)
// ============================================================

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ============================================================
// FASE 1 — PRÉ-FILTRO
// ============================================================

/**
 * Pré-filtro de candidatas.
 *
 * Estratégia (sem achismo):
 *   1. Filtra por BPM (± range)
 *   2. Encontra as N keys "núcleo" (mais comuns no pool)
 *   3. Mantém faixas cujas keys sejam núcleo OU vizinhas
 */
export function filterCandidates(
  library: Track[],
  bpmTarget: number | null,
  bpmRange: number,
  minCamelotScore: number
): Track[] {
  // 1. Filtro de BPM
  let pool = library.filter(t => t.bpm > 0)

  if (bpmTarget !== null) {
    pool = pool.filter(t => Math.abs(t.bpm - bpmTarget) <= bpmRange)
  }

  if (pool.length === 0) return []

  // 2. Conta frequência de cada key
  const keyCounts = new Map<string, number>()
  for (const t of pool) {
    if (!t.key) continue
    keyCounts.set(t.key, (keyCounts.get(t.key) || 0) + 1)
  }

  // 3. Eleição das keys "núcleo" (top 8, mínimo 2% do pool)
  const minCount = Math.max(5, Math.floor(pool.length * 0.02))
  const coreKeys = [...keyCounts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key]) => key)

  if (coreKeys.length === 0) return pool

  // 4. Expande o núcleo pra incluir vizinhas (adjacente + relativa)
  const allowedKeys = new Set<string>()

  for (const k of coreKeys) {
    allowedKeys.add(k)

    const num = parseInt(k.slice(0, -1), 10)
    const letter = k.slice(-1)

    if (isNaN(num)) continue

    // Relativa
    const relativeLetter = letter === 'A' ? 'B' : 'A'
    allowedKeys.add(`${num}${relativeLetter}`)

    // Adjacentes
    const prev = num === 1 ? 12 : num - 1
    const next = num === 12 ? 1 : num + 1
    allowedKeys.add(`${prev}${letter}`)
    allowedKeys.add(`${next}${letter}`)
  }

  // 5. Filtra pool pelas keys permitidas
  return pool.filter(t => allowedKeys.has(t.key))
}

// ============================================================
// FASE 2 — CONSTRUÇÃO GREEDY (nearest neighbor)
// ============================================================

// ============================================================
// FASE 1.5 — DIVERSIDADE (Regra 3)
// ============================================================

/**
 * Filtra o pool pra garantir diversidade de famílias (1-12).
 *
 * Regra rígida:
 *   - Máx N faixas por key (A ou B) da família
 *   - N = max(1, floor(setSize / 15))
 *   - Sem +1 (nem key individual nem família podem estourar)
 *
 * Ex: setSize=30 → N=2 → máx 2x 12A + 2x 12B = 4 faixas da família 12
 */
export function diversifyPool(
  pool: Track[],
  setSize: number
): Track[] {

  const maxPorLetra = Math.max(1, Math.floor(setSize / 15))

  // Agrupa por família (só o número, ignora A/B)
  const byFamilia = new Map<string, Track[]>()
  for (const t of pool) {
    const m = (t.key || '').match(/^(\d+)/)
    if (!m) continue
    const fam = m[1]
    if (!byFamilia.has(fam)) byFamilia.set(fam, [])
    byFamilia.get(fam)!.push(t)
  }

  const result: Track[] = []

    for (const tracks of byFamilia.values()) {
    // Separa A e B
    const a: Track[] = []
    const b: Track[] = []
    for (const t of tracks) {
      if (t.key.endsWith('A')) a.push(t)
      else if (t.key.endsWith('B')) b.push(t)
    }

        const useA = a.slice(0, maxPorLetra)
    const useB = b.slice(0, maxPorLetra)
    result.push(...useA, ...useB)
  }

  return result
}

function nearestNeighbor(
  pool: Track[],
  startIdx: number,
  count: number
): Track[] {
  if (pool.length === 0) return []
  if (pool.length <= count) return [...pool]

  const remaining = pool.filter((_, i) => i !== startIdx)
  const result: Track[] = [pool[startIdx]]

  while (result.length < count && remaining.length > 0) {
    const last = result[result.length - 1]
    let bestIdx = 0
    let bestScore = -1

    for (let i = 0; i < remaining.length; i++) {
      const score = getTransitionScore(last, remaining[i])
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }

    result.push(remaining[bestIdx])
    remaining.splice(bestIdx, 1)
  }

  return result
}

// ============================================================
// FASE 3 — REFINAMENTO: 2-OPT
// ============================================================

function scoreOrder(tracks: Track[]): number {
  if (tracks.length <= 1) return 0
  let total = 0
  for (let i = 0; i < tracks.length - 1; i++) {
    total += getTransitionScore(tracks[i], tracks[i + 1])
  }
  return total
}

function twoOpt(tracks: Track[], passes: number): Track[] {
  const n = tracks.length
  if (n < 4) return tracks

  let best = [...tracks]
  let bestScore = scoreOrder(best)

  for (let pass = 0; pass < passes; pass++) {
    let improved = false

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 2; j < n; j++) {
        const candidate = [
          ...best.slice(0, i + 1),
          ...best.slice(i + 1, j + 1).reverse(),
          ...best.slice(j + 1),
        ]
        const candidateScore = scoreOrder(candidate)

        if (candidateScore > bestScore) {
          best = candidate
          bestScore = candidateScore
          improved = true
        }
      }
    }

    if (!improved) break
  }

  return best
}

// ============================================================
// FASE 4 — REFINAMENTO: OR-OPT
// ============================================================

function orOpt(tracks: Track[], maxBlockSize: number = 3): Track[] {
  const n = tracks.length
  if (n < 4) return tracks

  let best = [...tracks]
  let bestScore = scoreOrder(best)
  let improved = true

  while (improved) {
    improved = false

    for (let blockSize = 1; blockSize <= maxBlockSize; blockSize++) {
      for (let i = 0; i < best.length - blockSize; i++) {
        const block = best.slice(i, i + blockSize)
        const rest = [...best.slice(0, i), ...best.slice(i + blockSize)]

        for (let j = 0; j < rest.length; j++) {
          const candidate = [...rest.slice(0, j), ...block, ...rest.slice(j)]
          const candidateScore = scoreOrder(candidate)

          if (candidateScore > bestScore) {
            best = candidate
            bestScore = candidateScore
            improved = true
          }
        }
      }
    }
  }

  return best
}

// ============================================================
// ORQUESTRADOR — MULTI-START + 2-OPT + OR-OPT
// ============================================================

export function generateSmartSet(
  library: Track[],
  options: TspOptions
): TspResult {
  const startTime = Date.now()

  const count = options.count || 30
  const bpmTarget = options.bpmTarget ?? null
  const bpmRange = options.bpmRange ?? 10
  const minCamelotScore = options.minCamelotScore ?? 85
  const seed = options.seed ?? 42
  const multiStart = options.multiStart ?? 100
  const twoOptPasses = options.twoOptPasses ?? 2

  // FASE 1 — PRÉ-FILTRO
    const filtered = filterCandidates(
    library,
    bpmTarget,
    bpmRange,
    minCamelotScore
  )

  // FASE 1.5 — DIVERSIDADE (Regra 3)
  const diversified = diversifyPool(filtered, count)
  const candidates = diversified.length >= count ? diversified : filtered

  if (candidates.length < count) {
    return {
      tracks: [],
      averageScore: 0,
      worstScore: 0,
      candidates: candidates.length,
      elapsedMs: Date.now() - startTime,
      seed,
    }
  }

  // FASE 2 — MULTI-START
  const rng = mulberry32(seed)
  let bestOrder: Track[] = []
  let bestScore = -1

  for (let s = 0; s < multiStart; s++) {
    const startIdx = Math.floor(rng() * candidates.length)
    const order = nearestNeighbor(candidates, startIdx, count)
    const score = scoreOrder(order)

    if (score > bestScore) {
      bestScore = score
      bestOrder = order
    }
  }

  // FASE 3 — 2-OPT
  bestOrder = twoOpt(bestOrder, twoOptPasses)
  bestScore = scoreOrder(bestOrder)

  // FASE 4 — OR-OPT
  bestOrder = orOpt(bestOrder, 3)
  bestScore = scoreOrder(bestOrder)

  // MÉTRICAS
  let worst = 100
  for (let i = 0; i < bestOrder.length - 1; i++) {
    const s = getTransitionScore(bestOrder[i], bestOrder[i + 1])
    if (s < worst) worst = s
  }

  const averageScore =
    bestOrder.length > 1
      ? Math.round(bestScore / (bestOrder.length - 1))
      : 0

  return {
    tracks: bestOrder,
    averageScore,
    worstScore: worst,
    candidates: candidates.length,
    elapsedMs: Date.now() - startTime,
    seed,
  }
}