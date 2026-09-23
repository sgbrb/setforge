'use client'

import { Track } from '@/lib/types'
import { buildCompatibilityMatrix } from '@/lib/optimal-order'

interface CompatibilityMatrixProps {
  tracks: Track[]
}

/**
 * Matriz NxN mostrando o score de compatibilidade entre cada par de faixas.
 * Diagonal = 100 (uma faixa sempre combina consigo mesma).
 */
export default function CompatibilityMatrix({ tracks }: CompatibilityMatrixProps) {
  if (tracks.length < 2) return null

  const matrix = buildCompatibilityMatrix(tracks)

  const cellColor = (score: number, isDiagonal: boolean) => {
    if (isDiagonal) return 'var(--surface)'
    if (score >= 85) return 'rgba(76, 252, 154, 0.25)'   // verde forte
    if (score >= 70) return 'rgba(76, 252, 154, 0.12)'   // verde fraco
    if (score >= 55) return 'rgba(252, 204, 92, 0.18)'   // amarelo
    if (score >= 40) return 'rgba(252, 154, 92, 0.20)'   // laranja
    return 'rgba(252, 92, 92, 0.22)'                      // vermelho
  }

  const cellBorder = (score: number, isDiagonal: boolean) => {
    if (isDiagonal) return 'var(--border)'
    if (score >= 85) return 'rgba(76, 252, 154, 0.5)'
    if (score >= 70) return 'rgba(76, 252, 154, 0.3)'
    if (score >= 55) return 'rgba(252, 204, 92, 0.4)'
    if (score >= 40) return 'rgba(252, 154, 92, 0.4)'
    return 'rgba(252, 92, 92, 0.4)'
  }

  return (
    <div>
      <p style={{
        fontSize: 11,
        color: 'var(--muted)',
        fontFamily: 'var(--font-mono, monospace)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
      }}>
        matriz de compatibilidade
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{
          borderCollapse: 'separate',
          borderSpacing: 2,
          fontSize: 10,
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          <thead>
            <tr>
              <th style={{
                width: 120,
                textAlign: 'left',
                padding: '4px 8px',
                color: 'var(--muted)',
                fontSize: 10,
                fontWeight: 400,
              }} />
              {tracks.map((t, i) => (
                <th
                  key={t.id}
                  title={t.title}
                  style={{
                    padding: '4px 6px',
                    color: 'var(--text)',
                    fontSize: 10,
                    fontWeight: 600,
                    textAlign: 'center',
                    minWidth: 42,
                  }}
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tracks.map((tA, i) => (
              <tr key={tA.id}>
                <td
                  title={tA.title}
                  style={{
                    padding: '4px 8px',
                    color: 'var(--text)',
                    fontSize: 11,
                    maxWidth: 120,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {i + 1}. {tA.title.slice(0, 14)}{tA.title.length > 14 ? '…' : ''}
                </td>
                {tracks.map((tB, j) => {
                  const score = matrix[i][j]
                  const isDiagonal = i === j
                  return (
                    <td
                      key={tB.id}
                      title={`${tA.title} → ${tB.title}: ${score}%`}
                      style={{
                        padding: '6px 4px',
                        textAlign: 'center',
                        background: cellColor(score, isDiagonal),
                        border: `1px solid ${cellBorder(score, isDiagonal)}`,
                        borderRadius: 4,
                        color: isDiagonal ? 'var(--muted)' : 'var(--text)',
                        fontWeight: isDiagonal ? 400 : 600,
                        fontSize: 10,
                        minWidth: 42,
                      }}
                    >
                      {isDiagonal ? '—' : `${score}%`}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div style={{
        display: 'flex',
        gap: 14,
        marginTop: 12,
        flexWrap: 'wrap',
        fontSize: 10,
        color: 'var(--muted)',
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, background: 'rgba(76, 252, 154, 0.25)', border: '1px solid rgba(76, 252, 154, 0.5)', borderRadius: 3 }} />
          combina muito (≥85%)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, background: 'rgba(76, 252, 154, 0.12)', border: '1px solid rgba(76, 252, 154, 0.3)', borderRadius: 3 }} />
          combina (70-84%)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, background: 'rgba(252, 204, 92, 0.18)', border: '1px solid rgba(252, 204, 92, 0.4)', borderRadius: 3 }} />
          dá pra mixar (55-69%)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, background: 'rgba(252, 92, 92, 0.22)', border: '1px solid rgba(252, 92, 92, 0.4)', borderRadius: 3 }} />
          difícil (&lt;55%)
        </span>
      </div>
    </div>
  )
}