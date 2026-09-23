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
  playAtSec: number          // quando o DJ dá play na Faixa A (0 = início)
  crossfadeStartSec: number  // quando começar o crossfade
  crossfadeEndSec: number    // quando terminar o crossfade
  stopASec: number           // quando desligar a faixa A

  // 🆕 Instruções sobre a Faixa B (em segundos da Faixa B)
  playBAtSec: number         // em qual segundo da Faixa B dar play (normalmente 0)
  playBAtFormatted: string   // "0:00" ou "0:30" (se pular intro)
  introEndBSec: number       // quando o beat principal da Faixa B entra
  introEndBFormatted: string // "0:30"

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
 */
export function findOutroStart(
  segments: AudioSegment[],
  trackDurationSec: number
): { time: number; confidence: 'high' | 'medium' | 'low' } {
  const outro = segments.find(s => s.label === 'outro')
  if (outro) {
    return { time: outro.start, confidence: 'high' }
  }

  const breakdowns = segments.filter(s => s.label === 'breakdown')
  if (breakdowns.length > 0) {
    const lastBreakdown = breakdowns[breakdowns.length - 1]
    return { time: lastBreakdown.start, confidence: 'high' }
  }

  const lastDrop = [...segments].reverse().find(s => s.label === 'drop' || s.label === 'chorus')
  if (lastDrop) {
    return { time: lastDrop.start, confidence: 'medium' }
  }

  const lastVerse = [...segments].reverse().find(s => s.label === 'verse')
  if (lastVerse) {
    return { time: lastVerse.start, confidence: 'low' }
  }

  return { time: trackDurationSec * 0.7, confidence: 'low' }
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
 * 🎯 NOVO: calcula também o `playBAtSec` — em qual segundo da Faixa B
 * o DJ deve dar play, para que o beat principal da B entre alinhado
 * com o início do crossfade na Faixa A.
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

  // 2. 🆕 Ponto de entrada na faixa B (quando o beat principal entra)
  const introB = findIntroEnd(analysisB.segments)

  // 3. BPM para cálculo de barras
  const bpm = analysisA.bpm || trackA.bpm || 120
  const barDuration = secondsPerBar(bpm)

  // 4. Duração do crossfade
  const remainingA = durationA - outro.time
  const introBDuration = introB.time

  let crossfadeBars = 16
  if (introBDuration < barDuration * 16 && introBDuration >= barDuration * 8) {
    crossfadeBars = 8
    notes.push('Intro da faixa B é curto — crossfade reduzido para 8 barras')
  } else if (remainingA < barDuration * 16) {
    crossfadeBars = 8
    notes.push('Faixa A está perto do fim — crossfade reduzido para 8 barras')
  } else if (remainingA >= barDuration * 32 && introBDuration >= barDuration * 32) {
    crossfadeBars = 32
    notes.push('Espaço de sobra — crossfade estendido para 32 barras')
  }

  const crossfadeDuration = barDuration * crossfadeBars

  // 5. Crossfade termina quando a faixa A for desligada
  const crossfadeEnd = roundToNearestBar(outro.time, bpm, 16)

  // 6. Crossfade começa = fim - duração
  const crossfadeStart = Math.max(0, crossfadeEnd - crossfadeDuration)

  // 7. 🆕 playBAt: quando dar play na Faixa B
  //
  // Queremos que o BEAT PRINCIPAL da Faixa B (introEndB) caia exatamente
  // no crossfadeStart. Então:
  //
  //   playBAt = crossfadeStart - introEndB
  //
  // Se introEndB for 0 (faixa começa direto com o beat), playBAt = crossfadeStart.
  // Se playBAt for negativo, significa que a Faixa B não tem intro suficiente
  // para cobrir o crossfade — aí damos play em 0 e a faixa B entra "no meio".
  //
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

    // 🆕 Campos da Faixa B
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