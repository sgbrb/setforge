// ============================================================
// TIPOS
// ============================================================

export interface AudioSegment {
  start: number
  end: number
  label: string
}

export interface AudioAnalysis {
  bpm: number
  segments: AudioSegment[]
}

/**
 * Resultado do cálculo de mixagem entre duas faixas.
 * Tempos na faixa A (segundos da Faixa A) e tempos globais (segundos do set).
 */
export interface MixTimeline {
  // Instruções na Faixa A (segundos da Faixa A)
  playAtSec: number
  crossfadeStartSec: number
  crossfadeEndSec: number
  crossfadeStartBarNumber?: number
  crossfadeEndBarNumber?: number
  crossfadeEndOffset?: number
  stopASec: number

  // Instruções na Faixa B (segundos da Faixa B)
  playBAtSec: number
  playBAtFormatted: string
  introEndBSec: number
  introEndBFormatted: string

  // Formatação
  playAtFormatted: string
  crossfadeStartFormatted: string
  crossfadeEndFormatted: string
  stopAFormatted: string

  // Duração
  crossfadeDurationSec: number
  crossfadeBars: number

  // Confiança e notas
  confidence: 'high' | 'medium' | 'low'
  notes: string[]

  // 🆕 Tempos globais (no tempo do SET)
  startOffsetA?: number
  crossfadeStartGlobalSec?: number
  crossfadeEndGlobalSec?: number
  playBAtGlobalSec?: number
  crossfadeStartGlobalFormatted?: string
  crossfadeEndGlobalFormatted?: string
  playBAtGlobalFormatted?: string
}

// ============================================================
// UTILITÁRIOS
// ============================================================

/**
 * Converte segundos para "M:SS".
 */
export function formatSeconds(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const mins = Math.floor(sec / 60)
  const secs = Math.floor(sec % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Formata segundos com 1 casa decimal.
 */
export function formatSecondsWithDecimal(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00.0'
  const mins = Math.floor(sec / 60)
  const secs = Math.floor(sec % 60)
  const dec = Math.round((sec - Math.floor(sec)) * 10)
  return `${mins}:${secs.toString().padStart(2, '0')}.${dec}`
}

/**
 * Quantos segundos vale uma barra no BPM dado.
 */
export function secondsPerBar(bpm: number): number {
  return (60 / bpm) * 4
}

/**
 * Encontra o fim da intro da faixa B.
 */
export function findIntroEnd(segments: AudioSegment[]): { time: number; confidence: 'high' | 'medium' | 'low' } {
  if (!segments || segments.length === 0) {
    return { time: 0, confidence: 'low' }
  }

  // Procura o último segmento que é "intro" ou "inst" seguido por algo mais "pesado"
  let lastIntroEnd = 0
  let confidence: 'high' | 'medium' | 'low' = 'low'

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const label = seg.label.toLowerCase()

    if (label === 'intro' || label === 'inst' || label === 'start') {
      lastIntroEnd = seg.end
      confidence = label === 'intro' ? 'high' : 'medium'
    }

    // Se achou algo pesado depois, para
    if (['chorus', 'drop', 'verse', 'solo'].includes(label) && lastIntroEnd > 0) {
      break
    }
  }

  return { time: lastIntroEnd, confidence }
}

/**
 * Encontra o início do outro da faixa A.
 */
export function findOutroStart(
  segments: AudioSegment[],
  durationSec: number
): { time: number; confidence: 'high' | 'medium' | 'low' } {
  if (!segments || segments.length === 0) {
    return { time: durationSec * 0.75, confidence: 'low' }
  }

  // Procura o primeiro segmento "outro"
  for (const seg of segments) {
    if (seg.label.toLowerCase() === 'outro') {
      return { time: seg.start, confidence: 'high' }
    }
  }

  // Fallback: último chorus
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].label.toLowerCase() === 'chorus') {
      return { time: segments[i].start, confidence: 'medium' }
    }
  }

  // Fallback: 75% da duração
  return { time: durationSec * 0.75, confidence: 'low' }
}

/**
 * Arredonda um segundo pra barra mais próxima.
 */
