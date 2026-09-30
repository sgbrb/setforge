import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { readFileSync } from 'fs'

// Carrega .env.local
const env = readFileSync('.env.local', 'utf-8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
})

// ============================================================
// CÓPIA DAS FUNÇÕES DO tsp.ts (pra testar isolado)
// ============================================================

const CAMELOT_COMPAT = (a, b) => {
  if (!a || !b) return 50
  a = a.toUpperCase().trim(); b = b.toUpperCase().trim()
  if (a === b) return 100
  const numA = parseInt(a.slice(0, -1), 10), letterA = a.slice(-1)
  const numB = parseInt(b.slice(0, -1), 10), letterB = b.slice(-1)
  if (isNaN(numA) || isNaN(numB)) return 50
  if (numA === numB && letterA !== letterB) return 85
  const diff = Math.abs(numA - numB)
  const isAdj = diff === 1 || diff === 11
  if (isAdj && letterA === letterB) return 90
  if (isAdj && letterA !== letterB) return 70
  return 50
}

const BPM_COMPAT = (a, b) => {
  if (!a || !b) return 50
  const diff = Math.abs(a - b)
  if (diff <= 3) return 100
  if (diff <= 6) return 80
  if (diff <= 10) return 60
  return 30
}

const TRANSITION_SCORE = (a, b) =>
  Math.round(CAMELOT_COMPAT(a.key, b.key) * 0.6 + BPM_COMPAT(a.bpm, b.bpm) * 0.4)

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function filterCandidates(library, bpmTarget, bpmRange, minCamelot) {
  let pool = library.filter(t => t.bpm > 0)

  if (bpmTarget !== null) {
    pool = pool.filter(t => Math.abs(t.bpm - bpmTarget) <= bpmRange)
  }

  if (pool.length === 0) return []

  const keyCounts = new Map()
  for (const t of pool) {
    if (!t.key) continue
    keyCounts.set(t.key, (keyCounts.get(t.key) || 0) + 1)
  }

  const minCount = Math.max(5, Math.floor(pool.length * 0.02))
  const coreKeys = [...keyCounts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key]) => key)

  if (coreKeys.length === 0) return pool

  const allowedKeys = new Set()
  for (const k of coreKeys) {
    allowedKeys.add(k)
    const num = parseInt(k.slice(0, -1), 10)
    const letter = k.slice(-1)
    if (isNaN(num)) continue
    allowedKeys.add(`${num}${letter === 'A' ? 'B' : 'A'}`)
    allowedKeys.add(`${num === 1 ? 12 : num - 1}${letter}`)
    allowedKeys.add(`${num === 12 ? 1 : num + 1}${letter}`)
  }

  return pool.filter(t => allowedKeys.has(t.key))
}

function nearestNeighbor(pool, startIdx, count) {
  if (pool.length === 0) return []
  if (pool.length <= count) return [...pool]
  const remaining = pool.filter((_, i) => i !== startIdx)
  const result = [pool[startIdx]]
  while (result.length < count && remaining.length > 0) {
    const last = result[result.length - 1]
    let bestIdx = 0, bestScore = -1
    for (let i = 0; i < remaining.length; i++) {
      const s = TRANSITION_SCORE(last, remaining[i])
      if (s > bestScore) { bestScore = s; bestIdx = i }
    }
    result.push(remaining[bestIdx])
    remaining.splice(bestIdx, 1)
  }
  return result
}

function scoreOrder(tracks) {
  if (tracks.length <= 1) return 0
  let total = 0
  for (let i = 0; i < tracks.length - 1; i++) total += TRANSITION_SCORE(tracks[i], tracks[i + 1])
  return total
}

