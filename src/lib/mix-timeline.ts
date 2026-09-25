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
 * 🆕 Candidato de mix point (saída A + entrada B + score).
 */
export interface MixPointCandidate {
  exitFromA: number         // segundo na A
  enterIntoB: number        // segundo na B
  crossfadeBars: number
  score: number             // 0-100
  reasons: string[]
  snapPriority: number      // 16, 8, ou 4
  exitLabel: string         // ex: "chorus"
  enterLabel: string        // ex: "drop"
}

/**
 * Resultado do cálculo de mixagem entre duas faixas.
 */
export interface MixTimeline {
  // Instruções na Faixa A
  playAtSec: number
  crossfadeStartSec: number
  crossfadeEndSec: number
  crossfadeStartBarNumber?: number
  crossfadeEndBarNumber?: number
  crossfadeEndOffset?: number
  stopASec: number

  // Instruções na Faixa B
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

  // Tempos globais (no tempo do SET)
  startOffsetA?: number
  crossfadeStartGlobalSec?: number
  crossfadeEndGlobalSec?: number
  playBAtGlobalSec?: number
  crossfadeStartGlobalFormatted?: string
  crossfadeEndGlobalFormatted?: string
  playBAtGlobalFormatted?: string

  // 🆕 Mix point discovery
  score?: number                                  // 0-100
  scoreReasons?: string[]                         // por que esse score
  exitLabel?: string                              // ex: "chorus"
  enterLabel?: string                             // ex: "drop"
  alternatives?: MixPointCandidate[]              // top 3
}

// ============================================================
// UTILITÁRIOS
// ============================================================

export function formatSeconds(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const mins = Math.floor(sec / 60)
  const secs = Math.floor(sec % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatSecondsWithDecimal(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00.0'
  const mins = Math.floor(sec / 60)
  const secs = Math.floor(sec % 60)
  const dec = Math.round((sec - Math.floor(sec)) * 10)
  return `${mins}:${secs.toString().padStart(2, '0')}.${dec}`
}

export function secondsPerBar(bpm: number): number {
  return (60 / bpm) * 4
}

export function findIntroEnd(segments: AudioSegment[]): { time: number; confidence: 'high' | 'medium' | 'low' } {
  if (!segments || segments.length === 0) {
    return { time: 0, confidence: 'low' }
  }

  let lastIntroEnd = 0
  let confidence: 'high' | 'medium' | 'low' = 'low'

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const label = seg.label.toLowerCase()

    if (label === 'intro' || label === 'inst' || label === 'start') {
      lastIntroEnd = seg.end
      confidence = label === 'intro' ? 'high' : 'medium'
    }

    if (['chorus', 'drop', 'verse', 'solo'].includes(label) && lastIntroEnd > 0) {
      break
    }
  }

  return { time: lastIntroEnd, confidence }
}

export function findOutroStart(
  segments: AudioSegment[],
  durationSec: number
): { time: number; confidence: 'high' | 'medium' | 'low' } {
  if (!segments || segments.length === 0) {
    return { time: durationSec * 0.75, confidence: 'low' }
  }

  for (const seg of segments) {
    if (seg.label.toLowerCase() === 'outro') {
      return { time: seg.start, confidence: 'high' }
    }
  }

  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].label.toLowerCase() === 'chorus') {
      return { time: segments[i].start, confidence: 'medium' }
    }
  }

  return { time: durationSec * 0.75, confidence: 'low' }
}

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

export function barNumberAt(sec: number, bpm: number, firstBeatSec: number): number {
  if (bpm <= 0) return 0
  const barDur = secondsPerBar(bpm)
  return (sec - firstBeatSec) / barDur
}

export function offsetFromGrid(sec: number, bpm: number, firstBeatSec: number): number {
  const bar = barNumberAt(sec, bpm, firstBeatSec)
  return bar - Math.floor(bar)
}

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
// 🆕 DISCOVER MIX POINTS
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

/**
 * Parse do Camelot (ex: "8A" → { num: 8, letter: 'A' }).
 */
function parseCamelot(key: string): { num: number; letter: 'A' | 'B' } | null {
  if (!key) return null
  const match = key.trim().match(/^(\d{1,2})\s*([AB])$/i)
  if (!match) return null
  const num = parseInt(match[1], 10)
  if (num < 1 || num > 12) return null
  return { num, letter: match[2].toUpperCase() as 'A' | 'B' }
}

