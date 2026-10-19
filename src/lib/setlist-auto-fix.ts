import type { Track } from './types'
import type { AudioAnalysis } from './mix-timeline'
import { discoverMixPoints } from './mix-timeline'
import { analyzeTransitions } from './setlist-analysis'

interface PrismaLike {
  track: {
    findMany: (args: any) => Promise<any[]>
  }
}

export async function autoFixSetlist(
  tracks: Track[],
  analyses: Record<string, AudioAnalysis>,
  durations: Record<string, number>,
  prisma: PrismaLike,
  userId: string,
  maxIterations = 3
): Promise<{ tracks: Track[]; iterations: number; finalScore: number }> {
  let current = [...tracks]
  let iterations = 0
  let finalScore = 0

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations++

    const result = analyzeTransitions(
      { setlist: current as any },
      analyses,
      durations
    )

    finalScore = result.avgScore

    if (result.criticalCount === 0) break

    const currentIds = new Set(current.map(t => t.id))

    for (const issue of result.issues) {
      if (issue.severity !== 'critical') continue

      const idx = issue.index
      const fromTrack = current[idx]
      const fromAnalysis = analyses[fromTrack.id]
      const fromDuration = durations[fromTrack.id] ?? 0

      if (!fromAnalysis || fromDuration <= 0) continue

      const candidates = await prisma.track.findMany({
        where: {
          userId,
          segments: { not: null },
          id: { notIn: [...currentIds, fromTrack.id] },
        },
        take: 100,
        select: {
          id: true,
          title: true,
          artist: true,
          bpm: true,
          key: true,
          energy: true,
          durationSec: true,
          firstBeatSec: true,
          segments: true,
        },
      })

      let bestCandidate: { track: any; score: number } | null = null

      for (const c of candidates) {
        const cAnalysis = c.segments as AudioAnalysis
        if (!cAnalysis) continue

        const cDuration = c.durationSec ?? 0
        if (cDuration <= 0) continue

        try {
          const { best } = discoverMixPoints(
            fromTrack as any,
            c as any,
            fromAnalysis,
            cAnalysis,
            fromDuration,
            cDuration
          )

          if (!bestCandidate || best.score > bestCandidate.score) {
            bestCandidate = { track: c, score: best.score }
          }
        } catch {
          continue
        }
      }

      if (bestCandidate && bestCandidate.score > issue.score) {
        const newTrack: Track = {
          id: bestCandidate.track.id,
          folderId: null,
          title: bestCandidate.track.title,
          artist: bestCandidate.track.artist,
          bpm: bestCandidate.track.bpm,
          key: bestCandidate.track.key,
          energy: bestCandidate.track.energy,
          source: 'upload' as any,
          firstBeatSec: bestCandidate.track.firstBeatSec ?? 0,
        }

        current[idx] = newTrack

        analyses[newTrack.id] = bestCandidate.track.segments
        durations[newTrack.id] = bestCandidate.track.durationSec ?? 0
      }
    }

    if (current.length === tracks.length) {
      const changed = current.some((t, i) => t.id !== tracks[i]?.id)
      if (!changed) break
    }
  }

  return { tracks: current, iterations, finalScore }
}