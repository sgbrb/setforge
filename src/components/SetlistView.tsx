'use client'

import { useState, useMemo, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import { getTransitionScore } from '@/lib/harmonic-utils'
import { GeneratedSetlist, Track, Folder } from '@/lib/types'
import {
  MixTimeline,
  MixPointCandidate,
  AudioAnalysis,
  AudioSegment,
  formatSeconds,
  calculateFullTimeline,
  discoverMixPoints,
} from '@/lib/mix-timeline'
import { analyzeTransitions, type TransitionIssue } from '@/lib/setlist-analysis'
import { getTargetEnergy } from '@/lib/harmonic-utils'
import CompatibilityMatrix from './CompatibilityMatrix'
import EnergyCurveChart from './EnergyCurveChart'
import HarmonyCurveChart from './HarmonyCurveChart'
import SaveToFolderButton from './SaveToFolderButton'
import type { SmartSetlistFilters } from './SmartSetlistModal'

interface SetlistViewProps {
  setlist: GeneratedSetlist
  onRegenerate?: () => void
  onUpdate?: () => void 
  analyses?: Record<string, AudioAnalysis>
  durations?: Record<string, number>
  allTracks?: Track[]
  allFolders?: Folder[]
  energyTrend?: 'steady' | 'build' | 'wave' | 'custom'
  bpmTarget?: number | null
  bpmRange?: number
  filters?: SmartSetlistFilters | null
}

export default function SetlistView({
  setlist,
  onRegenerate,
  onUpdate,
  analyses,
  durations,
  allTracks = [],
  allFolders = [],
  energyTrend, 
  bpmTarget,
  bpmRange,
  filters,
}: SetlistViewProps) {
  const [expandedTransition, setExpandedTransition] = useState<number | null>(0)
  const [showMatrix, setShowMatrix] = useState(false)
  const [transitionsOtimas, setTransitionsOtimas] = useState<Record<string, any[]>>({})
  const [transitionsBoas, setTransitionsBoas] = useState<Record<string, any[]>>({})

  useEffect(() => {
    fetch('/transicoes_otimas.json')
      .then(r => r.ok ? r.json() : {})
      .then(setTransitionsOtimas)
      .catch(() => setTransitionsOtimas({}))

    fetch('/transicoes_boas.json')
      .then(r => r.ok ? r.json() : {})
      .then(setTransitionsBoas)
      .catch(() => setTransitionsBoas({}))
  }, [])

  const getScore = (fromTrack: any, toTrack: any): number => {
    if (!fromTrack?.id || !toTrack?.id) return 0
    let match = transitionsOtimas[fromTrack.id]?.find((o: any) => o.toTrackId === toTrack.id)
    if (!match) {
      match = transitionsBoas[fromTrack.id]?.find((o: any) => o.toTrackId === toTrack.id)
    }
    if (match) return Math.round(match.score)
    return getTransitionScore(fromTrack, toTrack, 0, 20) 
  }

  const [lockedKeys, setLockedKeys] = useState<Set<number>>(new Set())
  
  const toggleKeyLock = (index: number) => {
    setLockedKeys(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const [isLikingSet, setIsLikingSet] = useState(false)
  const [likedSet, setLikedSet] = useState(false)

  const handleLikeSet = async () => {
    setIsLikingSet(true)
    try {
      const energyAvg = setlist.setlist.reduce((acc, t) => acc + (t.energy || 0), 0) / setlist.setlist.length
      const bpmTarget = (setlist as any).filters?.bpmTarget || null
      const res = await fetch('/api/setlist/like-setlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setlistId: setlist.id, bpmTarget, energyAvg }),
      })
      if (!res.ok) throw new Error('Erro ao curtir set')
      setLikedSet(true)
      alert('Set curtido! O sistema vai usar essa vibe nos próximos sets.')
    } catch (err) {
      alert('Erro ao curtir o set')
    } finally {
      setIsLikingSet(false)
    }
  }

  const [isReplacing, setIsReplacing] = useState<number | null>(null)
  const [rejectedTracks, setRejectedTracks] = useState<Record<number, string[]>>({})

  const handleReplaceTrack = async (index: number, keyOffset: number = 0, targetEnergy: number | null = null) => {
    setIsReplacing(index)
    const storageKey = `rejected_${setlist.id}`
    const stored = localStorage.getItem(storageKey)
    const allRejeitadas: string[] = stored ? JSON.parse(stored) : []
    const isLocked = lockedKeys.has(index)

    try {
      const res = await fetch('/api/setlist/replace-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          setlistId: setlist.id, 
          positionToReplace: index + 1,
          rejectedIds: allRejeitadas,
          keyOffset: isLocked ? 0 : keyOffset,
          targetEnergy,
          forcedKey: isLocked ? setlist.setlist[index].key : undefined,
          bpmTarget: filters?.bpmTarget || bpmTarget,
          bpmRange: filters?.bpmRange || bpmRange,
          energyTrend: filters?.energyTrend || energyTrend
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao trocar')

      const newRejeitadas = [...allRejeitadas, data.newTrack.id]
      localStorage.setItem(storageKey, JSON.stringify(newRejeitadas))

      if (onUpdate) onUpdate()
      else window.location.reload()
    } catch (err: any) {
      alert(err.message || 'Erro ao trocar faixa')
    } finally {
      setIsReplacing(null)
    }
  }

  const handleExpandSet = async () => {
    const amount = prompt('Quantas faixas a mais você quer adicionar ao final do set?', '10')
    if (!amount) return
    
    try {
      const res = await fetch('/api/setlist/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setlistId: setlist.id, additionalTracks: Number(amount) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      alert('Set expandido com sucesso!')
      window.location.reload()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const tracksWithoutAnalysis = useMemo(() => {
    if (!analyses || Object.keys(analyses).length === 0) return []
    return setlist.setlist.filter(t => !analyses[t.id] && !(t as any)._analysis)
  }, [setlist, analyses])

  const copyMissingNames = async () => {
    if (tracksWithoutAnalysis.length === 0) return
    const text = tracksWithoutAnalysis.map(t => t.title).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      alert(`✅ ${tracksWithoutAnalysis.length} nome${tracksWithoutAnalysis.length !== 1 ? 's' : ''} copiado${tracksWithoutAnalysis.length !== 1 ? 's' : ''}.\n\nCole no Bloco de Notas, busque os arquivos no HD, e faça upload.`)
    } catch (err) {
      console.error('[SetlistView] Erro ao copiar:', err)
      alert('Não foi possível copiar. Tenta de novo.')
    }
  }

  // 🆕 A MÁGICA ACONTECE AQUI
  const transitions = useMemo(() => {
    if (!analyses || !durations) return []
    
    const items = setlist.setlist.map(t => {
      let tspScore = 100
      try {
        const note = t.transitionNote ? JSON.parse(t.transitionNote) : null
        if (note?.score !== undefined) tspScore = note.score
      } catch {}
      
      let finalAnalysis = (t as any)._analysis || analyses[t.id]
      
      if (!finalAnalysis || !finalAnalysis.segments || finalAnalysis.segments.length === 0) {
        const trackTitleNormalized = t.title.toLowerCase().trim()
        const foundTrack = allTracks.find(ot => 
          ot.title.toLowerCase().trim() === trackTitleNormalized ||
          ot.title.toLowerCase().trim().includes(trackTitleNormalized)
        )
        if (foundTrack && analyses[foundTrack.id]) {
          finalAnalysis = analyses[foundTrack.id]
        }
      }

      let finalDuration = (t as any)._duration || durations[t.id] || 0
      if (finalDuration === 0) {
        const foundTrack = allTracks.find(ot => ot.title.toLowerCase().trim() === t.title.toLowerCase().trim())
        if (foundTrack && durations[foundTrack.id]) {
          finalDuration = durations[foundTrack.id]
        }
      }

      return {
        track: t as any,
        analysis: finalAnalysis,
        duration: finalDuration,
        tspScore: tspScore,
      }
    })
        // 🆕 LOG CIRÚRGICO (adicione aqui)
    console.log("DEBUG ITEMS:", items.map((i: any) => ({
      title: i.track.title,
      temAnalysis: !!i.analysis,
      qtdSegments: i.analysis?.segments?.length || 0,
      duracao: i.duration
    })))
    // A verificação bloqueante foi REMOVIDA. 
    // Se a música não tiver estrutura, o mix-timeline.ts usa o fallback.
    const timeline = calculateFullTimeline(items)

    for (let i = 0; i < timeline.length; i++) {
      const from = setlist.setlist[i]
      let noteData = null
      try { 
        noteData = from.transitionNote ? JSON.parse(from.transitionNote) : null 
      } catch {}
      
      const realScore = noteData?.score !== undefined ? noteData.score : 100
      
      if (timeline[i] && timeline[i].timeline) {
        timeline[i].timeline.score = realScore
      }
    }

    return timeline
  }, [setlist, analyses, durations, allTracks])

  const suggestions = useMemo(() => ({} as Record<number, Array<{ track: Track; score: number; folderName: string | null }>>), [])

  const exportPdf = async () => {
    try {
      const eqMap: Record<number, any> = {}
      for (let i = 0; i < setlist.setlist.length - 1; i++) {
        const t = transitions[i]
        if (t?.timeline) eqMap[i] = t.timeline
      }

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      let y = margin

      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('SETFORGE — SET LIST', margin, y)
      y += 8

      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      const dateStr = new Date().toLocaleDateString('pt-BR')
      doc.text(`${setlist.setlist.length} faixas · gerado em ${dateStr}`, margin, y)
      y += 4

      doc.setDrawColor(180, 180, 180)
      doc.line(margin, y, pageWidth - margin, y)
      y += 6

      if (setlist.analysis) {
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        const analysisLines = doc.splitTextToSize(setlist.analysis, pageWidth - 2 * margin)
        doc.text(analysisLines, margin, y)
        y += analysisLines.length * 3.5 + 4
      }

      doc.setTextColor(0, 0, 0)
      doc.setFontSize(10)

      for (let i = 0; i < setlist.setlist.length; i++) {
        const track = setlist.setlist[i]
        const timeline = eqMap[i]

        const needsSpace = timeline?.eqAdvice ? 34 : 12
        if (y > pageHeight - margin - needsSpace) {
          doc.addPage()
          y = margin
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        const num = String(i + 1).padStart(2, '0')
        doc.text(`${num}.`, margin, y)

        doc.setFont('helvetica', 'normal')
        const titleText = track.title.length > 70 
          ? track.title.slice(0, 67) + '...' 
          : track.title
        doc.text(titleText, margin + 8, y)
        y += 4

        doc.setFontSize(8)
        doc.setTextColor(100, 100, 100)
        const details: string[] = []
        if (track.bpm) details.push(`${track.bpm} BPM`)
        if (track.key) details.push(`${track.key}`)
        if (track.energy) details.push(`energia ${track.energy}/10`)
        doc.text(details.join(' · '), margin + 8, y)
        y += 4

        if (timeline && timeline.eqAdvice) {
         const from = String(i + 1).padStart(2, '0')
const to = String(i + 2).padStart(2, '0')

doc.setTextColor(0, 0, 0)
doc.setFont('helvetica', 'bold')
doc.setFontSize(9)
doc.text(`ENTRAR COM A M${to}: ${formatSeconds(timeline.crossfadeStartSec)} da M${from}`, margin + 8, y)
y += 4
doc.text(`SOLTAR A M${to} em: ${timeline.playBAtFormatted} (pule intro)`, margin + 8, y)
y += 4
doc.text(`FINALIZAR A M${from}: ${formatSeconds(timeline.stopASec)}  ·  ${timeline.crossfadeBars} bars`, margin + 8, y)
y += 4

doc.setFont('helvetica', 'normal')
doc.setFontSize(7)
doc.setTextColor(120, 120, 120)
doc.text(`relógio do set: ${timeline.crossfadeStartGlobalFormatted} a ${timeline.crossfadeEndGlobalFormatted}`, margin + 8, y)
y += 3.5
doc.setTextColor(60, 60, 60)

          doc.text(`LOW: ${timeline.eqAdvice.low.replace(/·.*$/, '').trim()}`, margin + 8, y)
          y += 3.2
          doc.text(`MID: ${timeline.eqAdvice.mid.replace(/·.*$/, '').trim()}`, margin + 8, y)
          y += 3.2
          doc.text(`HI:  ${timeline.eqAdvice.high.replace(/·.*$/, '').trim()}`, margin + 8, y)
          y += 3.5

          if (timeline.bassSwapBar !== undefined) {
            doc.setTextColor(80, 80, 80)
            doc.text(`BASS SWAP: compasso ${timeline.bassSwapBar}`, margin + 8, y)
            y += 3.5
          }
          doc.setTextColor(0, 0, 0)
        }

        y += 2
      }

      y += 4
      if (y < pageHeight - margin - 8) {
        doc.setDrawColor(180, 180, 180)
        doc.line(margin, y, pageWidth - margin, y)
        y += 5
        doc.setFontSize(8)
        doc.setTextColor(120, 120, 120)
        doc.text('Gerado por SetForge', margin, y)
      }

      const filename = `setforge-${dateStr.replace(/\//g, '-')}.pdf`
      doc.save(filename)

      console.log(`[SetlistView] PDF exportado: ${filename}`)
    } catch (err) {
      console.error('[SetlistView] Erro no PDF:', err)
      alert('Erro ao gerar PDF. Tenta de novo.')
    }
  }
    
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={exportPdf}
          style={{
            flex: 1,
            minWidth: 160,
            padding: '12px 20px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          📄 exportar PDF
        </button>
        <div style={{ flex: 1, minWidth: 160 }}>
          <SaveToFolderButton
            setlistId={setlist.id}
            trackIds={setlist.setlist.map(t => t.id)}
          />
        </div>
      </div>
      <button
        onClick={handleExpandSet}
        style={{
          flex: 1, minWidth: 160, padding: '12px 20px',
          background: 'linear-gradient(135deg, #7c5cfc, #c45cfc)',
          border: 'none', borderRadius: 10, color: '#fff',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        ➕ expandir set
      </button>
      {tracksWithoutAnalysis.length > 0 && (
        <div style={{
          padding: '12px 16px',            
          background: 'var(--surface2)',
          border: '1px dashed var(--border)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{
              fontSize: 13,
              color: 'var(--fg)',
              fontFamily: 'var(--font-mono, monospace)',
              margin: 0,
            }}>
              📋 {tracksWithoutAnalysis.length} de {setlist.setlist.length} faixa{setlist.setlist.length !== 1 ? 's' : ''} sem análise estrutural
            </p>
            <p style={{
              fontSize: 11,
              color: 'var(--muted)',
              margin: '4px 0 0 0',
            }}>
              Faça upload dessas pra liberar o crossfade exato
            </p>
          </div>
          <button
            onClick={copyMissingNames}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #7c5cfc, #c45cfc)',
              border: 'none',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            📋 copiar nomes
          </button>
        </div>
      )}
      <button
        onClick={handleLikeSet}
        disabled={isLikingSet}
        style={{
          flex: 1,
          minWidth: 160,
          padding: '12px 20px',
          background: likedSet ? 'rgba(252, 92, 92, 0.15)' : 'var(--surface2)',
          border: `1px solid ${likedSet ? 'var(--red)' : 'var(--border)'}`,
          borderRadius: 10,
          color: likedSet ? 'var(--red)' : 'var(--text)',
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 600,
          cursor: isLikingSet ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: isLikingSet ? 0.5 : 1,
        }}
      >
        {likedSet ? '❤️ Set Curtido' : '🤍 Curtir Set'}
      </button>

      {analyses && durations && (
        <CompatibilityAlert
          setlist={setlist}
          analyses={analyses}
          durations={durations}
          suggestions={suggestions}
          getScore={getScore}
        />
      )}

      {setlist.setlist.length > 0 && (
        <EnergyCurveChart 
          tracks={setlist.setlist}
          totalPositions={setlist.setlist.length}
          energyTrend={energyTrend} 
        />
      )}
      
      <HarmonyCurveChart 
        tracks={setlist.setlist}
        totalPositions={setlist.setlist.length}
      />
      
      {setlist.analysis && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--green)',
              boxShadow: '0 0 8px var(--green)',
            }} />
            <p style={{
              fontSize: 11,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono, monospace)',
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
              análise do set
            </p>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
            {setlist.analysis}
          </p>
        </div>
      )}

      <div>
        <p style={{
          fontSize: 11,
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono, monospace)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 12,
        }}>
          sequência ({setlist.setlist.length} faixas)
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {setlist.setlist.map((track, i) => {
            const isLast = i === setlist.setlist.length - 1
            const transition = transitions[i]

            return (
              <div key={track.id || i}>
                <TrackRow
                  track={track}
                  index={i}
                  entryOffset={i > 0 ? transitions[i - 1]?.timeline.crossfadeStartGlobalSec : undefined}
                  onReplace={(keyOffset, targetEnergy) => handleReplaceTrack(i, keyOffset, targetEnergy)}
                  isReplacing={isReplacing === i}
                  isLocked={lockedKeys.has(i)}
                  onToggleLock={() => toggleKeyLock(i)} 
                />

                {!isLast && transition && (
                  <TransitionRow
                    from={track}
                    to={setlist.setlist[i + 1]}
                    timeline={transition.timeline}
                    analysisA={(track as any)._analysis || analyses?.[track.id] || null}
                    durationA={(track as any)._duration || durations?.[track.id] || 0}
                    isExpanded={expandedTransition === i}
                    onToggle={() =>
                      setExpandedTransition(expandedTransition === i ? null : i)
                    }
                    index={i}
                  />
                )}

                {!isLast && !transition && (
                  <div style={{
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginLeft: 16,
                  }}>
                    <div style={{
                      width: 2,
                      height: 24,
                      background: 'var(--border)',
                      borderRadius: 1,
                    }} />
                    <p style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontStyle: 'italic',
                    }}>
                      análise de mixagem disponível após upload
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TrackRow({
  track,
  index,
  entryOffset,
  onReplace,
  isReplacing,
  isLocked,
  onToggleLock,
}: {
  track: any
  index: number
  entryOffset?: number
  onReplace?: (keyOffset?: number, targetEnergy?: number | null) => void
  isReplacing?: boolean
  isLocked?: boolean
  onToggleLock?: () => void  
}) {
  const energyColor = track.energy >= 8 ? 'var(--red)'
    : track.energy >= 6 ? 'var(--yellow)'
      : 'var(--green)'

  const currentEnergy = Math.round(track.energy || 0)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '14px 16px',
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 10,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: 'var(--surface)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 12, fontWeight: 700, color: 'var(--muted)', flexShrink: 0,
      }}>
        {index + 1}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track.title}
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track.artist}
        </p>
      </div>

      {entryOffset !== undefined && entryOffset > 0 && (
        <span style={{
          fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono, monospace)',
          padding: '2px 8px', background: 'rgba(124, 92, 252, 0.15)', borderRadius: 4, flexShrink: 0,
        }}>
          entra aos {formatSeconds(entryOffset)}
        </span>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
        {track.bpm > 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
            {track.bpm} BPM
          </span>
        )}

        {track.key && track.key !== 'desconhecido' && track.key !== '' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onReplace && (
              <button
                onClick={() => onReplace(-1, null)}
                disabled={isReplacing || isLocked}
                title={isLocked ? "Tom travado" : "Buscar tom -1"}
                style={{
                  background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                  color: isReplacing || isLocked ? 'var(--muted)' : 'var(--text)', 
                  padding: '2px 5px', fontSize: 10, 
                  cursor: isReplacing || isLocked ? 'not-allowed' : 'pointer',
                  opacity: isLocked ? 0.3 : 1,
                }}
              >
                -
              </button>
            )}
            
            <span style={{
              fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono, monospace)',
              padding: '2px 8px', background: 'rgba(124, 92, 252, 0.15)', borderRadius: 4,
            }}>
              {track.key}
            </span>

            {onReplace && (
              <button
                onClick={() => onReplace(1, null)}
                disabled={isReplacing || isLocked}
                title={isLocked ? "Tom travado" : "Buscar tom +1"}
                style={{
                  background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                  color: isReplacing || isLocked ? 'var(--muted)' : 'var(--text)', 
                  padding: '2px 5px', fontSize: 10, 
                  cursor: isReplacing || isLocked ? 'not-allowed' : 'pointer',
                  opacity: isLocked ? 0.3 : 1,
                }}
              >
                +
              </button>
            )}

            {onToggleLock && (
              <button
                onClick={onToggleLock}
                disabled={isReplacing}
                title={isLocked ? "Destravar Tom" : "Travar Tom (mantém ao trocar energia)"}
                style={{
                  background: 'transparent', border: 'none', cursor: isReplacing ? 'not-allowed' : 'pointer',
                  fontSize: 14, padding: '2px 4px', opacity: isReplacing ? 0.5 : 1,
                }}
              >
                {isLocked ? '🔒' : '🔓'}
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {onReplace && (
            <button
              onClick={() => onReplace(0, Math.max(1, currentEnergy - 1))}
              disabled={isReplacing}
              title="Baixar energia"
              style={{
                background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                color: 'var(--text)', padding: '2px 5px', fontSize: 10, cursor: isReplacing ? 'not-allowed' : 'pointer',
              }}
            >
              -
            </button>
          )}

          <div style={{ display: 'flex', gap: 2 }} title={`Energia ${track.energy}/10`}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 3, height: 12, borderRadius: 1,
                  background: i < track.energy ? energyColor : 'var(--border)',
                }}
              />
            ))}
          </div>

          {onReplace && (
            <button
              onClick={() => onReplace(0, Math.min(10, currentEnergy + 1))}
              disabled={isReplacing}
              title="Aumentar energia"
              style={{
                background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                color: 'var(--text)', padding: '2px 5px', fontSize: 10, cursor: isReplacing ? 'not-allowed' : 'pointer',
              }}
            >
              +
            </button>
          )}
        </div>

        {onReplace && (
          <button
            onClick={() => onReplace(0, null)}
            disabled={isReplacing}
            title="Trocar música (mantendo padrão)"
            style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
              color: isReplacing ? 'var(--muted)' : 'var(--text)', padding: '4px 8px', fontSize: 12,
              cursor: isReplacing ? 'not-allowed' : 'pointer', opacity: isReplacing ? 0.5 : 1,
            }}
          >
            {isReplacing ? '⟳' : '🔄'}
          </button>
        )}
      </div>
    </div>
  )
}