/**
 * Compatibilidade Camelot (0-30 pontos).
 */
function camelotScore(keyA: string, keyB: string): number {
  const a = parseCamelot(keyA)
  const b = parseCamelot(keyB)
  if (!a || !b) return 0

  if (a.num === b.num && a.letter === b.letter) return 30   // perfeito

  if (a.letter === b.letter) {
    const diff = Math.abs(a.num - b.num)
    const wrapDiff = Math.min(diff, 12 - diff)
    if (wrapDiff === 1) return 25   // adjacente
    if (wrapDiff === 2) return 20
  }

  if (a.num === b.num && a.letter !== b.letter) return 15   // mesmo número, muda humor

  return 0
}

/**
 * Compatibilidade BPM (0-20 pontos).
 */
function bpmScore(bpmA: number, bpmB: number): number {
  if (bpmA <= 0 || bpmB <= 0) return 10
  const diff = Math.abs(bpmA - bpmB)
  if (diff <= 3) return 20
  if (diff <= 6) return 10
  if (diff <= 10) return 5
  return 0
}

/**
 * Score do ponto de saída da A (0-20 pontos).
 */
function exitPointScore(label: string): number {
  const l = label.toLowerCase()
  if (l === 'chorus') return 20
  if (l === 'drop') return 20
  if (l === 'breakdown') return 10
  if (l === 'outro') return 8
  if (l === 'inst') return 5
  return 3
}

/**
 * Score do ponto de entrada da B (0-20 pontos).
 */
function enterPointScore(label: string): number {
  const l = label.toLowerCase()
  if (l === 'drop') return 20
  if (l === 'chorus') return 15
  if (l === 'inst') return 10
  if (l === 'intro') return 8
  return 3
}

/**
 * 🆕 Lista candidatos de saída da A (fim de segmentos "importantes").
 */
function listExitCandidates(
  analysisA: AudioAnalysis,
  durationA: number,
  bpm: number,
  firstBeat: number
): Array<{ time: number; label: string }> {
  const candidates: Array<{ time: number; label: string }> = []
  const segments = analysisA.segments || []

  // Limita a 40% do fim da faixa (pra não pegar o último inst)
  const maxTime = durationA * 0.9

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const label = seg.label.toLowerCase()

    if (!['chorus', 'drop', 'breakdown', 'outro', 'inst'].includes(label)) continue
    if (seg.end > maxTime) continue
    if (seg.end - seg.start < 4) continue   // ignora segmentos < 4s

    // Snap pra 16/8/4 barras
    const snapped = snapToBar(seg.end, bpm, firstBeat, 16)
    const snapped8 = snapToBar(seg.end, bpm, firstBeat, 8)
    const snapped4 = snapToBar(seg.end, bpm, firstBeat, 4)

    // Escolhe o snap mais próximo do original (prioriza 16 > 8 > 4)
    const use16 = Math.abs(snapped.snappedSec - seg.end) < 2
    const use8 = Math.abs(snapped8.snappedSec - seg.end) < 2
    const final = use16 ? snapped : use8 ? snapped8 : snapped4

    candidates.push({ time: final.snappedSec, label: seg.label })
  }

  // Deduplica por tempo (com margem de 0.5s)
  const dedup: Array<{ time: number; label: string }> = []
  for (const c of candidates) {
    if (!dedup.some(d => Math.abs(d.time - c.time) < 0.5)) {
      dedup.push(c)
    }
  }

  return dedup.slice(-8)   // pega os últimos 8 candidatos
}

/**
 * 🆕 Lista candidatos de entrada da B (início de segmentos "importantes").
 */