function twoOpt(tracks, passes) {
  const n = tracks.length
  if (n < 4) return tracks
  let best = [...tracks], bestScore = scoreOrder(best)
  for (let p = 0; p < passes; p++) {
    let improved = false
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 2; j < n; j++) {
        const cand = [...best.slice(0, i + 1), ...best.slice(i + 1, j + 1).reverse(), ...best.slice(j + 1)]
        const s = scoreOrder(cand)
        if (s > bestScore) { best = cand; bestScore = s; improved = true }
      }
    }
    if (!improved) break
  }
  return best
}

function orOpt(tracks, maxBlock) {
  const n = tracks.length
  if (n < 4) return tracks
  let best = [...tracks], bestScore = scoreOrder(best), improved = true
  while (improved) {
    improved = false
    for (let bs = 1; bs <= maxBlock; bs++) {
      for (let i = 0; i < best.length - bs; i++) {
        const block = best.slice(i, i + bs)
        const rest = [...best.slice(0, i), ...best.slice(i + bs)]
        for (let j = 0; j < rest.length; j++) {
          const cand = [...rest.slice(0, j), ...block, ...rest.slice(j)]
          const s = scoreOrder(cand)
          if (s > bestScore) { best = cand; bestScore = s; improved = true }
        }
      }
    }
  }
  return best
}

// ============================================================
// TESTE
// ============================================================

async function main() {
  console.log('📚 Carregando biblioteca...')
  const t0 = Date.now()
  const library = await prisma.track.findMany({
    select: { id: true, title: true, artist: true, bpm: true, key: true, energy: true },
  })
  console.log(`   ${library.length} faixas em ${Date.now() - t0}ms`)

  // ==========================================================
  // TESTE 1: BPM 124 ± 10, Camelot estrito (min 85)
  // ==========================================================
  console.log('')
  console.log('🎯 TESTE 1: BPM alvo=124, range=±10, Camelot estrito (min 85)')
  const t1 = Date.now()
  const candidates = filterCandidates(library, 124, 10, 85)
  console.log(`   Candidatas após filtro: ${candidates.length}`)

  if (candidates.length < 30) {
    console.log('   ⚠️ Menos de 30 candidatas!')
  } else {
    const rng = mulberry32(42)
    let bestOrder = [], bestScore = -1
    const multiStart = 100
    for (let s = 0; s < multiStart; s++) {
      const startIdx = Math.floor(rng() * candidates.length)
      const order = nearestNeighbor(candidates, startIdx, 30)
      const score = scoreOrder(order)
      if (score > bestScore) { bestScore = score; bestOrder = order }
    }
    console.log(`   Multi-start (${multiStart} sementes): best=${bestScore}`)

    bestOrder = twoOpt(bestOrder, 2)
    console.log(`   2-opt: ${scoreOrder(bestOrder)}`)

    bestOrder = orOpt(bestOrder, 3)
    const finalScore = scoreOrder(bestOrder)
    console.log(`   Or-opt: ${finalScore}`)

    let worst = 100
    for (let i = 0; i < bestOrder.length - 1; i++) {
      const s = TRANSITION_SCORE(bestOrder[i], bestOrder[i + 1])
      if (s < worst) worst = s
    }
    const avg = Math.round(finalScore / (bestOrder.length - 1))

    console.log(`   📊 Score médio: ${avg}/100`)
    console.log(`   📊 Pior transição: ${worst}/100`)
    console.log(`   ⏱️ Tempo total: ${Date.now() - t1}ms`)
    console.log('')
    console.log('   🎧 30 faixas escolhidas:')
    bestOrder.forEach((t, i) => {
      console.log(`   ${String(i + 1).padStart(2)}. [${t.key}] ${t.bpm} BPM | ${t.title.slice(0, 50)}`)
    })
  }

  // ==========================================================
  // TESTE 2: BPM livre, Camelot estrito
  // ==========================================================
  console.log('')
  console.log('🎯 TESTE 2: BPM livre, Camelot estrito (min 85)')
  const t2 = Date.now()
  const candidates2 = filterCandidates(library, null, 0, 85)
  console.log(`   Candidatas: ${candidates2.length}`)

  await prisma.$disconnect()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })