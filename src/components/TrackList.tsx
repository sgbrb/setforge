'use client'

import { useState } from 'react'
import { Track, Folder } from '@/lib/types'

interface TrackListProps {
  tracks: Track[]
  folders: Folder[]
  analyses: Record<string, any>
  onRemove: (id: string) => void
  onMoveToFolder: (trackId: string, folderId: string | null) => void
  onDragStart?: (trackId: string) => void
  onDragEnd?: () => void
  onClearAnalysis?: (trackId: string) => void
  showAnalysis?: boolean
}

export default function TrackList({
  tracks,
  folders,
  analyses,
  onRemove,
  onMoveToFolder,
  onDragStart,
  onDragEnd,
  onClearAnalysis,
  showAnalysis = true,
}: TrackListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tracks.map(t => {
        const isDragging = draggedId === t.id
        const hasAnalysis = !!analyses[t.id]

        return (
          <div
            key={t.id}
            draggable
            onDragStart={e => {
              setDraggedId(t.id)
              onDragStart?.(t.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', t.id)
            }}
            onDragEnd={() => {
              setDraggedId(null)
              onDragEnd?.()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 12px',
              cursor: 'grab',
              opacity: isDragging ? 0.4 : 1,
              transition: 'opacity 0.15s, border-color 0.15s',
            }}
          >
            <span
              style={{
                color: 'var(--muted)',
                fontSize: 14,
                lineHeight: 1,
                cursor: 'grab',
                userSelect: 'none',
                flexShrink: 0,
                opacity: 0.6,
              }}
              title="Arraste para uma pasta"
            >
              ⋮⋮
            </span>

            <div
              style={{
                flex: 1,
                fontSize: 13,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <strong>{t.title}</strong>
              {t.artist && ` — ${t.artist}`}
            </div>

            {/* BPM + key: só mostra se showAnalysis estiver ligado */}
            {showAnalysis && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  fontFamily: 'var(--font-mono, monospace)',
                  flexShrink: 0,
                }}
              >
                {t.bpm > 0 ? `${t.bpm} BPM` : ''}
                {t.key && t.key !== 'desconhecido' ? ` · ${t.key}` : ''}
              </span>
            )}

            {/* Badge + apagar: só mostra se showAnalysis estiver ligado */}
            {showAnalysis && hasAnalysis && (
              <>
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--green)',
                    fontFamily: 'var(--font-mono, monospace)',
                    flexShrink: 0,
                  }}
                >
                  ✓ estrutura
                </span>

                {onClearAnalysis && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      const confirmed = window.confirm(
                        `Apagar a análise estrutural de "${t.title}"?\n\n` +
                        `A faixa CONTINUA na biblioteca, mas:\n` +
                        `• O BPM, tom e segmentos serão apagados\n` +
                        `• Você precisa RE-SUBIR o MP3 pra reanalisar\n` +
                        `• Isso leva ~2 min\n\n` +
                        `Confirma?`
                      )
                      if (confirmed) {
                        onClearAnalysis(t.id)
                      }
                    }}
                    title="Apagar análise estrutural desta faixa"
                    style={{
                      border: '1px solid rgba(255, 100, 100, 0.4)',
                      background: 'rgba(255, 100, 100, 0.08)',
                      color: 'var(--red)',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono, monospace)',
                      borderRadius: 4,
                      padding: '2px 6px',
                      flexShrink: 0,
                      opacity: 0.7,
                      transition: 'opacity 0.15s',
                      lineHeight: 1.4,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
                  >
                    apagar
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => onRemove(t.id)}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                flexShrink: 0,
                padding: 0,
                width: 16,
              }}
              title="Remover faixa"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}