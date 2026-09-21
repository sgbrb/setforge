'use client'

import { useState } from 'react'
import { GeneratedSetlist } from '@/lib/types'
import {
  MixTimeline,
  AudioAnalysis,
  formatSeconds,
  calculateMixTimeline,
} from '@/lib/mix-timeline'

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Cabeçalho com análise geral */}
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

      {/* Sequência de faixas */}
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
            const nextTrack = !isLast ? setlist.setlist[i + 1] : null

            return (
              <div key={i}>
                <TrackRow track={track} index={i} />

                {nextTrack && (
                  <TransitionRow
                    from={track}
                    to={nextTrack}
                    timeline={
                      hasTimelineData &&
                      analyses?.[track.id] &&
                      analyses?.[nextTrack.id] &&
                      durations?.[track.id]
                        ? calculateMixTimeline(
                            track,
                            nextTrack,
                            analyses[track.id],
                            analyses[nextTrack.id],
                            durations[track.id]
                          )
                        : null
                    }
                    isExpanded={expandedTransition === i}
                    onToggle={() =>
                      setExpandedTransition(expandedTransition === i ? null : i)
                    }
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Alerta de incompatibilidade */}
      {analyses && durations && (
        <CompatibilityAlert setlist={setlist} analyses={analyses} />
      )}

      {/* DJ Tip */}
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

      {/* Peak Moment */}
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

      {/* Regenerar */}
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

/**
 * Linha de uma faixa do setlist.
 */
function TrackRow({ track, index }: { track: any; index: number }) {
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

/**
 * Linha de transição entre duas faixas.
 */
function TransitionRow({
  from,
  to,
  timeline,
  isExpanded,
  onToggle,
}: {
  from: any
  to: any
  timeline: MixTimeline | null
  isExpanded: boolean
  onToggle: () => void
}) {
  if (!timeline) {
    return (
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
    )
  }

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
              <TimelineVisual timeline={timeline} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                <Instruction
                  icon="▶"
                  color="var(--accent)"
                  label="Solte a próxima faixa"
                  value={timeline.playAtFormatted}
                  hint={`aos ${timeline.playAtFormatted} de "${from.title}"`}
                />
                <Instruction
                  icon="⟷"
                  color="var(--green)"
                  label="Crossfade"
                  value={`${timeline.crossfadeStartFormatted} → ${timeline.crossfadeEndFormatted}`}
                  hint={`${timeline.crossfadeBars} barras (${formatSeconds(timeline.crossfadeDurationSec)})`}
                />
                <Instruction
                  icon="■"
                  color="var(--red)"
                  label="Desligue a faixa anterior"
                  value={timeline.stopAFormatted}
                  hint={`aos ${timeline.stopAFormatted} de "${from.title}"`}
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

/**
 * Visualização da timeline.
 */
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

/**
 * Linha de instrução acionável.
 */
function Instruction({
  icon,
  color,
  label,
  value,
  hint,
}: {
  icon: string
  color: string
  label: string
  value: string
  hint: string
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
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

/**
 * Alerta de incompatibilidade entre transições.
 */
function CompatibilityAlert({
  setlist,
  analyses,
}: {
  setlist: GeneratedSetlist
  analyses: Record<string, AudioAnalysis>
}) {
  let incompatibleCount = 0
  let totalTransitions = 0

  for (let i = 0; i < setlist.setlist.length - 1; i++) {
    const a = setlist.setlist[i]
    const b = setlist.setlist[i + 1]
    if (!analyses[a.id] || !analyses[b.id]) continue
    totalTransitions++

    const bpmDiff = Math.abs((a.bpm || 0) - (b.bpm || 0))
    if (bpmDiff > 10) incompatibleCount++
  }

  if (totalTransitions === 0) return null

  const allBad = incompatibleCount === totalTransitions
  const someBad = incompatibleCount > 0

  if (!someBad) {
    return (
      <div style={{
        padding: '12px 16px',
        background: 'rgba(76, 252, 154, 0.08)',
        border: '1px solid rgba(76, 252, 154, 0.3)',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>✓</span>
        <span style={{ fontSize: 13, color: 'var(--green)' }}>
          Todas as transições são mixáveis
        </span>
      </div>
    )
  }

  return (
    <div style={{
      padding: '14px 16px',
      background: allBad ? 'rgba(252, 92, 92, 0.1)' : 'rgba(252, 204, 92, 0.1)',
      border: `1px solid ${allBad ? 'rgba(252, 92, 92, 0.4)' : 'rgba(252, 204, 92, 0.4)'}`,
      borderRadius: 10,
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>
        {allBad ? '✗' : '⚠'}
      </span>
      <div>
        <p style={{
          fontSize: 12,
          fontWeight: 700,
          color: allBad ? 'var(--red)' : 'var(--yellow)',
          marginBottom: 4,
          fontFamily: 'var(--font-mono, monospace)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}>
          {allBad ? 'set não recomendado' : 'atenção nas transições'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
          {allBad
            ? `Nenhuma das ${totalTransitions} transições combina bem. O setlist será difícil de mixar — considere adicionar músicas de BPM similar.`
            : `${incompatibleCount} de ${totalTransitions} transições têm diferença de BPM alta (>10). Verifique antes de tocar.`}
        </p>
      </div>
    </div>
  )
}