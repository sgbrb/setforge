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

export interface MixPointCandidate {
  exitFromA: number
  enterIntoB: number
  crossfadeBars: number
  score: number
  reasons: string[]
  snapPriority: number
  exitLabel: string
  enterLabel: string
}

export interface MixTimeline {
  playAtSec: number
  crossfadeStartSec: number
  crossfadeEndSec: number
  crossfadeStartBarNumber?: number
  crossfadeEndBarNumber?: number
  crossfadeEndOffset?: number
  stopASec: number

  playBAtSec: number
  playBAtFormatted: string
  introEndBSec: number
  introEndBFormatted: string

  playAtFormatted: string
  crossfadeStartFormatted: string
  crossfadeEndFormatted: string
  stopAFormatted: string

  crossfadeDurationSec: number
  crossfadeBars: number

  confidence: 'high' | 'medium' | 'low'
  notes: string[]

  startOffsetA?: number
  crossfadeStartGlobalSec?: number
  crossfadeEndGlobalSec?: number
  playBAtGlobalSec?: number
  crossfadeStartGlobalFormatted?: string
  crossfadeEndGlobalFormatted?: string
  playBAtGlobalFormatted?: string

  score?: number
  scoreReasons?: string[]
  exitLabel?: string
  enterLabel?: string
  alternatives?: MixPointCandidate[]
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
    if (['chorus', 'drop', 'verse', 'solo'].includes(label) && lastIntroEnd > 0) break
  }
  return { time: lastIntroEnd, confidence }
}