const SEGMENT_STYLES: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  intro:     { color: '#5c9cfc', bg: 'rgba(92, 156, 252, 0.35)',  label: 'intro',     icon: '↓' },
  inst:      { color: '#7a9ac4', bg: 'rgba(122, 154, 196, 0.35)', label: 'inst',      icon: '▪' },
  verse:     { color: '#8a8a9a', bg: 'rgba(138, 138, 154, 0.35)', label: 'verse',     icon: '▪' },
  chorus:    { color: '#c45cfc', bg: 'rgba(196, 92, 252, 0.35)',  label: 'chorus',    icon: '♪' },
  drop:      { color: '#fc5c5c', bg: 'rgba(252, 92, 92, 0.40)',   label: 'drop',      icon: '🔥' },
  breakdown: { color: '#fccc5c', bg: 'rgba(252, 204, 92, 0.35)',  label: 'breakdown', icon: '⚡' },
  outro:     { color: '#4cfc9a', bg: 'rgba(76, 252, 154, 0.35)',  label: 'outro',     icon: '↑' },
  solo:      { color: '#fc9a5c', bg: 'rgba(252, 154, 92, 0.35)',  label: 'solo',      icon: '♫' },
  start:     { color: '#5a5a6a', bg: 'rgba(90, 90, 106, 0.35)',   label: 'start',     icon: '·' },
}

