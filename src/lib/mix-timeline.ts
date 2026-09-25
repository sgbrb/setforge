import { Track } from './types'

/**
 * Estrutura de um segmento retornado pelo microserviço Python
 * (all-in-one-infer).
 */
export interface AudioSegment {
  start: number   // em segundos
  end: number     // em segundos
  label: string   // "start", "intro", "verse", "chorus", "breakdown", "drop", "outro"
}

export interface AudioAnalysis {
  bpm: number
  segments: AudioSegment[]
}

/**
 * Resultado do cálculo de mixagem entre duas faixas.
 */
export interface MixTimeline {
  // Instruções em segundos (timeline da Faixa A)
  playAtSec: number
  crossfadeStartSec: number
  crossfadeEndSec: number
  crossfadeStartBarNumber?: number
  crossfadeEndBarNumber?: number
  crossfadeEndOffset?: number
  stopASec: number

  // Instruções sobre a Faixa B (em segundos da Faixa B)
  playBAtSec: number
  playBAtFormatted: string
  introEndBSec: number
  introEndBFormatted: string

  // Instruções formatadas (M:SS) — o que o DJ vê
  playAtFormatted: string
  crossfadeStartFormatted: string
  crossfadeEndFormatted: string
  stopAFormatted: string

  // Metadados
  crossfadeDurationSec: number
  crossfadeBars: number
  confidence: 'high' | 'medium' | 'low'
  notes: string[]
}

/**
 * Converte segundos para o formato "M:SS".
 */