function listEnterCandidates(
  analysisB: AudioAnalysis,
  bpm: number,
  firstBeat: number
): Array<{ time: number; label: string }> {
  const candidates: Array<{ time: number; label: string }> = []
  const segments = analysisB.segments || []

  // Pega só o primeiro terço da faixa (a entrada tem que ser cedo)
  const maxTime = Math.min(...segments.map(s => s.end)) + 120   // 2min de margem
  const hardLimit = segments.length > 0 ? segments[segments.length - 1].end * 0.4 : Infinity

  for (const seg of segments) {
    const label = seg.label.toLowerCase()

    if (!['drop', 'chorus', 'inst', 'intro'].includes(label)) continue
    if (seg.start > maxTime || seg.start > hardLimit) continue
    if (seg.end - seg.start < 4) continue

    const snapped = snapToBar(seg.start, bpm, firstBeat, 16)
    const snapped8 = snapToBar(seg.start, bpm, firstBeat, 8)
    const snapped4 = snapToBar(seg.start, bpm, firstBeat, 4)

    const use16 = Math.abs(snapped.snappedSec - seg.start) < 2
    const use8 = Math.abs(snapped8.snappedSec - seg.start) < 2
    const final = use16 ? snapped : use8 ? snapped8 : snapped4

    candidates.push({ time: final.snappedSec, label: seg.label })
  }

  const dedup: Array<{ time: number; label: string }> = []
  for (const c of candidates) {
    if (!dedup.some(d => Math.abs(d.time - c.time) < 0.5)) {
      dedup.push(c)
    }
  }

  return dedup.slice(0, 8)   // primeiros 8 candidatos
}

/**
 * 🆕 Descobre o melhor par (saída A, entrada B) entre vários candidatos.
 *
 * Score (0-100):
 * - Camelot: 0-30
 * - BPM: 0-20
 * - Saída da A: 0-20
 * - Entrada da B: 0-20
 * - Salience (sobra da A): 0-10
 */
export function discoverMixPoints(
  trackA: Track,
  trackB: Track,
  analysisA: AudioAnalysis,
  analysisB: AudioAnalysis,
  durationA: number,
  durationB: number
): { best: MixPointCandidate; alternatives: MixPointCandidate[] } {
  const bpmA = analysisA.bpm || trackA.bpm || 120
  const bpmB = analysisB.bpm || trackB.bpm || 120

  const exits = listExitCandidates(analysisA, durationA, bpmA, trackA.firstBeatSec ?? 0)
  const enters = listEnterCandidates(analysisB, bpmB, trackB.firstBeatSec ?? 0)

  const camelot = camelotScore(trackA.key || '', trackB.key || '')
  const bpmS = bpmScore(bpmA, bpmB)

  const candidates: MixPointCandidate[] = []

  for (const exit of exits) {
    for (const enter of enters) {
      const reasons: string[] = []

      // 🎯 Score: Camelot (0-30)
      let score = camelot
      if (camelot >= 30) reasons.push('Camelot perfeito')
      else if (camelot >= 25) reasons.push('Camelot adjacente')
      else if (camelot >= 15) reasons.push('Camelot ok')

      // 🎯 Score: BPM (0-20)
      score += bpmS
      if (bpmS >= 20) reasons.push('BPM idêntico')

      // 🎯 Score: saída da A (0-20)
      const exitS = exitPointScore(exit.label)
      score += exitS
      if (exitS >= 20) reasons.push(`saída no ${exit.label}`)

      // 🎯 Score: entrada da B (0-20)
      const enterS = enterPointScore(enter.label)
      score += enterS
      if (enterS >= 20) reasons.push(`entrada no ${enter.label}`)

      // 🎯 Score: salience — sobra da A depois do exit (0-10)
      const remaining = durationA - exit.time
      if (remaining >= 60) {
        score += 10
        reasons.push('sobra 1min+ pra crossfade')
      } else if (remaining >= 30) {
        score += 5
      }

      // 🎯 Crossfade bars: cabe no espaço?
      const maxCross = Math.min(remaining, durationB - enter.time, exit.time)
      const barDur = secondsPerBar(bpmA)
      let crossBars = 4
      for (const bars of [32, 16, 8, 4]) {
        if (barDur * bars <= maxCross) {
          crossBars = bars
          break
        }
      }

      // Penalidade se crossfade ficou muito curto
      if (crossBars < 4) {
        score -= 15
        reasons.push('⚠️ espaço curto pra crossfade')
      }

      // 🎯 Prioridade de snap (16 > 8 > 4)
      const snapPriority = 16

      candidates.push({
        exitFromA: exit.time,
        enterIntoB: enter.time,
        crossfadeBars: crossBars,
        score: Math.max(0, Math.min(100, Math.round(score))),
        reasons,
        snapPriority,
        exitLabel: exit.label,
        enterLabel: enter.label,
      })
    }
  }

  // Ordena por score desc
  candidates.sort((a, b) => b.score - a.score)

  // Melhor = primeiro. Alternativas = próximos 3 (com score próximo)
  const best = candidates[0]
  const alternatives = candidates.slice(1, 4)

  return { best, alternatives }
}

