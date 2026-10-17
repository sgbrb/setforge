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
/**
 * Energia alvo pra posição `position` (1-indexed) num set de `total` faixas.
 *
 * Curva padrão:
 *   0-17%:   aquecer  → 4
 *   18-50%:  subir    → 6
 *   51-83%:  pico     → 9
 *   84-100%: descer   → 6
 */
export function getTargetEnergy(position: number, total: number): number {
  if (total <= 0) return 6
  const pct = position / total
  if (pct < 0.17) return 4
  if (pct < 0.50) return 6
  if (pct < 0.83) return 9
  return 6
}

/**
 * Compatibilidade entre energia da faixa e alvo da posição.
 * - diff ≤ 1.0 → 100
 * - diff ≤ 2.0 → 80
 * - diff ≤ 3.0 → 60
 * - diff > 3.0 → 30
 * - sem energia → 60 (neutro, não penaliza)
 */
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

export function getTransitionScore(
  trackA: Track,
  trackB: Track,
  position: number = 0,
  total: number = 30,
  usagePenalty?: Record<string, number>
): number {
  const camelot = getCamelotCompatibility(trackA.key, trackB.key)
  const bpm = getBpmCompatibility(trackA.bpm, trackB.bpm)

  // Energia-alvo da próxima posição (trackB vai entrar aqui)
  const targetEnergy = getTargetEnergy(position + 1, total)
  const energyB = (trackB as any).energy
  const energyCompat = getEnergyCompatibility(energyB, targetEnergy)

  // Score final: 45% Camelot + 25% BPM + 30% Energia
  const baseScore = camelot * 0.45 + bpm * 0.25 + energyCompat * 0.30

  if (usagePenalty) {
    const pA = usagePenalty[trackA.id] ?? 0
    const pB = usagePenalty[trackB.id] ?? 0
    const avg = (pA + pB) / 2
    return Math.round(baseScore * (1 - avg))
  }

  return Math.round(baseScore)
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
/**
 * Normaliza título de faixa pra comparação (case-insensitive, trim, espaços colapsados).
 * Usado pra casar análise GPU com faixas do setlist (upload local vs Track do banco).
 */
export function normalizeTitle(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}