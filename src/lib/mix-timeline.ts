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
  const total = Math.round(sec)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
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
  const crossfadeEnd = outroTime

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

    playBAtSec,
    playBAtFormatted: formatSeconds(playBAtSec),
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