export function findOutroStart(segments: AudioSegment[], durationSec: number): { time: number; confidence: 'high' | 'medium' | 'low' } {
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

export function roundToNearestBar(sec: number, bpm: number, firstBeatSec: number = 0): number {
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

export function snapToBar(sec: number, bpm: number, firstBeatSec: number, targetBars: number = 8): { snappedSec: number; barNumber: number; offsetFromGrid: number } {
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
// DISCOVER MIX POINTS
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

function parseCamelot(key: string): { num: number; letter: 'A' | 'B' } | null {
  if (!key) return null
  const match = key.trim().match(/^(\d{1,2})\s*([AB])$/i)
  if (!match) return null
  const num = parseInt(match[1], 10)
  if (num < 1 || num > 12) return null
  return { num, letter: match[2].toUpperCase() as 'A' | 'B' }
}

function camelotScore(keyA: string, keyB: string): number {
  const a = parseCamelot(keyA)
  const b = parseCamelot(keyB)
  if (!a || !b) return 0
  if (a.num === b.num && a.letter === b.letter) return 30
  if (a.letter === b.letter) {
    const diff = Math.abs(a.num - b.num)
    const wrapDiff = Math.min(diff, 12 - diff)
    if (wrapDiff === 1) return 25
    if (wrapDiff === 2) return 20
  }
  if (a.num === b.num && a.letter !== b.letter) return 15
  return 0
}

function bpmScore(bpmA: number, bpmB: number): number {
  if (bpmA <= 0 || bpmB <= 0) return 10
  const diff = Math.abs(bpmA - bpmB)
  if (diff <= 3) return 20
  if (diff <= 6) return 10
  if (diff <= 10) return 5
  return 0
}

function exitPointScore(label: string): number {
  const l = label.toLowerCase()
  if (l === 'chorus') return 20
  if (l === 'drop') return 20
  if (l === 'breakdown') return 10
  if (l === 'outro') return 8
  if (l === 'inst') return 5
  return 3
}

function enterPointScore(label: string): number {
  const l = label.toLowerCase()
  if (l === 'drop') return 20
  if (l === 'chorus') return 15
  if (l === 'inst') return 10
  if (l === 'intro') return 8
  return 3
}

function listExitCandidates(analysisA: AudioAnalysis, durationA: number, bpm: number, firstBeat: number): Array<{ time: number; label: string }> {
  const candidates: Array<{ time: number; label: string }> = []
  const segments = analysisA.segments || []
  const maxTime = durationA * 0.95

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const label = seg.label.toLowerCase()

    // 🆕 IGNORA start e end, foca nos segmentos musicais
    if (!['chorus', 'drop', 'breakdown', 'outro', 'inst'].includes(label)) continue
    if (seg.end > maxTime) continue
    if (seg.end - seg.start < 4) continue

    const snapped = snapToBar(seg.end, bpm, firstBeat, 16)
    const snapped8 = snapToBar(seg.end, bpm, firstBeat, 8)
    const snapped4 = snapToBar(seg.end, bpm, firstBeat, 4)

    const use16 = Math.abs(snapped.snappedSec - seg.end) < 2
    const use8 = Math.abs(snapped8.snappedSec - seg.end) < 2
    const final = use16 ? snapped : use8 ? snapped8 : snapped4

    candidates.push({ time: final.snappedSec, label: seg.label })
  }

  // Deduplica
  const dedup: Array<{ time: number; label: string }> = []
  for (const c of candidates) {
    if (!dedup.some(d => Math.abs(d.time - c.time) < 0.5)) dedup.push(c)
  }

  // 🆕 Se não achou nada, pega o penúltimo segmento (o último inst antes do end)
  if (dedup.length === 0 && segments.length > 1) {
    for (let i = segments.length - 2; i >= 0; i--) {
      const seg = segments[i]
      const label = seg.label.toLowerCase()
      if (['inst', 'chorus', 'drop', 'outro'].includes(label)) {
        const snapped = snapToBar(seg.end, bpm, firstBeat, 8)
        dedup.push({ time: snapped.snappedSec, label: seg.label })
        break
      }
    }
  }

  return dedup.slice(-8)
}
function listEnterCandidates(analysisB: AudioAnalysis, bpm: number, firstBeat: number): Array<{ time: number; label: string }> {
  const candidates: Array<{ time: number; label: string }> = []
  const segments = analysisB.segments || []
  const maxTime = Math.min(...segments.map(s => s.end)) + 120
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
    if (!dedup.some(d => Math.abs(d.time - c.time) < 0.5)) dedup.push(c)
  }
  return dedup.slice(0, 8)
}

export function discoverMixPoints(
  trackA: Track,
  trackB: Track,
  analysisA: AudioAnalysis,
  analysisB: AudioAnalysis,
  durationA: number,
  durationB: number,
  tspScore?: number
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
      let score = camelot
      if (camelot >= 30) reasons.push('Camelot perfeito')
      else if (camelot >= 25) reasons.push('Camelot adjacente')
      else if (camelot >= 15) reasons.push('Camelot ok')
      
      score += bpmS
      if (bpmS >= 20) reasons.push('BPM idêntico')

      const exitS = exitPointScore(exit.label)
      score += exitS
      if (exitS >= 20) reasons.push(`saída no ${exit.label}`)

      const enterS = enterPointScore(enter.label)
      score += enterS
      if (enterS >= 20) reasons.push(`entrada no ${enter.label}`)

      const remaining = durationA - exit.time
      
      // 🆕 A MÁGICA AQUI: Exigir que a saída esteja nos últimos 40% da música
      // Se estiver no meio (remaining < 40% da duração), a nota despenca
      if (remaining < durationA * 0.35) {
        score -= 40 // Penalidade pesada
        reasons.push('⚠️ saída muito no meio da música')
      } else if (remaining >= 60) {
        score += 10
        reasons.push('sobra 1min+ pra crossfade')
      } else if (remaining >= 30) {
        score += 5
      }

      // Crossfade bars: cabe no espaço?
      // Só permite 32 barras se tiver 1min de sobra
      const maxCross = Math.min(remaining, durationB - enter.time)
      const barDur = secondsPerBar(bpmA)
      
      let crossBars = 4
      if (remaining >= 60) {
        // Se tem 1min de sobra, pode usar 32 ou 16
        for (const bars of [32, 16, 8]) {
          if (barDur * bars <= maxCross) { crossBars = bars; break }
        }
      } else {
        // Se tem pouco espaço, só 4 ou 8
        for (const bars of [8, 4]) {
          if (barDur * bars <= maxCross) { crossBars = bars; break }
        }
      }

      if (crossBars < 4) {
        score -= 15
        reasons.push('⚠️ espaço curto pra crossfade')
      }

      candidates.push({
        exitFromA: exit.time,
        enterIntoB: enter.time,
        crossfadeBars: crossBars,
        score: Math.max(0, Math.min(100, Math.round(score))),
        reasons,
        snapPriority: 16,
        exitLabel: exit.label,
        enterLabel: enter.label,
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  // 🆕 FALLBACK INTELIGENTE
  if (candidates.length === 0) {
    const isApproved = tspScore !== undefined && tspScore >= 80
    
    const fallback: MixPointCandidate = {
      exitFromA: durationA > 60 ? durationA - 30 : durationA * 0.75,
      enterIntoB: 0,
      crossfadeBars: 16,
      score: isApproved ? 90 : 30,
      reasons: isApproved 
        ? ['TSP aprovou · crossfade padrão de 16 barras']
        : ['fallback — sem candidatos de mix point detectados'],
      snapPriority: isApproved ? 16 : 4,
      exitLabel: isApproved ? 'final da faixa (padrão)' : 'fallback',
      enterLabel: isApproved ? 'início da faixa (padrão)' : 'fallback',
    }
    return { best: fallback, alternatives: [] }
  }

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
  startOffsetA: number = 0,
  tspScore?: number // 🆕 Parâmetro extra
): MixTimeline {
  const notes: string[] = []
  const { best, alternatives } = discoverMixPoints(
    trackA, trackB, analysisA, analysisB, durationA, durationB, tspScore
  )
    const safeBest = best ?? {
    exitFromA: durationA > 60 ? durationA - 15 : durationA * 0.75, // 15s antes do fim
    enterIntoB: 0,
    crossfadeBars: 16,
    score: 85, // 🆕 Nota mais alta para fallback (não é erro, é padrão)
    reasons: ['fallback seguro — usando o final da faixa'],
    snapPriority: 16,
    exitLabel: 'final da faixa',
    enterLabel: 'início da faixa',
  }
  const crossfadeEnd = safeBest.exitFromA
  const crossfadeBars = safeBest.crossfadeBars
  const bpm = analysisA.bpm || trackA.bpm || 120
  const barDuration = secondsPerBar(bpm)
  const crossfadeDuration = barDuration * crossfadeBars
  const crossfadeStart = Math.max(0, crossfadeEnd - crossfadeDuration)
  const playBAtSec = safeBest.enterIntoB
  const introB = { time: safeBest.enterIntoB, confidence: 'medium' as const }
  const confidence: 'high' | 'medium' | 'low' =
    safeBest.score >= 80 ? 'high' : safeBest.score >= 60 ? 'medium' : 'low'
  notes.push(`Score ${safeBest.score}/100 — ${safeBest.reasons.slice(0, 3).join(' · ')}`)
  if (crossfadeBars < 16) {
    notes.push(`Crossfade reduzido para ${crossfadeBars} barras (espaço limitado)`)
  } else if (crossfadeBars === 32) {
    notes.push('Espaço de sobra — crossfade estendido para 32 barras')
  }
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
    introEndBSec: safeBest.enterIntoB,
    introEndBFormatted: formatSeconds(safeBest.enterIntoB),
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
    score: safeBest.score,
    scoreReasons: safeBest.reasons,
    exitLabel: safeBest.exitLabel,
    enterLabel: safeBest.enterLabel,
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
  setlist: Array<{ track: Track; analysis: AudioAnalysis; duration: number; tspScore?: number }> // 🆕 Aceita tspScore
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
      currentOffsetA,
      a.tspScore // 🆕 Passa a nota do TSP
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