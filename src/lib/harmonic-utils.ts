import * as fs from 'fs'
import * as path from 'path'
import { Track } from './types'

// ============================================================
// 🆕 CARREGA AS TRANSIÇÕES (ÓTIMAS 90+ E BOAS 75+)
// ============================================================

let transitionsOtimasCache: Record<string, { toTrackId: string; score: number; mixInSec: number | null; mixOutSec: number | null }[]> | null = null
let transitionsBoasCache: Record<string, { toTrackId: string; score: number; mixInSec: number | null; mixOutSec: number | null }[]> | null = null

function getTransitionsOtimas() {
  if (transitionsOtimasCache) return transitionsOtimasCache
  try {
    const filePath = path.join(process.cwd(), 'public', 'transicoes_otimas.json')
    const raw = fs.readFileSync(filePath, 'utf-8')
    transitionsOtimasCache = JSON.parse(raw)
    console.log('[harmonic-utils] ✅ Transições Ótimas carregadas:', Object.keys(transitionsOtimasCache!).length, 'músicas')
    return transitionsOtimasCache!
  } catch (e) {
    console.warn('[harmonic-utils] ⚠️ Falha ao carregar transicoes_otimas.json (usando fallback).')
    transitionsOtimasCache = {}
    return {}
  }
}

function getTransitionsBoas() {
  if (transitionsBoasCache) return transitionsBoasCache
  try {
    const filePath = path.join(process.cwd(), 'public', 'transicoes_boas.json')
    const raw = fs.readFileSync(filePath, 'utf-8')
    transitionsBoasCache = JSON.parse(raw)
    console.log('[harmonic-utils] ✅ Transições Boas carregadas:', Object.keys(transitionsBoasCache!).length, 'músicas')
    return transitionsBoasCache!
  } catch (e) {
    console.warn('[harmonic-utils] ⚠️ Falha ao carregar transicoes_boas.json (usando fallback).')
    transitionsBoasCache = {}
    return {}
  }
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

export function getCamelotCompatibility(keyA: string, keyB: string): number {
  if (!keyA || !keyB) return 50
  const a = keyA.toUpperCase().trim()
  const b = keyB.toUpperCase().trim()
  if (a === b) return 100
  const numA = parseInt(a.slice(0, -1), 10)
  const letterA = a.slice(-1)
  const numB = parseInt(b.slice(0, -1), 10)
  const letterB = b.slice(-1)
  if (isNaN(numA) || isNaN(numB)) return 50
  if (numA === numB && letterA !== letterB) return 85
  const diff = Math.abs(numA - numB)
  const isAdjacent = diff === 1 || diff === 11
  if (isAdjacent && letterA === letterB) return 90
  if (isAdjacent && letterA !== letterB) return 70
  return 50
}

export function getBpmCompatibility(bpmA: number, bpmB: number): number {
  if (!bpmA || !bpmB) return 50
  const diff = Math.abs(bpmA - bpmB)
  if (diff <= 2) return 100
  if (diff <= 5) return 85
  if (diff <= 10) return 60
  return 30
}

export function getTargetEnergy(position: number, total: number): number {
  if (total <= 0) return 6
  const pct = position / total
  if (pct < 0.17) return 4
  if (pct < 0.50) return 6
  if (pct < 0.83) return 9
  return 6
}

export function getEnergyCompatibility(
  trackEnergy: number | undefined,
  targetEnergy: number
): number {
  if (!trackEnergy || trackEnergy <= 0) return 60
  const diff = Math.abs(trackEnergy - targetEnergy)
  if (diff <= 1.0) return 100
  if (diff <= 2.0) return 80
  if (diff <= 3.0) return 60
  return 30
}

// ============================================================
// 🆕 FUNÇÃO PRINCIPAL: USA OS DOIS CACHES E A REGRA DO ±1
// ============================================================

export function getTransitionScore(
  trackA: Track,
  trackB: Track,
  position: number = 0,
  total: number = 30,
  usagePenalty?: Record<string, number>,
  energyCurve?: { target: number }[] 
): number {
  // 🆕 REGRA DO ±1: Calcula a diferença de energia
  const energyA = (trackA as any).energy || 0
  const energyB = (trackB as any).energy || 0
  const energyDiffBetweenTracks = Math.abs(energyA - energyB)

  // 1) Tenta buscar no cache de transições ótimas (90+)
  const otimas = getTransitionsOtimas()
  let match = otimas[trackA.id]?.find(o => o.toTrackId === trackB.id)

  // 2) Se não achou, tenta no cache de transições boas (75+)
  if (!match) {
    const boas = getTransitionsBoas()
    match = boas[trackA.id]?.find(o => o.toTrackId === trackB.id)
  }

  if (match) {
    let score = match.score

    // 🆕 Aplica a penalidade de energia em cima da nota do arquivo
    // Se pular mais de 1 nível (ex: 8 -> 10), perde pontos
    if (energyDiffBetweenTracks > 1.5) {
      score -= (energyDiffBetweenTracks - 1) * 30
    }

    if (usagePenalty && usagePenalty[trackB.id]) {
      score *= (1 - usagePenalty[trackB.id])
    }
    return Math.round(Math.max(0, score))
  }

  // 3) Fallback: cálculo antigo (se não achou no arquivo)
  const camelot = getCamelotCompatibility(trackA.key, trackB.key)
  const bpm = getBpmCompatibility(trackA.bpm, trackB.bpm)
  const pct = (position + 1) / total

  let targetEnergy = 6
  let tolerancia = 1

  if (energyCurve && energyCurve.length > 0) {
    let blockIdx = 0
    if (pct > 0.17 && pct <= 0.47) blockIdx = 1
    else if (pct > 0.47 && pct <= 0.80) blockIdx = 2
    else if (pct > 0.80) blockIdx = 3
    targetEnergy = energyCurve[blockIdx]?.target || 6
    tolerancia = targetEnergy >= 9 ? 0.5 : 1
  } else {
    if (pct <= 0.17) targetEnergy = 4
    else if (pct <= 0.47) targetEnergy = 6
    else if (pct <= 0.80) { targetEnergy = 9; tolerancia = 0.5 }
    else targetEnergy = 6
  }

  const energyBValue = (trackB as any).energy || 0
  const energyDiffToTarget = Math.abs(energyBValue - targetEnergy)

  let energyScore = 100
  if (energyDiffToTarget > tolerancia) {
    energyScore -= (energyDiffToTarget - tolerancia) * 50
  }

  const baseScore = energyScore * 0.70 + camelot * 0.20 + bpm * 0.10
  let finalScore = baseScore

  // 🆕 Aplica a Regra do ±1 também no fallback
  if (energyDiffBetweenTracks > 1.5) {
    finalScore -= (energyDiffBetweenTracks - 1) * 30
  }

  if (usagePenalty) {
    const pA = usagePenalty[trackA.id] ?? 0
    const pB = usagePenalty[trackB.id] ?? 0
    const avg = (pA + pB) / 2
    finalScore = finalScore * (1 - avg)
  }

  return Math.round(Math.max(0, finalScore))
}

// ============================================================
// 🆕 FUNÇÃO DE MIX POINTS
// ============================================================

export function getMixPoints(fromId: string, toId: string): { mixOutSec: number | null, mixInSec: number | null } {
  const otimas = getTransitionsOtimas()
  let match = otimas[fromId]?.find(o => o.toTrackId === toId)

  if (!match) {
    const boas = getTransitionsBoas()
    match = boas[fromId]?.find(o => o.toTrackId === toId)
  }

  if (!match) return { mixOutSec: null, mixInSec: null }
  return { mixOutSec: match.mixOutSec, mixInSec: match.mixInSec }
}

// ============================================================
// FUNÇÕES DE BUSCA
// ============================================================

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

export function normalizeTitle(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}