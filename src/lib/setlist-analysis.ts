import type { AudioAnalysis } from './mix-timeline'
import { discoverMixPoints } from './mix-timeline'

/**
 * Issue de transição entre 2 faixas (mesmo formato do SetlistView).
 */
export interface TransitionIssue {
  index: number
  fromTitle: string
  toTitle: string
  severity: 'critical' | 'warning' | 'unknown'
  score: number
  reason: string
}

export interface TrackForAnalysis {
  id: string
  title: string
  bpm?: number
  key?: string
  energy?: number
}

/**
 * Analisa as transições de um setlist usando discoverMixPoints (estrutura + BPM + Camelot).
 *
 * Retorna o número de issues críticas, warnings e o score médio.
 */
export function analyzeTransitions(
  setlist: { setlist: TrackForAnalysis[] },
  analyses: Record<string, AudioAnalysis>,
  durations: Record<string, number>
): {
  total: number
  ok: number
  issues: TransitionIssue[]
  criticalCount: number
  warningCount: number
  unknownCount: number
  avgScore: number
} {
  const issues: TransitionIssue[] = []
  let total = 0
  let ok = 0
  let scoreSum = 0

  for (let i = 0; i < setlist.setlist.length - 1; i++) {
    const a = setlist.setlist[i]
    const b = setlist.setlist[i + 1]
    total++

    const analysisA = analyses[a.id]
    const analysisB = analyses[b.id]
    const durationA = durations[a.id] ?? 0
    const durationB = durations[b.id] ?? 0

    // Se uma das 2 não tem análise estrutural → 'unknown'
    if (!analysisA || !analysisB) {
      issues.push({
        index: i,
        fromTitle: a.title,
        toTitle: b.title,
        severity: 'unknown',
        score: 0,
        reason: 'faixa sem análise estrutural',
      })
      continue
    }

    // Calcula via discoverMixPoints (usa segments + BPM + Camelot)
    let score = 0
    try {
      const { best } = discoverMixPoints(
        a as any,
        b as any,
        analysisA,
        analysisB,
        durationA,
        durationB
      )
      score = best.score
    } catch (err) {
      // Se falhar, trata como unknown
      issues.push({
        index: i,
        fromTitle: a.title,
        toTitle: b.title,
        severity: 'unknown',
        score: 0,
        reason: 'erro ao calcular transição',
      })
      continue
    }

    scoreSum += score

    let worstSeverity: 'ok' | 'warning' | 'critical' = 'ok'
    if (score < 40) worstSeverity = 'critical'
    else if (score < 60) worstSeverity = 'warning'

    if (worstSeverity === 'ok') {
      ok++
    } else {
      const reasons: string[] = []
      if (a.bpm && b.bpm && Math.abs(a.bpm - b.bpm) > 10) {
        reasons.push(`BPM salta ${a.bpm} → ${b.bpm}`)
      }
      if (a.key && b.key) {
        // Camelot distante
        const m = (a.key + '').match(/^(\d{1,2})([AB])$/i)
        const n = (b.key + '').match(/^(\d{1,2})([AB])$/i)
        if (m && n) {
          const numA = parseInt(m[1], 10)
          const numB = parseInt(n[1], 10)
          const letA = m[2].toUpperCase()
          const letB = n[2].toUpperCase()
          const diff = Math.abs(numA - numB)
          const wrapDiff = Math.min(diff, 12 - diff)
          const isBad = (letA !== letB && wrapDiff > 2) || (letA === letB && wrapDiff > 2)
          if (isBad) reasons.push(`Camelot ${a.key} → ${b.key} distante`)
        }
      }

      issues.push({
        index: i,
        fromTitle: a.title,
        toTitle: b.title,
        severity: worstSeverity,
        score,
        reason: reasons.length > 0 ? reasons.join(' · ') : 'score baixo',
      })
    }
  }

  return {
    total,
    ok,
    issues,
    criticalCount: issues.filter(x => x.severity === 'critical').length,
    warningCount: issues.filter(x => x.severity === 'warning').length,
    unknownCount: issues.filter(x => x.severity === 'unknown').length,
    avgScore: total > 0 ? Math.round(scoreSum / total) : 0,
  }
}