'use client'

import { useState, useMemo } from 'react'
import { GeneratedSetlist } from '@/lib/types'
import {
  MixTimeline,
  AudioAnalysis,
  AudioSegment,
  formatSeconds,
  calculateFullTimeline,
} from '@/lib/mix-timeline'
import CompatibilityMatrix from './CompatibilityMatrix'

interface SetlistViewProps {
  setlist: GeneratedSetlist
  onRegenerate?: () => void
  analyses?: Record<string, AudioAnalysis>
  durations?: Record<string, number>
}

export default function SetlistView({
  setlist,
  onRegenerate,
  analyses,
  durations,
}: SetlistViewProps) {
  const [expandedTransition, setExpandedTransition] = useState<number | null>(0)

  const hasTimelineData = analyses && durations

  // 🆕 Cadeia completa com offsets (useMemo pra não recalcular)
  const transitions = useMemo(() => {
    if (!analyses || !durations) return []

    const items = setlist.setlist.map(t => ({
      track: t as any,
      analysis: analyses[t.id],
      duration: durations[t.id] ?? 0,
    }))

    // Verifica se TODAS as faixas têm análise
    const allHaveAnalysis = items.every(i => i.analysis)
    if (!allHaveAnalysis) return []

    return calculateFullTimeline(items)
  }, [setlist, analyses, durations])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ALERTA DE COMPATIBILIDADE */}
      {analyses && durations && (
        <CompatibilityAlert
          setlist={setlist}
          analyses={analyses}
          durations={durations}
        />
      )}

      {/* ANÁLISE GERAL DO SET */}
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

      {/* MATRIZ DE COMPATIBILIDADE */}
      {analyses && durations && setlist.setlist.length >= 2 && (
        <CompatibilityMatrix tracks={setlist.setlist} />
      )}

      {/* SEQUÊNCIA DE FAIXAS */}
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
            const transition = transitions[i]   // 🆕
            const nextTransitionStart = transitions[i + 1]?.startOffsetA

            return (
              <div key={track.id || i}>
                {/* Cabeçalho da faixa com tempo de entrada no set */}
                <TrackRow
                  track={track}
                  index={i}
                  entryOffset={transition?.startOffsetA}
                />

                {!isLast && transition && (
                  <TransitionRow
                    from={track}
                    to={setlist.setlist[i + 1]}
                    timeline={transition.timeline}
                    analysisA={analyses?.[track.id] ?? null}
                    durationA={durations?.[track.id] ?? 0}
                    isExpanded={expandedTransition === i}
                    onToggle={() =>
                      setExpandedTransition(expandedTransition === i ? null : i)
                    }
                  />
                )}

                {/* Se não tem transição calculada (faltou análise), mostra placeholder */}
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

      {/* DJ TIP */}
      {setlist.djTip && (
        <div style={{
          padding: '16px 18px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>💡</span>
          <div>
            <p style={{
              fontSize: 11,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono, monospace)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 6,
            }}>
              dica de DJ
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
              {setlist.djTip}
            </p>
          </div>
        </div>
      )}

      {/* PEAK MOMENT */}
      {setlist.peakMoment && (
        <div style={{
          padding: '16px 18px',
          background: 'linear-gradient(135deg, rgba(252, 92, 92, 0.1), rgba(196, 92, 252, 0.1))',
          border: '1px solid rgba(252, 92, 92, 0.3)',
          borderRadius: 12,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>🔥</span>
          <div>
            <p style={{
              fontSize: 11,
              color: 'var(--red)',
              fontFamily: 'var(--font-mono, monospace)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 6,
            }}>
              momento de pico
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
              {setlist.peakMoment}
            </p>
          </div>
        </div>
      )}

      {/* REGENERAR */}
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          style={{
            padding: '12px 20px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          ⟳ gerar novamente
        </button>
      )}
    </div>
  )
}

// ============================================================
// TrackRow (com tempo de entrada no set)
// ============================================================

function TrackRow({
  track,
  index,
  entryOffset,
}: {
  track: any
  index: number
  entryOffset?: number
}) {
  const energyColor = track.energy >= 8 ? 'var(--red)'
    : track.energy >= 6 ? 'var(--yellow)'
      : 'var(--green)'

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
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--muted)',
        flexShrink: 0,
      }}>
        {index + 1}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {track.title}
        </p>
        <p style={{
          fontSize: 12,
          color: 'var(--muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {track.artist}
        </p>
      </div>

      {/* 🆕 Tempo de entrada no set */}
      {entryOffset !== undefined && entryOffset > 0 && (
        <span style={{
          fontSize: 11,
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono, monospace)',
          padding: '2px 8px',
          background: 'rgba(124, 92, 252, 0.15)',
          borderRadius: 4,
          flexShrink: 0,
        }}>
          entra aos {formatSeconds(entryOffset)}
        </span>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
        {track.bpm > 0 && (
          <span style={{
            fontSize: 11,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono, monospace)',
          }}>
            {track.bpm} BPM
          </span>
        )}
        {track.key && track.key !== 'desconhecido' && track.key !== '' && (
          <span style={{
            fontSize: 11,
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono, monospace)',
            padding: '2px 8px',
            background: 'rgba(124, 92, 252, 0.15)',
            borderRadius: 4,
          }}>
            {track.key}
          </span>
        )}
        <div style={{ display: 'flex', gap: 2 }} title={`Energia ${track.energy}/10`}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: 12,
                borderRadius: 1,
                background: i < track.energy ? energyColor : 'var(--border)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// SEGMENT STYLES + StructureBar
// ============================================================

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

// ============================================================
// TransitionRow (com tempos globais)
// ============================================================

function TransitionRow({
  from,
  to,
  timeline,
  analysisA,
  durationA,
  isExpanded,
  onToggle,
}: {
  from: any
  to: any
  timeline: MixTimeline
  analysisA: AudioAnalysis | null
  durationA: number
  isExpanded: boolean
  onToggle: () => void
}) {
  const confidenceColor = timeline.confidence === 'high' ? 'var(--green)'
    : timeline.confidence === 'medium' ? 'var(--yellow)'
      : 'var(--red)'

  const confidenceIcon = timeline.confidence === 'high' ? '✓'
    : timeline.confidence === 'medium' ? '⚠'
      : '!'

  return (
    <div style={{ marginLeft: 16, marginTop: 4, marginBottom: 4 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{
          width: 2,
          background: confidenceColor,
          borderRadius: 1,
          marginLeft: 15,
          opacity: 0.4,
        }} />

        <div
          style={{
            flex: 1,
            background: 'var(--surface)',
            border: `1px solid ${isExpanded ? confidenceColor : 'var(--border)'}`,
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
            <span style={{ fontSize: 14, color: confidenceColor, width: 16 }}>
              {confidenceIcon}
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

            {/* 🆕 Tempo global */}
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

              {/* INSTRUÇÕES PARA O DJ */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                {/* 1. Play na próxima faixa */}
                <Instruction
                  icon="▶"
                  color="var(--accent)"
                  label="Dê play na próxima faixa"
                  value={`aos ${timeline.playBAtFormatted} da "${to.title}"`}
                  hint={
                    timeline.introEndBSec > 0
                      ? `A sai na barra #${Math.round(timeline.crossfadeEndBarNumber ?? 0)}` +
                        (timeline.crossfadeEndOffset && timeline.crossfadeEndOffset > 0.05
                          ? ` (⚠️ +${timeline.crossfadeEndOffset.toFixed(2)}s do grid)`
                          : ` ✓`) +
                        ` · beat principal da B entra em ${timeline.introEndBFormatted}`
                      : 'a faixa começa direto com o beat (sem intro)'
                  }
                  globalTime={timeline.playBAtGlobalFormatted}   // 🆕
                />

                {/* 2. Crossfade */}
                <Instruction
                  icon="⟷"
                  color="var(--green)"
                  label="Inicie o crossfade"
                  value={`aos ${timeline.crossfadeStartFormatted} de "${from.title}"`}
                  hint={`${timeline.crossfadeBars} barras (${formatSeconds(timeline.crossfadeDurationSec)})`}
                  globalTime={timeline.crossfadeStartGlobalFormatted}   // 🆕
                />

                {/* 3. Stop */}
                <Instruction
                  icon="■"
                  color="var(--red)"
                  label="Desligue a faixa anterior"
                  value={`aos ${timeline.stopAFormatted}`}
                  hint={`aos ${timeline.stopAFormatted} de "${from.title}"`}
                  globalTime={timeline.crossfadeEndGlobalFormatted}   // 🆕
                />
              </div>

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

// ============================================================
// TimelineVisual
// ============================================================

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

// ============================================================
// Instruction (com globalTime)
// ============================================================

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
  globalTime?: string   // 🆕
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
          {/* 🆕 Tempo global */}
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

// ============================================================
// CompatibilityAlert
// ============================================================

interface TransitionIssue {
  index: number
  fromTitle: string
  toTitle: string
  severity: 'critical' | 'warning'
  reason: string
}

function parseCamelot(key: string): { num: number; letter: 'A' | 'B' } | null {
  if (!key) return null
  const match = key.trim().match(/^(\d{1,2})\s*([AB])$/i)
  if (!match) return null
  const num = parseInt(match[1], 10)
  if (num < 1 || num > 12) return null
  return { num, letter: match[2].toUpperCase() as 'A' | 'B' }
}

function camelotCompatibility(
  keyA: string,
  keyB: string
): 'perfect' | 'good' | 'humor' | 'bad' | 'unknown' {
  const a = parseCamelot(keyA)
  const b = parseCamelot(keyB)
  if (!a || !b) return 'unknown'

  if (a.num === b.num && a.letter === b.letter) return 'perfect'

  if (a.letter === b.letter) {
    const diff = Math.abs(a.num - b.num)
    const wrapDiff = Math.min(diff, 12 - diff)
    if (wrapDiff === 1) return 'good'
    if (wrapDiff === 2) return 'good'
  }

  if (a.num === b.num && a.letter !== b.letter) return 'humor'

  return 'bad'
}

function analyzeTransitions(
  setlist: GeneratedSetlist,
  analyses: Record<string, AudioAnalysis>,
  durations: Record<string, number>
): {
  total: number
  ok: number
  issues: TransitionIssue[]
  criticalCount: number
  warningCount: number
} {
  const issues: TransitionIssue[] = []
  let total = 0
  let ok = 0

  for (let i = 0; i < setlist.setlist.length - 1; i++) {
    const a = setlist.setlist[i]
    const b = setlist.setlist[i + 1]
    total++

    if (!analyses[a.id] || !analyses[b.id]) {
      issues.push({
        index: i,
        fromTitle: a.title,
        toTitle: b.title,
        severity: 'critical',
        reason: 'faixa sem análise estrutural (timeline indisponível)',
      })
      continue
    }

    let worstSeverity: 'ok' | 'warning' | 'critical' = 'ok'
    const reasons: string[] = []

    const bpmA = a.bpm || 0
    const bpmB = b.bpm || 0

    if (bpmA > 0 && bpmB > 0) {
      const bpmDiff = Math.abs(bpmA - bpmB)
      if (bpmDiff > 10) {
        worstSeverity = 'critical'
        reasons.push(`BPM salta de ${bpmA} para ${bpmB} (+${bpmDiff})`)
      } else if (bpmDiff > 6) {
worstSeverity = String(worstSeverity) === 'critical' ? 'critical' : 'warning'
        reasons.push(`BPM varia ${bpmA} → ${bpmB} (+${bpmDiff})`)
      }
    }

    const camelot = camelotCompatibility(a.key || '', b.key || '')
    if (camelot === 'bad') {
      worstSeverity = 'critical'
      reasons.push(`Camelot ${a.key} → ${b.key} (distante)`)
    } else if (camelot === 'humor') {
worstSeverity = String(worstSeverity) === 'critical' ? 'critical' : 'warning'
      reasons.push(`Camelot ${a.key} → ${b.key} (muda o humor)`)
    }

    if (worstSeverity === 'ok') {
      ok++
    } else {
      issues.push({
        index: i,
        fromTitle: a.title,
        toTitle: b.title,
        severity: worstSeverity,
        reason: reasons.join(' · '),
      })
    }
  }

  return {
    total,
    ok,
    issues,
    criticalCount: issues.filter(x => x.severity === 'critical').length,
    warningCount: issues.filter(x => x.severity === 'warning').length,
  }
}

function CompatibilityAlert({
  setlist,
  analyses,
  durations,
}: {
  setlist: GeneratedSetlist
  analyses: Record<string, AudioAnalysis>
  durations: Record<string, number>
}) {
  const result = analyzeTransitions(setlist, analyses, durations)

  if (result.total === 0) return null

  const { total, ok, issues, criticalCount, warningCount } = result

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
            set pronto pra tocar
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
              ? `${criticalCount} transiç${criticalCount === 1 ? 'ão' : 'ões'} problemática${criticalCount === 1 ? '' : 's'} — evite ao vivo`
              : `${warningCount} transiç${warningCount === 1 ? 'ão' : 'ões'} pede${warningCount === 1 ? '' : 'm'} atenção`}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
            {ok} de {total} transições são mixáveis.
            {hasCritical && ' Revise antes de tocar.'}
          </p>
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        paddingLeft: 32,
      }}>
        {issues.map((issue, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '8px 12px',
              background: 'var(--surface)',
              border: `1px solid ${issue.severity === 'critical' ? 'rgba(252, 92, 92, 0.3)' : 'rgba(252, 204, 92, 0.3)'}`,
              borderRadius: 8,
              fontSize: 12,
            }}
          >
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
                {issue.fromTitle} → {issue.toTitle}
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
        ))}
      </div>
    </div>
  )
}