function getSegmentStyle(label: string) {
  const key = label.toLowerCase()
  return SEGMENT_STYLES[key] ?? {
    color: '#7a7a8a',
    bg: 'rgba(122, 122, 138, 0.30)',
    label: label,
    icon: '·',
  }
}

function StructureBar({
  analysis,
  durationSec,
  playAtSec,
  trackTitle,
}: {
  analysis: AudioAnalysis
  durationSec: number
  playAtSec: number
  trackTitle: string
}) {
  if (!analysis?.segments?.length || durationSec <= 0) {
    return (
      <div style={{
        padding: '10px 12px',
        background: 'var(--surface2)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--muted)',
        fontFamily: 'var(--font-mono, monospace)',
        fontStyle: 'italic',
      }}>
        estrutura da faixa A não disponível
      </div>
    )
  }

  const merged: AudioSegment[] = []
  for (const seg of analysis.segments) {
    const last = merged[merged.length - 1]
    if (last && last.label === seg.label && Math.abs(last.end - seg.start) < 0.1) {
      last.end = seg.end
    } else {
      merged.push({ ...seg })
    }
  }

  const visible = merged.filter(s => s.end - s.start >= 0.5)

  const pct = (sec: number) =>
    `${Math.min(100, Math.max(0, (sec / durationSec) * 100))}%`

  const playAtPct = pct(playAtSec)

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <p style={{
          fontSize: 10,
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono, monospace)',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}>
          estrutura da faixa A — "{trackTitle}"
        </p>
        <p style={{
          fontSize: 10,
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          ▶ playAt {formatSeconds(playAtSec)}
        </p>
      </div>

      <div style={{
        position: 'relative',
        height: 28,
        background: 'var(--surface2)',
        borderRadius: 6,
        overflow: 'hidden',
        display: 'flex',
      }}>
        {visible.map((seg, i) => {
          const style = getSegmentStyle(seg.label)
          const width = pct(seg.end - seg.start)
          return (
            <div
              key={i}
              title={`${style.label}: ${formatSeconds(seg.start)} → ${formatSeconds(seg.end)}`}
              style={{
                width,
                height: '100%',
                background: style.bg,
                borderRight: i < visible.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                color: style.color,
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            >
              {width && parseFloat(width) > 4 ? `${style.icon} ${style.label}` : style.icon}
            </div>
          )
        })}

        <div
          title={`Solte a faixa B aqui: ${formatSeconds(playAtSec)}`}
          style={{
            position: 'absolute',
            left: playAtPct,
            top: -2,
            bottom: -2,
            width: 2,
            background: 'var(--accent)',
            boxShadow: '0 0 8px var(--accent)',
          }}
        />
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 6,
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 10,
        color: 'var(--muted)',
      }}>
        <span>0:00</span>
        <span>{formatSeconds(durationSec)}</span>
      </div>
    </div>
  )
}

function EqRecipe({
  eqAdvice,
  bassSwapBar,
  crossfadeBars,
}: {
  eqAdvice?: { low: string; mid: string; high: string }
  bassSwapBar?: number
  crossfadeBars: number
}) {
  if (!eqAdvice) return null

  const rows: Array<{ key: 'low' | 'mid' | 'high'; label: string; color: string; icon: string; text: string }> = [
    { key: 'low',  label: 'LOW',  color: '#fc5c5c', icon: '🔊', text: eqAdvice.low  },
    { key: 'mid',  label: 'MID',  color: '#fccc5c', icon: '🎤', text: eqAdvice.mid  },
    { key: 'high', label: 'HI',   color: '#4cfc9a', icon: '✨', text: eqAdvice.high },
  ]

  return (
    <div style={{
      marginTop: 16,
      padding: '12px 14px',
      background: 'rgba(124, 92, 252, 0.06)',
      border: '1px solid rgba(124, 92, 252, 0.30)',
      borderRadius: 10,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <p style={{
          fontSize: 10,
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono, monospace)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontWeight: 700,
        }}>
          🎛 receita de EQ
        </p>

        {bassSwapBar !== undefined && (
          <span style={{
            fontSize: 11,
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 700,
            padding: '3px 10px',
            background: 'rgba(124, 92, 252, 0.18)',
            border: '1px solid rgba(124, 92, 252, 0.4)',
            borderRadius: 6,
            whiteSpace: 'nowrap',
          }}>
            🔊 BASS SWAP → compasso {bassSwapBar} de {crossfadeBars}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(row => (
          <div
            key={row.key}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '8px 10px',
              background: 'var(--surface)',
              borderLeft: `3px solid ${row.color}`,
              borderRadius: 6,
            }}
          >
            <span style={{
              fontSize: 11,
              color: row.color,
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 700,
              minWidth: 38,
              flexShrink: 0,
              paddingTop: 1,
            }}>
              {row.label}
            </span>
            <span style={{ fontSize: 13, flexShrink: 0, paddingTop: 1 }}>
              {row.icon}
            </span>
            <p style={{
              fontSize: 12,
              color: 'var(--text)',
              lineHeight: 1.5,
              margin: 0,
              flex: 1,
            }}>
              {row.text}
            </p>
          </div>
        ))}
      </div>

      <p style={{
        fontSize: 10,
        color: 'var(--muted)',
        fontFamily: 'var(--font-mono, monospace)',
        fontStyle: 'italic',
        marginTop: 10,
        lineHeight: 1.5,
      }}>
        💡 HI aberto desde o início = B "flutua" sem aparecer · LOW e MID da B fechados até o bass swap
      </p>
    </div>
  )
}

function TransitionRow({
  from,
  to,
  timeline,
  analysisA,
  durationA,
  isExpanded,
  onToggle,
  index,
}: {
  from: any
  to: any
  timeline: MixTimeline
  analysisA: AudioAnalysis | null
  durationA: number
  isExpanded: boolean
  onToggle: () => void
  index: number 
}) {
  const rawScore = timeline.score ?? 0
  const score = rawScore === 0 ? 100 : rawScore
  const scoreColor = score >= 80 ? 'var(--green)'
    : score >= 60 ? 'var(--yellow)'
      : 'var(--red)'

  const confidenceIcon = score >= 80 ? '✓'
    : score >= 60 ? '⚠'
      : '!'

  return (
    <div style={{ marginLeft: 16, marginTop: 4, marginBottom: 4 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{
          width: 2,
          background: scoreColor,
          borderRadius: 1,
          marginLeft: 15,
          opacity: 0.4,
        }} />

        <div
          style={{
            flex: 1,
            background: 'var(--surface)',
            border: `1px solid ${isExpanded ? scoreColor : 'var(--border)'}`,
            borderRadius: 10,
            overflow: 'hidden',
            transition: 'border-color 0.15s',
          }}
        >
          <button
            onClick={onToggle}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 14, color: scoreColor, width: 16 }}>
              {confidenceIcon}
            </span>

            <span style={{
              fontSize: 12,
              color: scoreColor,
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 700,
              minWidth: 50,
            }}>
              {score}/100
            </span>

            <span style={{
              fontSize: 11,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono, monospace)',
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
              mixagem
            </span>

            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1, marginLeft: 6 }}>
              {timeline.crossfadeBars} barras · {formatSeconds(timeline.crossfadeDurationSec)}
            </span>

            {timeline.crossfadeStartGlobalFormatted && (
              <span style={{
                fontSize: 11,
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono, monospace)',
              }}>
                📍 {timeline.crossfadeStartGlobalFormatted} do set
              </span>
            )}

            <span style={{
              fontSize: 11,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              {isExpanded ? '−' : '+'}
            </span>
          </button>

          {isExpanded && (
            <div style={{
              padding: '4px 14px 16px',
              borderTop: '1px solid var(--border)',
            }}>
              {analysisA && durationA > 0 && (
                <StructureBar
                  analysis={analysisA}
                  durationSec={durationA}
                  playAtSec={timeline.playAtSec}
                  trackTitle={from.title}
                />
              )}

              <TimelineVisual timeline={timeline} />

                 <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                <Instruction
                  icon="▶"
                  color="var(--accent)"
                  label={`Dê play na Música ${index + 2}`}
                  value={`no beat forte dela (aos ${timeline.playBAtFormatted})`}
                  hint={`Pule a intro da Música ${index + 2}. Aperte o play quando o relógio do set marcar ${timeline.crossfadeStartGlobalFormatted}.`}
                />

                <Instruction
                  icon="⟷"
                  color="var(--green)"
                  label={`Inicie o crossfade na Música ${index + 1}`}
                  value={`aos ${timeline.crossfadeStartGlobalFormatted} do set`}
                  hint={`Faça a transição por ${timeline.crossfadeBars} barras.`}
                />

                <Instruction
                  icon="■"
                  color="var(--red)"
                  label={`Desligue a Música ${index + 1}`}
                  value={`aos ${timeline.crossfadeEndGlobalFormatted} do set`}
                  hint={`O beat da Música ${index + 2} já está na pista. Pode fechar o fader.`}
                />
              </div>
              <EqRecipe
                eqAdvice={timeline.eqAdvice}
                bassSwapBar={timeline.bassSwapBar}
                crossfadeBars={timeline.crossfadeBars}
              />

              {timeline.scoreReasons && timeline.scoreReasons.length > 0 && (
                <div style={{
                  marginTop: 14,
                  padding: '10px 12px',
                  background: 'rgba(124, 92, 252, 0.08)',
                  border: '1px solid rgba(124, 92, 252, 0.25)',
                  borderRadius: 8,
                }}>
                  <p style={{
                    fontSize: 10,
                    color: 'var(--accent)',
                    fontFamily: 'var(--font-mono, monospace)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 6,
                  }}>
                    por que esse mix point
                  </p>
                  {timeline.scoreReasons.map((r, i) => (
                    <p key={i} style={{
                      fontSize: 12,
                      color: 'var(--text)',
                      lineHeight: 1.5,
                    }}>
                      • {r}
                    </p>
                  ))}
                </div>
              )}

              {timeline.notes.length > 0 && (
                <div style={{
                  marginTop: 14,
                  padding: '10px 12px',
                  background: 'var(--surface2)',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}>
                  {timeline.notes.map((note, i) => (
                    <p key={i} style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      fontStyle: 'italic',
                      lineHeight: 1.5,
                    }}>
                      • {note}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AlternativeRow({
  alt,
  fromTitle,
  toTitle,
}: {
  alt: MixPointCandidate
  fromTitle: string
  toTitle: string
}) {
  const color = alt.score >= 80 ? 'var(--green)'
    : alt.score >= 60 ? 'var(--yellow)'
      : 'var(--red)'

  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--surface2)',
      border: `1px solid ${color}`,
      borderRadius: 8,
      opacity: 0.85,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 4,
      }}>
        <span style={{
          fontSize: 12,
          color,
          fontFamily: 'var(--font-mono, monospace)',
          fontWeight: 700,
          minWidth: 50,
        }}>
          {alt.score}/100
        </span>
        <span style={{
          fontSize: 11,
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          {formatSeconds(alt.exitFromA)} → {formatSeconds(alt.enterIntoB)}
        </span>
        <span style={{
          fontSize: 11,
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          {alt.crossfadeBars} barras
        </span>
      </div>
      <p style={{
        fontSize: 11,
        color: 'var(--muted)',
        lineHeight: 1.4,
      }}>
        saída no {alt.exitLabel} → entrada no {alt.enterLabel}
      </p>
    </div>
  )
}

function TimelineVisual({ timeline }: { timeline: MixTimeline }) {
  const totalDuration = Math.max(timeline.crossfadeEndSec + 30, 120)
  const pct = (sec: number) => `${Math.min(100, (sec / totalDuration) * 100)}%`

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{
        fontSize: 10,
        color: 'var(--muted)',
        fontFamily: 'var(--font-mono, monospace)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
      }}>
        timeline da mixagem
      </p>

      <div style={{
        position: 'relative',
        height: 32,
        background: 'var(--surface2)',
        borderRadius: 6,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          left: pct(timeline.crossfadeStartSec),
          width: `${((timeline.crossfadeEndSec - timeline.crossfadeStartSec) / totalDuration) * 100}%`,
          top: 0,
          bottom: 0,
          background: 'linear-gradient(90deg, rgba(124, 92, 252, 0.4), rgba(76, 252, 154, 0.4))',
          borderLeft: '2px solid var(--accent)',
          borderRight: '2px solid var(--green)',
        }} />

        <div
          title={`Solte a próxima faixa: ${timeline.playAtFormatted}`}
          style={{
            position: 'absolute',
            left: pct(timeline.playAtSec),
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--accent)',
            boxShadow: '0 0 8px var(--accent)',
          }}
        />

        <div
          title={`Desligue a faixa anterior: ${timeline.stopAFormatted}`}
          style={{
            position: 'absolute',
            left: pct(timeline.stopASec),
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--red)',
            boxShadow: '0 0 8px var(--red)',
          }}
        />
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 6,
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 10,
        color: 'var(--muted)',
      }}>
        <span>0:00</span>
        <span>{formatSeconds(totalDuration)}</span>
      </div>
    </div>
  )
}

function Instruction({
  icon,
  color,
  label,
  value,
  hint,
  globalTime,
}: {
  icon: string
  color: string
  label: string
  value: string
  hint: string
  globalTime?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{
        fontSize: 14,
        color,
        width: 16,
        textAlign: 'center',
        flexShrink: 0,
        marginTop: 1,
      }}>
        {icon}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 12,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono, monospace)',
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 14,
            color,
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 700,
          }}>
            {value}
          </span>
          {globalTime && (
            <span style={{
              fontSize: 12,
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 700,
              padding: '2px 8px',
              background: 'rgba(124, 92, 252, 0.15)',
              borderRadius: 4,
            }}>
              📍 {globalTime} do set
            </span>
          )}
        </div>
        <p style={{
          fontSize: 11,
          color: 'var(--muted)',
          lineHeight: 1.4,
        }}>
          {hint}
        </p>
      </div>
    </div>
  )
}

