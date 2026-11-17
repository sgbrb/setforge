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
// 🆕 PERFIL DE GÊNERO — ÂNCORAS NARRATIVAS
// ============================================================

/**
 * Perfil de gênero que define quantas âncoras (micro-picos e micro-vales)
 * o TSP deve tentar criar ao longo do set.
 *
 * Baseado no diagnóstico da biblioteca do Bruno (11/11/2026):
 * - inst + chorus = 68.7% dos segmentos
 * - breakdown = 0% (não é trance)
 * - energia média = 8.82, mediana = 8.9
 * - chorus médio = 19.1s (picos curtos e frequentes)
 * → tech house / minimal / melodic techno de peak time
 */
export interface GenreProfile {
  name: string
  /** Energia mínima pra uma faixa contar como micro-pico */
  peakEnergyMin: number
  /** Energia máxima pra uma faixa contar como micro-vale */
  valleyEnergyMax: number
  /** Bônus aplicado quando a posição bate com uma âncora de pico */
  peakBonus: number
  /** Bônus aplicado quando a posição bate com uma âncora de vale */
  valleyBonus: number
  /** Distância mínima (em faixas) entre duas âncoras do mesmo tipo */
  minAnchorGap: number
}

export function getGenreProfile(genre: 'tech-house' | 'trance' = 'tech-house'): GenreProfile {
  if (genre === 'trance') {
    // Perfil pra trance/progressive (não é o caso da biblioteca atual, mas deixo pronto)
    return {
      name: 'trance',
      peakEnergyMin: 9,
      valleyEnergyMax: 7,
      peakBonus: 60,
      valleyBonus: 35,
      minAnchorGap: 6,
    }
  }

  // Perfil padrão: tech house / minimal / melodic techno de peak time
  return {
    name: 'tech-house',
    peakEnergyMin: 9,      // energia 9 ou 10 = micro-pico
    valleyEnergyMax: 8,    // energia 8 ou menos = micro-vale
    peakBonus: 40,
    valleyBonus: 25,
    minAnchorGap: 3,       // pelo menos 3 faixas entre âncoras do mesmo tipo
  }
}

/**
 * Calcula quantas âncoras (picos e vales) o set deve ter, baseado no tamanho.
 * Regra adaptativa: a densidade de âncoras escala com a duração, mas não linearmente.
 */
export function getAnchorCounts(setSize: number): { peaks: number; valleys: number } {
  if (setSize < 10) {
    return { peaks: 0, valleys: 0 } // set muito curto, sem âncoras
  }
  if (setSize < 20) {
    return { peaks: 2, valleys: 1 }
  }
  if (setSize < 35) {
    return { peaks: 3, valleys: 2 }
  }
  if (setSize < 60) {
    return { peaks: 4, valleys: 3 }
  }
  return { peaks: 5, valleys: 4 }
}

/**
 * Calcula o bônus de âncora pra uma posição específica do set.
 * Retorna positivo se a faixa "casa" com a âncora esperada, negativo se "quebra" o padrão.
 *
 * Lógica:
 * - Define as posições de pico e vale como frações do total.
 * - Se a trackEnergy casa com o tipo de âncora naquela posição → bônus.
 * - Se a trackEnergy contradiz a âncora (ex: energia 10 num vale) → penalidade.
 * - Fora das janelas de âncora → 0 (sem influência).
 */
export function getAnchorBonus(
  position: number,
  total: number,
  trackEnergy: number,
  profile: GenreProfile
): number {
  if (total < 10 || position < 0 || position >= total) return 0
  if (!trackEnergy || trackEnergy <= 0) return 0

  const counts = getAnchorCounts(total)
  if (counts.peaks === 0) return 0

  // Janela de tolerância em torno da âncora (em fração do set)
  // Ex: set de 30 faixas → janela de ±2 faixas = ±0.067
  const windowSize = Math.max(1.5 / total, 0.04)
  const pct = position / total

  let bonus = 0

  // ─── Verifica se está perto de um micro-pico ───
  const peakPositions = computeAnchorPositions(counts.peaks, 'peak')
  for (const peakPct of peakPositions) {
    if (Math.abs(pct - peakPct) <= windowSize) {
      if (trackEnergy >= profile.peakEnergyMin) {
        bonus += profile.peakBonus
      } else if (trackEnergy <= profile.valleyEnergyMax) {
        // Pico deveria ser alto, mas veio baixo → penaliza
        bonus -= Math.round(profile.peakBonus * 0.6)
      }
      break // só aplica uma vez por posição
    }
  }

  // ─── Verifica se está perto de um micro-vale ───
  const valleyPositions = computeAnchorPositions(counts.valleys, 'valley')
  for (const valleyPct of valleyPositions) {
    if (Math.abs(pct - valleyPct) <= windowSize) {
      if (trackEnergy <= profile.valleyEnergyMax) {
        bonus += profile.valleyBonus
      } else if (trackEnergy >= profile.peakEnergyMin + 1) {
        // Vale deveria ser baixo, mas veio muito alto → penaliza
        bonus -= Math.round(profile.valleyBonus * 0.6)
      }
      break
    }
  }

  return bonus
}