export function roundToNearestBar(
  sec: number,
  bpm: number,
  firstBeatSec: number = 0
): number {
  if (bpm <= 0) return sec
  const barDur = secondsPerBar(bpm)
  const barsElapsed = (sec - firstBeatSec) / barDur
  const rounded = Math.round(barsElapsed)
  return firstBeatSec + rounded * barDur
}

// ============================================================
// SNAP TO BAR
// ============================================================

/**
 * Número da barra (fracionário) pra um segundo.
 */
export function barNumberAt(sec: number, bpm: number, firstBeatSec: number): number {
  if (bpm <= 0) return 0
  const barDur = secondsPerBar(bpm)
  return (sec - firstBeatSec) / barDur
}

/**
 * Offset (0-1) dentro da barra atual.
 */
export function offsetFromGrid(sec: number, bpm: number, firstBeatSec: number): number {
  const bar = barNumberAt(sec, bpm, firstBeatSec)
  return bar - Math.floor(bar)
}

/**
 * Snap pra próxima barra que seja múltiplo de `targetBars`.
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

  const barDur = secondsPerBar(bpm)
  const barsElapsed = (sec - firstBeatSec) / barDur
  const nextMultiple = Math.ceil(barsElapsed / targetBars) * targetBars
  const snappedSec = firstBeatSec + nextMultiple * barDur
  const offset = barsElapsed - Math.floor(barsElapsed)

  return {
    snappedSec,
    barNumber: nextMultiple,
    offsetFromGrid: offset,
  }
}

// ============================================================
// CÁLCULO DE MIXAGEM (A → B)
// ============================================================

interface Track {
  id: string
  title: string
  artist: string
  bpm: number
  key: string
  energy: number
  firstBeatSec?: number
  durationSec?: number
}

export function calculateMixTimeline(
  trackA: Track,
  trackB: Track,
  analysisA: AudioAnalysis,
  analysisB: AudioAnalysis,
  durationA: number = 300,
  startOffsetA: number = 0   // 🆕 offset da A no tempo do set
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

  // 🆕 Tempos globais (no tempo do SET)
  const crossfadeStartGlobalSec = crossfadeStart + startOffsetA
  const crossfadeEndGlobalSec = crossfadeEnd + startOffsetA
  const playBAtGlobalSec = playBAtSec + startOffsetA

  return {
    playAtSec: crossfadeStart,
    crossfadeStartSec: crossfadeStart,
    crossfadeEndSec: crossfadeEnd,
    stopASec: crossfadeEnd,

    crossfadeStartBarNumber: barNumberAt(crossfadeStart, bpm, trackA.firstBeatSec ?? 0),
    crossfadeEndBarNumber: snappedOutro.barNumber,
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

    // 🆕 globais
    startOffsetA,
    crossfadeStartGlobalSec,
    crossfadeEndGlobalSec,
    playBAtGlobalSec,
    crossfadeStartGlobalFormatted: formatSeconds(crossfadeStartGlobalSec),
    crossfadeEndGlobalFormatted: formatSeconds(crossfadeEndGlobalSec),
    playBAtGlobalFormatted: formatSeconds(playBAtGlobalSec),
  }
}

// ============================================================
// CADEIA COMPLETA (A→B→C→…→T)
// ============================================================

export interface Transition {
  from: Track
  to: Track
  timeline: MixTimeline
  startOffsetA: number
}

/**
 * 🆕 Gera a timeline de uma cadeia inteira, acumulando o offset de cada faixa.
 */
export function calculateFullTimeline(
  setlist: Array<{ track: Track; analysis: AudioAnalysis; duration: number }>
): Transition[] {
  const transitions: Transition[] = []
  let currentOffsetA = 0   // 🆕 offset da faixa atual no tempo do set

  for (let i = 0; i < setlist.length - 1; i++) {
    const a = setlist[i]
    const b = setlist[i + 1]

    const timeline = calculateMixTimeline(
      a.track,
      b.track,
      a.analysis,
      b.analysis,
      a.duration,
      currentOffsetA   // 🆕
    )

    transitions.push({
      from: a.track,
      to: b.track,
      timeline,
      startOffsetA: currentOffsetA,
    })

    // 🆕 offset da próxima faixa no tempo do set
    currentOffsetA = (timeline.crossfadeStartGlobalSec ?? 0) - timeline.playBAtSec
  }

  return transitions
}