// ============================================================
// CÁLCULO DE MIXAGEM (A → B)
// ============================================================

export function calculateMixTimeline(
  trackA: Track,
  trackB: Track,
  analysisA: AudioAnalysis,
  analysisB: AudioAnalysis,
  durationA: number = 300,
  durationB: number = 300,
  startOffsetA: number = 0
): MixTimeline {
  const notes: string[] = []

  // 🆕 Descobre o melhor par (saída A, entrada B)
  const { best, alternatives } = discoverMixPoints(
    trackA, trackB, analysisA, analysisB, durationA, durationB
  )

  // 🆕 Usa os pontos escolhidos pelo discovery
  const crossfadeEnd = best.exitFromA
  const crossfadeBars = best.crossfadeBars
  const bpm = analysisA.bpm || trackA.bpm || 120
  const barDuration = secondsPerBar(bpm)
  const crossfadeDuration = barDuration * crossfadeBars
  const crossfadeStart = Math.max(0, crossfadeEnd - crossfadeDuration)

  const playBAtSec = best.enterIntoB
  const introB = { time: best.enterIntoB, confidence: 'medium' as const }

  // Confidence geral baseado no score
  const confidence: 'high' | 'medium' | 'low' =
    best.score >= 80 ? 'high' : best.score >= 60 ? 'medium' : 'low'

  // Notas
  notes.push(`Score ${best.score}/100 — ${best.reasons.slice(0, 3).join(' · ')}`)

  if (crossfadeBars < 16) {
    notes.push(`Crossfade reduzido para ${crossfadeBars} barras (espaço limitado)`)
  } else if (crossfadeBars === 32) {
    notes.push('Espaço de sobra — crossfade estendido para 32 barras')
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
    crossfadeEndBarNumber: barNumberAt(crossfadeEnd, bpm, trackA.firstBeatSec ?? 0),
    crossfadeEndOffset: 0,

    playBAtSec,
    playBAtFormatted: formatSecondsWithDecimal(playBAtSec),
    introEndBSec: best.enterIntoB,
    introEndBFormatted: formatSeconds(best.enterIntoB),

    playAtFormatted: formatSeconds(crossfadeStart),
    crossfadeStartFormatted: formatSeconds(crossfadeStart),
    crossfadeEndFormatted: formatSeconds(crossfadeEnd),
    stopAFormatted: formatSeconds(crossfadeEnd),

    crossfadeDurationSec: crossfadeDuration,
    crossfadeBars,
    confidence,
    notes,

    startOffsetA,
    crossfadeStartGlobalSec,
    crossfadeEndGlobalSec,
    playBAtGlobalSec,
    crossfadeStartGlobalFormatted: formatSeconds(crossfadeStartGlobalSec),
    crossfadeEndGlobalFormatted: formatSeconds(crossfadeEndGlobalSec),
    playBAtGlobalFormatted: formatSeconds(playBAtGlobalSec),

    // 🆕 Discovery
    score: best.score,
    scoreReasons: best.reasons,
    exitLabel: best.exitLabel,
    enterLabel: best.enterLabel,
    alternatives,
  }
}

// ============================================================
// CADEIA COMPLETA
// ============================================================

export interface Transition {
  from: Track
  to: Track
  timeline: MixTimeline
  startOffsetA: number
}

export function calculateFullTimeline(
  setlist: Array<{ track: Track; analysis: AudioAnalysis; duration: number }>
): Transition[] {
  const transitions: Transition[] = []
  let currentOffsetA = 0

  for (let i = 0; i < setlist.length - 1; i++) {
    const a = setlist[i]
    const b = setlist[i + 1]

    const timeline = calculateMixTimeline(
      a.track, b.track,
      a.analysis, b.analysis,
      a.duration, b.duration,
      currentOffsetA
    )

    transitions.push({
      from: a.track,
      to: b.track,
      timeline,
      startOffsetA: currentOffsetA,
    })

    currentOffsetA = (timeline.crossfadeStartGlobalSec ?? 0) - timeline.playBAtSec
  }

  return transitions
}