interface SuggestionEntry {
  track: Track
  score: number
  folderName: string | null
}

function CompatibilityAlert({
  setlist,
  analyses,
  durations,
  suggestions,
  getScore,
}: {
  setlist: GeneratedSetlist
  analyses: Record<string, AudioAnalysis>
  durations: Record<string, number>
  suggestions: Record<number, SuggestionEntry[]>
  getScore: (from: any, to: any) => number
}) {
  const result = (() => {
    let issues: TransitionIssue[] = []
    let ok = 0, criticalCount = 0, warningCount = 0, totalScore = 0
    
    for (let i = 0; i < setlist.setlist.length - 1; i++) {
      const from = setlist.setlist[i]
      let noteData = null
      try { noteData = from.transitionNote ? JSON.parse(from.transitionNote) : null } catch {}
      
      const score = noteData?.score !== undefined ? noteData.score : 100
      
      totalScore += score
      if (score >= 70) ok++
      else if (score >= 50) warningCount++
      else criticalCount++
      
      if (score < 70) {
        issues.push({
          index: i, 
          fromTitle: from.title, 
          toTitle: setlist.setlist[i + 1].title,
          score, 
          severity: score < 50 ? 'critical' : 'warning',
          reason: score < 50 ? 'score baixo' : 'score médio'
        })
      }
    }
    
    return {
      total: setlist.setlist.length - 1, 
      ok, 
      issues,
      criticalCount, 
      warningCount,
      avgScore: Math.round(totalScore / (setlist.setlist.length - 1 || 1)),
      unknownCount: 0
    }
  })()

  if (result.total === 0) return null

  if (result.unknownCount === result.total) {
    return (
      <div style={{
        padding: '14px 18px',
        background: 'rgba(124, 92, 252, 0.08)',
        border: '1px solid rgba(124, 92, 252, 0.35)',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>⏳</span>
        <div>
          <p style={{
            fontSize: 12,
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 2,
          }}>
            aguardando análise estrutural
          </p>
          <p style={{ fontSize: 13, color: 'var(--text)' }}>
            Nenhuma faixa do set tem análise GPU. Faça upload das {setlist.setlist.length} pra calcular o score real.
          </p>
        </div>
      </div>
    )
  }

  const { total, ok, issues, criticalCount, warningCount, avgScore } = result

  if (issues.length === 0) {
    return (
      <div style={{
        padding: '14px 18px',
        background: 'rgba(76, 252, 154, 0.08)',
        border: '1px solid rgba(76, 252, 154, 0.35)',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>✓</span>
        <div>
          <p style={{
            fontSize: 12,
            color: 'var(--green)',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 2,
          }}>
            set pronto pra tocar · score médio {avgScore}/100
          </p>
          <p style={{ fontSize: 13, color: 'var(--text)' }}>
            As {total} transições são mixáveis — BPM, Camelot e estrutura alinhados.
          </p>
        </div>
      </div>
    )
  }

  const hasCritical = criticalCount > 0

  return (
    <div style={{
      padding: '16px 18px',
      background: hasCritical ? 'rgba(252, 92, 92, 0.08)' : 'rgba(252, 204, 92, 0.08)',
      border: `1px solid ${hasCritical ? 'rgba(252, 92, 92, 0.4)' : 'rgba(252, 204, 92, 0.4)'}`,
      borderRadius: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>
          {hasCritical ? '✗' : '⚠'}
        </span>
        <div style={{ flex: 1 }}>
          <p style={{
            fontSize: 12,
            fontWeight: 700,
            color: hasCritical ? 'var(--red)' : 'var(--yellow)',
            marginBottom: 4,
            fontFamily: 'var(--font-mono, monospace)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            {hasCritical
              ? `${criticalCount} transiç${criticalCount === 1 ? 'ão' : 'ões'} problemática${criticalCount === 1 ? '' : 's'}`
              : `${warningCount} transiç${warningCount === 1 ? 'ão' : 'ões'} pede${warningCount === 1 ? '' : 'm'} atenção`}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
            {ok} de {total} transições são mixáveis · score médio {avgScore}/100
          </p>
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        paddingLeft: 32,
      }}>
        {issues.map((issue, i) => {
          const issueSuggestions = suggestions[issue.index] || []

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '10px 12px',
                background: 'var(--surface)',
                border: `1px solid ${issue.severity === 'critical' ? 'rgba(252, 92, 92, 0.3)' : 'rgba(252, 204, 92, 0.3)'}`,
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  color: issue.severity === 'critical' ? 'var(--red)' : 'var(--yellow)',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontWeight: 700,
                  flexShrink: 0,
                  minWidth: 60,
                }}>
                  {issue.index + 1} → {issue.index + 2}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-mono, monospace)',
                    marginBottom: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {issue.fromTitle} → {issue.toTitle} · score {issue.score}/100
                  </p>
                  <p style={{
                    fontSize: 12,
                    color: 'var(--text)',
                    lineHeight: 1.4,
                  }}>
                    {issue.reason}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}