export function formatSeconds(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const mins = Math.floor(sec / 60)
  const secs = Math.floor(sec % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * 🆕 Formata segundos com 1 casa decimal.
 * Ex: 157.23 → "2:37.2"
 */
export function formatSecondsWithDecimal(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00.0'
  const mins = Math.floor(sec / 60)
  const secs = Math.floor(sec % 60)
  const dec = Math.round((sec - Math.floor(sec)) * 10)
  return `${mins}:${secs.toString().padStart(2, '0')}.${dec}`
}
/**
 * Calcula quantos segundos vale uma barra no BPM dado.
 */
export function secondsPerBar(bpm: number): number {
  if (bpm <= 0) return 2
  return (60 / bpm) * 4
}

/**
 * Encontra o "intro end" — o momento em que o beat está estabelecido
 * e o DJ pode soltar a faixa B.
 */
export function findIntroEnd(segments: AudioSegment[]): { time: number; confidence: 'high' | 'medium' | 'low' } {
  const intros = segments.filter(s => s.label === 'intro')
  if (intros.length > 0) {
    const lastIntro = intros[intros.length - 1]
    return { time: lastIntro.end, confidence: 'high' }
  }

  const firstVerse = segments.find(s => s.label === 'verse' || s.label === 'chorus')
  if (firstVerse) {
    return { time: firstVerse.end, confidence: 'medium' }
  }

  return { time: 0, confidence: 'low' }
}

/**
 * Encontra o "outro start" — o momento em que o DJ deve começar a mixagem
 * para sair da faixa A.
 *
 * 🆕 CORREÇÃO: valida se o all-in-one-infer cobriu a faixa inteira.
 * Se o último segmento termina muito antes da duração real, usa
 * um fallback baseado em 75% da duração.
 */
export function findOutroStart(
  segments: AudioSegment[],
  trackDurationSec: number
): { time: number; confidence: 'high' | 'medium' | 'low' } {
  // 1. Outro explícito
  const outro = segments.find(s => s.label === 'outro')
  if (outro) {
    return { time: outro.start, confidence: 'high' }
  }

  // 2. Último breakdown
  const breakdowns = segments.filter(s => s.label === 'breakdown')
  if (breakdowns.length > 0) {
    const lastBreakdown = breakdowns[breakdowns.length - 1]
    return { time: lastBreakdown.start, confidence: 'high' }
  }

  // 3. Último drop ou chorus
  const lastDrop = [...segments].reverse().find(s => s.label === 'drop' || s.label === 'chorus')
  if (lastDrop) {
    return { time: lastDrop.start, confidence: 'medium' }
  }

  // 4. 🆕 Valida cobertura dos segmentos
  if (segments.length > 0) {
    const lastSeg = segments[segments.length - 1]

    // Se o último segmento termina muito antes da duração total,
    // o all-in-one-infer não cobriu a faixa inteira — usa fallback
    const coverageRatio = lastSeg.end / trackDurationSec

    if (coverageRatio < 0.5) {
      // Cobertura < 50%: usa 75% da duração real
      return {
        time: trackDurationSec * 0.75,
        confidence: 'low',
      }
    }

    return { time: lastSeg.start, confidence: 'low' }
  }

  // 5. Fallback absoluto: 75% da duração
  return { time: trackDurationSec * 0.75, confidence: 'low' }
}

/**
 * Arredonda um tempo para o múltiplo de barra mais próximo.
 */
export function roundToNearestBar(
  timeSec: number,
  bpm: number,
  barsPerPhrase: number = 16
): number {
  const barDuration = secondsPerBar(bpm)
  const phraseDuration = barDuration * barsPerPhrase
  if (phraseDuration <= 0) return timeSec
  return Math.round(timeSec / phraseDuration) * phraseDuration
}

/**
 * Calcula a timeline de mixagem entre duas faixas.
 *
 * - Calcula `playBAtSec` — em qual segundo da Faixa B dar play
 * - O crossfade considera o espaço REAL disponível
 */
export function calculateMixTimeline(
  trackA: Track,
  trackB: Track,
  analysisA: AudioAnalysis,
  analysisB: AudioAnalysis,
  durationA: number = 300
): MixTimeline {
  const notes: string[] = []

  // 1. Ponto de saída na faixa A
  const outro = findOutroStart(analysisA.segments, durationA)

  // 2. Ponto de entrada na faixa B
  const introB = findIntroEnd(analysisB.segments)

  // 3. BPM para cálculo de barras
  const bpm = analysisA.bpm || trackA.bpm || 120
  const barDuration = secondsPerBar(bpm)

  // 4. Duração do crossfade — considera espaço REAL disponível
  const outroTime = outro.time
  const remainingA = durationA - outroTime
  const introBDuration = introB.time

  const maxCrossfadeSec = Math.min(
    remainingA,
    introBDuration,
    outroTime
  )

  // Escolhe o número de barras que CABE no espaço disponível
  const candidates = [32, 16, 8, 4]
  let crossfadeBars = 4
  for (const bars of candidates) {
    if (barDuration * bars <= maxCrossfadeSec) {
      crossfadeBars = bars
      break
    }
  }

  if (crossfadeBars < 16) {
    notes.push(`Espaço limitado na faixa A — crossfade reduzido para ${crossfadeBars} barras`)
  } else if (crossfadeBars === 32) {
    notes.push('Espaço de sobra — crossfade estendido para 32 barras')
  }

  const crossfadeDuration = barDuration * crossfadeBars

    // 5. Crossfade termina quando a faixa A for desligada
  // 🆕 Snap do ponto de saída da A pra barra cheia (frase de 8)
  const snappedOutro = snapToBar(
    outroTime,
    bpm,
    trackA.firstBeatSec ?? 0,
    8
  )
  const crossfadeEnd = snappedOutro.snappedSec

  if (snappedOutro.offsetFromGrid > 0.05) {
    notes.push(
      `Ponto de saída da A ajustado ao grid (offset original +${snappedOutro.offsetFromGrid.toFixed(2)}s)`
    )
  }

  // 6. Crossfade começa = fim - duração
  const crossfadeStart = Math.max(0, crossfadeEnd - crossfadeDuration)

  // 7. playBAt: quando dar play na Faixa B
  const playBAtRaw = crossfadeStart - introB.time
  const playBAtSec = Math.max(0, playBAtRaw)

  if (playBAtRaw < 0 && introB.time > 0) {
    notes.push(
      `Intro da faixa B (${formatSeconds(introB.time)}) é maior que o espaço antes do crossfade — ` +
      `a faixa B vai entrar no meio do intro`
    )
  }

  // 8. Confiança geral
  const confidence: 'high' | 'medium' | 'low' =
    outro.confidence === 'low' || introB.confidence === 'low'
      ? 'low'
      : outro.confidence === 'medium' || introB.confidence === 'medium'
        ? 'medium'
        : 'high'

  if (outro.confidence === 'low') {
    notes.push('Estrutura da faixa A pouco clara — verifique o ponto de saída')
  }
  if (introB.confidence === 'low') {
    notes.push('Estrutura da faixa B pouco clara — verifique o ponto de entrada')
  }

  return {
    playAtSec: crossfadeStart,
    crossfadeStartSec: crossfadeStart,
    crossfadeEndSec: crossfadeEnd,
    stopASec: crossfadeEnd,

    crossfadeStartBarNumber: barNumberAt(crossfadeStart, bpm, trackA.firstBeatSec ?? 0),  // 🆕
    crossfadeEndBarNumber: snappedOutro.barNumber,                                          // 🆕
    crossfadeEndOffset: snappedOutro.offsetFromGrid, 

    playBAtSec,
    playBAtFormatted: formatSecondsWithDecimal(playBAtSec),
    introEndBSec: introB.time,
    introEndBFormatted: formatSeconds(introB.time),

    playAtFormatted: formatSeconds(crossfadeStart),
    crossfadeStartFormatted: formatSeconds(crossfadeStart),
    crossfadeEndFormatted: formatSeconds(crossfadeEnd),
    stopAFormatted: formatSeconds(crossfadeEnd),

    crossfadeDurationSec: crossfadeDuration,
    crossfadeBars,
    confidence,
    notes,
  }
}

/**
 * Gera a timeline para uma sequência inteira de faixas.
 */
export function calculateFullTimeline(
  setlist: Array<{ track: Track; analysis: AudioAnalysis; duration: number }>
): Array<{ from: Track; to: Track; timeline: MixTimeline }> {
  const transitions = []
  for (let i = 0; i < setlist.length - 1; i++) {
    const a = setlist[i]
    const b = setlist[i + 1]
    transitions.push({
      from: a.track,
      to: b.track,
      timeline: calculateMixTimeline(a.track, b.track, a.analysis, b.analysis, a.duration),
    })
  }
  return transitions
}
// ============================================================
// 🆕 SNAP TO BAR — utilidades de grid musical
// ============================================================

/**
 * Retorna o número da barra (fracionário) pra um segundo.
 * Ex: 87.0 = início da barra 87. 87.5 = meio da barra 87.
 */
export function barNumberAt(sec: number, bpm: number, firstBeatSec: number): number {
  if (bpm <= 0) return 0
  const beatDuration = 60 / bpm
  const barDuration = beatDuration * 4
  return (sec - firstBeatSec) / barDuration
}

/**
 * Retorna o offset (0-1) dentro da barra atual.
 * 0 = exato no início. 0.5 = meio. 0.99 = quase fim.
 */
export function offsetFromGrid(sec: number, bpm: number, firstBeatSec: number): number {
  const bar = barNumberAt(sec, bpm, firstBeatSec)
  return bar - Math.floor(bar)
}

/**
 * Snap pra próxima barra/frase que seja múltiplo de `targetBars`.
 * Retorna o segundo exato do snap + número da barra + offset do grid original.
 */
export function snapToBar(
  sec: number,
  bpm: number,
  firstBeatSec: number,
  targetBars: number = 8
): { snappedSec: number; barNumber: number; offsetFromGrid: number } {
  if (bpm <= 0) {
    return { snappedSec: sec, barNumber: 0, offsetFromGrid: 0 }
  }

  const beatDuration = 60 / bpm
  const barDuration = beatDuration * 4
  const barsElapsed = (sec - firstBeatSec) / barDuration

  // Próximo múltiplo de targetBars (arredonda pra cima)
  const nextMultiple = Math.ceil(barsElapsed / targetBars) * targetBars
  const snappedSec = firstBeatSec + nextMultiple * barDuration

  // Offset do ponto ORIGINAL (antes do snap) — pra UI avisar se tava "fora"
  const offset = barsElapsed - Math.floor(barsElapsed)

  return {
    snappedSec,
    barNumber: nextMultiple,
    offsetFromGrid: offset,
  }
}