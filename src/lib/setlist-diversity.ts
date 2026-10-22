import { Prisma } from '@prisma/client'
import { Track } from './types'
import { prisma } from './prisma'
import { getTransitionScore } from './harmonic-utils'

const HISTORY_LIMIT = 10

export async function applyDiversity(
  tracks: Track[],
  userId: string
): Promise<{ tracks: Track[]; changes: number }> {
  // 1. Busca o histórico de uso (últimos 10 setlists)
  const recentSetlists = await prisma.setlist.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    include: { tracks: { select: { trackId: true } } }
  })

  const usageCount = new Map<string, number>()
  for (const set of recentSetlists) {
    for (const t of set.tracks) {
      if (t.trackId) {
        usageCount.set(t.trackId, (usageCount.get(t.trackId) || 0) + 1)
      }
    }
  }

  const getFreshness = (trackId: string) => {
    const count = usageCount.get(trackId) || 0
    if (count >= 5) return 0
    return 100 - (count * 20)
  }

  // 2. Busca o POOL de substitutas (TODAS as faixas com segments do usuário)
  const allTracks = await prisma.track.findMany({
    where: { userId, segments: { not: Prisma.DbNull } },
    select: {
      id: true, title: true, artist: true, bpm: true, key: true,
      energy: true, durationSec: true, firstBeatSec: true,
    },
  })

  const setIds = new Set(tracks.map(t => t.id))
  const pool = allTracks.filter(t => !setIds.has(t.id)) // só as que NÃO estão no set

  let changes = 0
  const finalTracks = [...tracks]
const usedIds = new Set(finalTracks.map(t => t.id)) // IDs já usados no set
  // 3. Loop de troca (MMR)
  for (let i = 0; i < finalTracks.length; i++) {
    const track = finalTracks[i]
    const freshness = getFreshness(track.id)

    if (false) {
      // Acha a posição anterior (pra calcular o score de mixagem)
      const prev = i > 0 ? finalTracks[i - 1] : null
      const next = i < finalTracks.length - 1 ? finalTracks[i + 1] : null

      // Filtra candidatas do pool que têm score de mixagem parecido
      const candidates = pool.filter(c => getFreshness(c.id) >= 80)
      
      if (candidates.length > 0) {
        // Acha a candidata com o melhor score médio de mixagem (prev → candidate → next)
        let bestCandidate: Track | null = null
        let bestScore = -1

        for (const c of candidates) {
          if (usedIds.has(c.id)) continue;
          let score = 0
          if (prev) score += getTransitionScore(prev!, c)
          if (next) score += getTransitionScore(c, next!)
          score = score / (prev && next ? 2 : 1)

          if (score > bestScore) {
            bestScore = score
            bestCandidate = c
          }
        }

        if (bestCandidate && bestScore >= 75) {
          finalTracks[i] = bestCandidate as any
          usedIds.add(bestCandidate!.id)
          changes++
          console.log(`[diversity] Troca: ${track.title} → ${bestCandidate!.title} (fresh ${freshness})`)
        }
      }
    }
  }

  return { tracks: finalTracks, changes }
}