/**
 * Calcula as posições (em fração 0-1) onde as âncoras devem cair.
 * - Picos: distribuídos em [0.20, 0.85] uniformemente.
 * - Vales: intercalados entre os picos (nunca no início nem no fim).
 */
function computeAnchorPositions(count: number, type: 'peak' | 'valley'): number[] {
  if (count <= 0) return []

  if (type === 'peak') {
    // Picos distribuídos entre 20% e 85% do set
    if (count === 1) return [0.75]
    if (count === 2) return [0.30, 0.75]
    if (count === 3) return [0.25, 0.55, 0.85]
    if (count === 4) return [0.20, 0.42, 0.64, 0.86]
    // 5+
    return Array.from({ length: count }, (_, i) =>
      0.20 + (0.65 * i) / (count - 1)
    )
  }

  // Vales: intercalados entre os picos
  if (count === 1) return [0.55]
  if (count === 2) return [0.40, 0.70]
  if (count === 3) return [0.33, 0.55, 0.77]
  if (count === 4) return [0.28, 0.45, 0.62, 0.79]
  return Array.from({ length: count }, (_, i) =>
    0.28 + (0.55 * i) / (count - 1)
  )
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

  // 🆕 ANÁLISE ESTRUTURAL (Structure-First)
  // Verifica se a A tem saída limpa e a B tem entrada limpa
  let structureScore = 0
  let structureLabel = 'estrutura neutra'
  try {
    const segA = (trackA as any).segments
    const segB = (trackB as any).segments
    if (segA?.segments && segB?.segments) {
      const lastSegA = segA.segments[segA.segments.length - 2]
      const firstSegB = segB.segments[1]
      
      const lastLabelA = lastSegA?.label?.toLowerCase() || ''
      const firstLabelB = firstSegB?.label?.toLowerCase() || ''
      
      // A tem saída limpa? (outro, inst, breakdown)
      const aHasCleanExit = ['outro', 'inst', 'breakdown'].includes(lastLabelA)
      // B tem entrada limpa? (intro, inst)
      const bHasCleanEnter = ['intro', 'inst'].includes(firstLabelB)
      
      if (aHasCleanExit && bHasCleanEnter) {
        structureScore = 40 // Bônus massivo
        structureLabel = 'estrutura perfeita (saída limpa + entrada limpa)'
      } else if (aHasCleanExit || bHasCleanEnter) {
        structureScore = 10 // Bônus parcial
        structureLabel = 'estrutura parcial (só um dos lados limpo)'
      } else {
        // Nenhum dos lados tem saída/entrada limpa
        structureScore = -40 // Penalidade severa
        structureLabel = 'estrutura ruim (sem saída/entrada limpa)'
      }
    }
  } catch (e) {
    // Se não tiver segments, mantém estrutura neutra (0)
  }

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

    // 🆕 Aplica a estrutura ANTES de tudo
    score += structureScore

    // Aplica a penalidade de energia em cima da nota
    if (energyDiffBetweenTracks > 1.5) {
      score -= (energyDiffBetweenTracks - 1) * 30
    }

    if (usagePenalty && usagePenalty[trackB.id]) {
      score *= (1 - usagePenalty[trackB.id])
    }

    // Log para debug (opcional, pode remover depois)
    if (structureScore === -40) {
      console.log(`[tsp] ⚠️ Estrutura ruim: ${trackA.title} → ${trackB.title} (${structureLabel})`)
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

  // Base: harmonia, bpm e energia
  const baseScore = energyScore * 0.60 + camelot * 0.25 + bpm * 0.15
  let finalScore = baseScore

  // 🆕 Aplica a estrutura no fallback (mesma lógica)
  finalScore += structureScore

  // Aplica a Regra do ±1 também no fallback
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