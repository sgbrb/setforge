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
  // Instruções em segundos
  playAtSec: number          // quando soltar a faixa B (em segundos da faixa A)
  crossfadeStartSec: number  // quando começar o crossfade
  crossfadeEndSec: number    // quando terminar o crossfade
  stopASec: number           // quando desligar a faixa A

  // Instruções formatadas (M:SS) — o que o DJ vê
  playAtFormatted: string
  crossfadeStartFormatted: string
  crossfadeEndFormatted: string
  stopAFormatted: string

  // Metadados
  crossfadeDurationSec: number
  crossfadeBars: number       // quantas barras tem o crossfade
  confidence: 'high' | 'medium' | 'low'  // quão confiante é o cálculo
  notes: string[]             // observações para o DJ
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
 * Uma barra tem 4 beats (compasso 4/4, o padrão da música eletrônica).
 */
export function secondsPerBar(bpm: number): number {
  if (bpm <= 0) return 2 // fallback: assume 120 BPM (0.5s por beat)
  return (60 / bpm) * 4
}

/**
 * Encontra o "intro end" — o momento em que o beat está estabelecido
 * e o DJ pode soltar a faixa B.
 *
 * Estratégia:
 * - Se houver múltiplos segmentos "intro", pega o FIM do último.
 * - Se não houver "intro", pega o fim do primeiro "verse" ou "chorus".
 * - Se não houver nenhum, retorna 0 (início da faixa).
 */
export function findIntroEnd(segments: AudioSegment[]): { time: number; confidence: 'high' | 'medium' | 'low' } {
  const intros = segments.filter(s => s.label === 'intro')
  if (intros.length > 0) {
    // Último intro (a faixa pode ter 2 intros — bateria + melodia)
    const lastIntro = intros[intros.length - 1]
    return { time: lastIntro.end, confidence: 'high' }
  }

  // Fallback: fim do primeiro verse/chorus
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
 * Estratégia (em ordem de preferência):
 * 1. Se houver "outro", usar o START dele.
 * 2. Se não houver, usar o START do último "breakdown".
 * 3. Se não houver, usar o START do último "drop" ou "chorus".
 * 4. Se não houver nada, usar o fim do último "verse".
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

  // 2. Último breakdown (o DJ sai antes do breakdown, não depois)
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

  // 4. Fim do último verse
  const lastVerse = [...segments].reverse().find(s => s.label === 'verse')
  if (lastVerse) {
    return { time: lastVerse.start, confidence: 'low' }
  }

  // 5. Fallback: 70% da duração total
  return { time: trackDurationSec * 0.7, confidence: 'low' }
}

/**
 * Arredonda um tempo para o múltiplo de barra mais próximo.
 * Isso garante que o mix-in/out caia em phrase boundaries (16/32 barras).
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
 * @param trackA Faixa que está tocando (a que vai sair)
 * @param trackB Faixa que vai entrar
 * @param analysisA Análise estrutural da faixa A
 * @param analysisB Análise estrutural da faixa B
 * @param durationA Duração total da faixa A em segundos (se conhecida)
 */
export function calculateMixTimeline(
  trackA: Track,
  trackB: Track,
  analysisA: AudioAnalysis,
  analysisB: AudioAnalysis,
  durationA: number = 300
): MixTimeline {
  const notes: string[] = []

  // 1. Encontra o ponto de saída na faixa A
  const outro = findOutroStart(analysisA.segments, durationA)

  // 2. Encontra o ponto de entrada na faixa B
  const intro = findIntroEnd(analysisB.segments)

  // 3. Usa o BPM da faixa A (assumindo transição suave) para calcular barras
  const bpm = analysisA.bpm || trackA.bpm || 120
  const barDuration = secondsPerBar(bpm)

  // 4. Duração do crossfade = min(outro restante de A, intro de B)
  //    Restrição prática: 16 ou 32 barras (evita crossfades muito curtos/longos)
  const remainingA = durationA - outro.time
  const introBDuration = intro.time

  let crossfadeBars = 16 // padrão
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
  //    = mix-out point (alinhado ao phrase boundary mais próximo)
  const crossfadeEnd = roundToNearestBar(outro.time, bpm, 16)

  // 6. Crossfade começa = fim - duração
  const crossfadeStart = Math.max(0, crossfadeEnd - crossfadeDuration)

  // 7. DJ solta a faixa B no início do crossfade
  const playAt = crossfadeStart

  // 8. Confiança geral = a pior das duas detecções
  const confidence: 'high' | 'medium' | 'low' =
    outro.confidence === 'low' || intro.confidence === 'low'
      ? 'low'
      : outro.confidence === 'medium' || intro.confidence === 'medium'
        ? 'medium'
        : 'high'

  if (outro.confidence === 'low') {
    notes.push('Estrutura da faixa A pouco clara — verifique o ponto de saída')
  }
  if (intro.confidence === 'low') {
    notes.push('Estrutura da faixa B pouco clara — verifique o ponto de entrada')
  }

  return {
    playAtSec: playAt,
    crossfadeStartSec: crossfadeStart,
    crossfadeEndSec: crossfadeEnd,
    stopASec: crossfadeEnd,

    playAtFormatted: formatSeconds(playAt),
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
 * Gera a timeline para uma sequência inteira de faixas (o setlist completo).
 * Retorna uma lista de "transições" — uma para cada par consecutivo.
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