import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { generateSmartSet } from '@/lib/tsp'
import { getTransitionScore } from '@/lib/harmonic-utils'
import type { Track as FrontendTrack } from '@/lib/types'

const RECENT_SETLISTS_FOR_EQUALITY = 100
const BASE_SEED = 42

function normalizeTitle(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function buildSetlistSignature(
  tracks: Array<{ trackId: string | null; title: string }>
): { ids: Set<string>; titles: Set<string> } {
  const ids = new Set<string>()
  const titles = new Set<string>()

  for (const t of tracks) {
    if (t.trackId && !t.trackId.startsWith('gen-')) {
      ids.add(t.trackId)
    }
    if (t.title) {
      titles.add(normalizeTitle(t.title))
    }
  }

  return { ids, titles }
}

function signaturesMatch(
  a: { ids: Set<string>; titles: Set<string> },
  b: { ids: Set<string>; titles: Set<string> }
): boolean {
  if (a.ids.size > 0 && b.ids.size > 0 && a.ids.size === b.ids.size) {
    let allIn = true
    for (const id of a.ids) {
      if (!b.ids.has(id)) {
        allIn = false
        break
      }
    }
    if (allIn) return true
  }

  if (
    a.titles.size > 0 &&
    b.titles.size > 0 &&
    a.titles.size === b.titles.size
  ) {
    let allIn = true
    for (const t of a.titles) {
      if (!b.titles.has(t)) {
        allIn = false
        break
      }
    }
    if (allIn) return true
  }

  return false
}

function getAdaptiveEnergyCurve(tracks: FrontendTrack[]): { target: number }[] {
  if (tracks.length === 0) return []
  
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }
  for (const t of tracks) {
    const energy = Math.round((t as any).energy || 0)
    if (energy >= 1 && energy <= 10) counts[energy]++
  }

  let mostCommonEnergy = 6
  let maxCount = 0
  for (let i = 1; i <= 10; i++) {
    if (counts[i] > maxCount) {
      maxCount = counts[i]
      mostCommonEnergy = i
    }
  }

  const baseEnergy = mostCommonEnergy
  const curve = [
    { target: Math.max(1, baseEnergy - 2) }, 
    { target: Math.max(2, baseEnergy - 1) }, 
    { target: Math.min(10, baseEnergy) },
    { target: Math.max(2, baseEnergy - 2) }, 
  ]

  return curve
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userId = session.user.id

    let body: any = {}
    try {
      body = await req.json()
    } catch {}

    const setSize = Math.max(1, Math.min(body.setSize ?? 30, 200))
    const bpmTarget = typeof body.bpmTarget === 'number' && body.bpmTarget > 0 ? body.bpmTarget : null
    const bpmRange = typeof body.bpmRange === 'number' && body.bpmRange > 0 ? body.bpmRange : 10
    const minCamelotScore = body.camelotStrict ? 85 : 0
    const baseSeed = typeof body.seed === 'number' ? body.seed : BASE_SEED
    
    const customEnergyBlocks: number[] | undefined = Array.isArray(body.energyBlocks) ? body.energyBlocks : undefined
    const energyTrend: 'steady' | 'build' | 'wave' | undefined = body.energyTrend

    const recentSetlists = await prisma.setlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_SETLISTS_FOR_EQUALITY,
      include: { tracks: { select: { trackId: true, title: true } } },
    })

    const SETS_RECENT = 10
    const SETS_MEDIUM = 30
    const SETS_OLD = 100
    const PENALTY_RECENT = 0.9
    const PENALTY_MEDIUM = 0.7
    const PENALTY_OLD = 0.4

    const usagePenalty: Record<string, number> = {}
    for (let i = 0; i < recentSetlists.length; i++) {
      const setAge = i
      let penalty = 0
      if (setAge < SETS_RECENT) penalty = PENALTY_RECENT
      else if (setAge < SETS_MEDIUM) penalty = PENALTY_MEDIUM
      else if (setAge < SETS_OLD) penalty = PENALTY_OLD
      else continue

      for (const t of recentSetlists[i].tracks) {
        if (t.trackId && !t.trackId.startsWith('gen-')) {
          usagePenalty[t.trackId] = Math.max(usagePenalty[t.trackId] ?? 0, penalty)
        }
      }
    }

    const recentSignatures = recentSetlists.map(sl => buildSetlistSignature(sl.tracks))

    const rejectedTracks = await prisma.rejectedTrack.findMany({
      where: { userId },
      select: { trackId: true },
    })
    const rejectedTrackIds = new Set(rejectedTracks.map(r => r.trackId))

    const likedSetlists = await prisma.likedSetlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    let targetEnergyFromLikes: number | null = null
    if (likedSetlists.length > 0) {
      const energies = likedSetlists.map(s => s.energyAvg).filter((e): e is number => e !== null && e > 0)
      if (energies.length > 0) {
        targetEnergyFromLikes = energies.reduce((a, b) => a + b, 0) / energies.length
      }
    }

    const prismaTracks = await prisma.track.findMany({
      where: { 
        userId, 
        bpm: { gt: 0 }, 
        segments: { not: Prisma.DbNull },
        id: { notIn: Array.from(rejectedTrackIds) }
      },
      select: { 
        id: true, 
        folderId: true, 
        title: true, 
        artist: true, 
        bpm: true, 
        key: true, 
        energy: true, 
        durationSec: true, 
        firstBeatSec: true, 
        segments: true 
      },
    })

    if (prismaTracks.length === 0) {
      return NextResponse.json({ error: 'Nenhuma faixa disponível com análise estrutural.' }, { status: 400 })
    }

    const library: FrontendTrack[] = prismaTracks.map(t => {
      const segs = t.segments as any
      return {
        id: t.id, folderId: t.folderId, title: t.title, artist: t.artist,
        bpm: t.bpm, key: t.key, energy: segs?.energy ?? 0, firstBeatSec: t.firstBeatSec,
        durationMs: t.durationSec > 0 ? Math.round(t.durationSec * 1000) : undefined,
      }
    })

    const uniqueLibraryMap = new Map<string, FrontendTrack>()
    for (const track of library) {
      const key = normalizeTitle(track.title)
      if (!uniqueLibraryMap.has(key)) uniqueLibraryMap.set(key, track)
    }
    const uniqueLibrary = Array.from(uniqueLibraryMap.values())

    const recentForDiversity = await prisma.setlist.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 20, 
      include: { tracks: { select: { trackId: true } } },
    })

    const usedIds = new Set<string>()
    for (const set of recentForDiversity) {
      for (const t of set.tracks) {
        if (t.trackId) usedIds.add(t.trackId)
      }
    }

    let filteredLibrary = uniqueLibrary.filter(t => !usedIds.has(t.id))

    if (filteredLibrary.length < setSize) {
      console.warn(`[rotation] ALERTA: Sobraram menos faixas (${filteredLibrary.length}) do que o tamanho do set (${setSize}).`)
    }

    const uniqueTitles = new Set<string>()
    const cleanLibrary = filteredLibrary.filter(t => {
      const normTitle = t.title.trim().toLowerCase()
      if (uniqueTitles.has(normTitle)) return false
      uniqueTitles.add(normTitle)
      return true
    })

    const adaptiveCurve = getAdaptiveEnergyCurve(filteredLibrary)

    let finalCurve: { target: number }[]
    
    if (customEnergyBlocks) {
      finalCurve = customEnergyBlocks.map(target => ({ target }))
    } else if (energyTrend === 'steady') {
      const baseEnergy = 9
      finalCurve = Array.from({ length: 4 }, () => ({ target: baseEnergy }))
    } else if (energyTrend === 'build') {
      finalCurve = [
        { target: 8 },
        { target: 9 },
        { target: 10 },
        { target: 9 },
      ]
    } else if (energyTrend === 'wave') {
      finalCurve = [
        { target: 9 },
        { target: 10 },
        { target: 8 },
        { target: 10 },
      ]
    } else {
      finalCurve = adaptiveCurve
    }

    let finalResult: ReturnType<typeof generateSmartSet> | null = null
    let attemptUsed = 0

    for (let attempt = 0; attempt < 30; attempt++) {
      const seed = baseSeed + (attempt * 13)
      attemptUsed = attempt + 1

      const result = generateSmartSet(cleanLibrary, {
        count: setSize,
        bpmTarget, bpmRange, minCamelotScore, seed,
        multiStart: 500, 
        twoOptPasses: 2,
        usagePenalty,
        minTransitionScore: 90,
        energyCurve: finalCurve,
      })

      if (result.tracks.length > 0 && result.passedQualityCheck) {
        const signature = buildSetlistSignature(result.tracks.map(t => ({ trackId: t.id, title: t.title })))
        if (!recentSignatures.some(sig => signaturesMatch(sig, signature))) {
          finalResult = result
          break
        }
      }
    }

    if (!finalResult) {
       for (let attempt = 0; attempt < 20; attempt++) {
         const seed = baseSeed + (attempt * 17)
         const relaxedResult = generateSmartSet(cleanLibrary, {
           count: setSize, bpmTarget, bpmRange, minCamelotScore, seed,
           multiStart: 300,
           twoOptPasses: 2, usagePenalty, minTransitionScore: 85,
           energyCurve: finalCurve,
         })
         
         if (relaxedResult.tracks.length > 0) {
            if (!finalResult || relaxedResult.worstScore > finalResult.worstScore) {
                finalResult = relaxedResult
            }
            if (relaxedResult.passedQualityCheck) break 
         }
       }
    }

    if (!finalResult || finalResult.tracks.length === 0) {
       return NextResponse.json({ 
         error: 'Não foi possível montar o set.',
         suggestion: 'Sua biblioteca não tem faixas com mixagem perfeita (90+) para este BPM/Tom. Tente mudar o BPM alvo ou aumentar o Range.'
       }, { status: 400 })
    }

    const variety: 'low' | 'medium' | 'high' = body.variety || 'medium'
    
    if (finalResult && finalResult.tracks.length > 0) {
      const lambda = variety === 'high' ? 0.6 : variety === 'low' ? 1.0 : 0.8
      
      const tracksWithMMR = finalResult.tracks.map(track => {
        const similarity = usedIds.has(track.id) ? 1.0 : 0.0
        const originalScore = finalResult.averageScore
        let mmrScore = lambda * originalScore - (1 - lambda) * similarity * 100
        
        if (targetEnergyFromLikes !== null) {
          const trackEnergy = (track as any).energy || 0
          const energyDiff = Math.abs(trackEnergy - targetEnergyFromLikes)
          if (energyDiff <= 1.5) {
            mmrScore += 15
          }
        }
        
        return { track, mmrScore, originalScore }
      })
      
      tracksWithMMR.sort((a, b) => b.mmrScore - a.mmrScore)
      finalResult.tracks = tracksWithMMR.map(item => item.track)
    }

    const isDuplicate = recentSignatures.some(sig => 
        signaturesMatch(sig, buildSetlistSignature(finalResult!.tracks.map(t => ({ trackId: t.id, title: t.title }))))
    )

    const finalTracks = finalResult.tracks
    const fixScore = finalResult.averageScore

    // 🆕 AJUSTE CRÍTICO: Garante que os dados de duração e análise vão para o frontend
    // Mapeamos a lista final para incluir o objeto segments (análise) e duração
    const responseTracks = finalTracks.map(t => {
      // Busca a versão completa dessa faixa na biblioteca do banco para pegar os segments
      const originalDbTrack = prismaTracks.find(pt => pt.id === t.id)
      
            // 🆕 DESANINHA O OBJETO: Se os segments vieram dentro de um objeto, pega apenas o array
      let finalSegments = originalDbTrack?.segments || null
      if (finalSegments && typeof finalSegments === 'object' && 'segments' in finalSegments) {
        finalSegments = (finalSegments as any).segments
      }

      return {
        id: t.id, 
        title: t.title,
        artist: t.artist,
        bpm: t.bpm,
        key: t.key,
        energy: t.energy,
        durationSec: originalDbTrack?.durationSec || 0, 
        segments: finalSegments, // 🆕 Agora é um array puro, não um objeto aninhado
      }
    })

    const savedSetlist = await prisma.setlist.create({
      data: {
        name: `Smart · ${new Date().toLocaleDateString('pt-BR')}`,
        eventType: 'Smart',
        duration: 'auto',
        energyCurve: 'auto',
        audience: null,
        analysis: `Setlist gerado por TSP (Padrão Ouro) · score médio ${fixScore}/100 · ${attemptUsed} tentativa(s)`,
        djTip: null,
        peakMoment: null,
        totalDuration: `${finalTracks.length} faixas`,
        userId,
        folderId: (typeof body.folderId === 'string' && body.folderId !== 'all') ? body.folderId : null,
        tracks: {
          create: finalTracks.map((t, i) => {
            const mp = finalResult!.mixPoints[`${i}`] || null
            const score = i < finalTracks.length - 1 
              ? getTransitionScore(t, finalTracks[i + 1], i, finalTracks.length, usagePenalty)
              : 100

            return {
              position: i + 1, 
              trackId: t.id, 
              title: t.title, 
              artist: t.artist,
              bpm: t.bpm, 
              key: t.key, 
              energy: t.energy, 
              transitionNote: mp ? JSON.stringify({ ...mp, score }) : null, 
            }
          }),
        },
      },
    })

    return NextResponse.json({
      id: savedSetlist.id,
      tracks: responseTracks, // 🆕 Devolve a lista "recheada" com a análise!
      averageScore: fixScore,
      worstScore: finalResult.worstScore,
      candidates: finalResult.candidates,
      requestedCount: finalResult.requestedCount,
      effectiveCount: finalResult.effectiveCount,
      elapsedMs: finalResult.elapsedMs,
      seed: finalResult.seed,
      attempts: attemptUsed,
      duplicate: isDuplicate,
      warning: isDuplicate ? `Esse set já apareceu nos últimos ${RECENT_SETLISTS_FOR_EQUALITY} setlists.` : undefined,
      filters: { bpmTarget, bpmRange, camelotStrict: !!body.camelotStrict, setSize, energyTrend, variety },
      mixPoints: finalResult.mixPoints,
    })

  } catch (error) {
    console.error('[api/generate-smart-setlist] Erro:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Erro: ${message}` }, { status: 500 })
  }
}