'use client'

import { useMemo, useState } from 'react'
import { getCamelotCompatibility } from '@/lib/harmonic-utils'

interface TrackForChart {
  key?: string
}

interface HarmonyCurveChartProps {
  tracks: TrackForChart[]
  totalPositions: number
}

interface TransitionData {
  fromIdx: number
  toIdx: number
  fromKey: string
  toKey: string
  fromNum: number
  toNum: number
  score: number
  color: string
}

function parseCamelot(key: string): { num: number; letter: 'A' | 'B' } | null {
  const m = (key || '').trim().match(/^(\d{1,2})([AB])$/i)
  if (!m) return null
  const num = parseInt(m[1], 10)
  if (num < 1 || num > 12) return null
  return { num, letter: m[2].toUpperCase() as 'A' | 'B' }
}

export default function HarmonyCurveChart({
  tracks,
  totalPositions,
}: HarmonyCurveChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [showJumps, setShowJumps] = useState(false)

  const width = 800
  const height = 220
  const padding = 40

  // Extrai os Camelots
  const parsedKeys = useMemo(() => {
    return tracks.map(t => parseCamelot(t.key || ''))
  }, [tracks])

  // Verifica se tem dados suficientes
  const validCount = parsedKeys.filter(k => k !== null).length

  // Calcula as transições
  const transitions = useMemo<TransitionData[]>(() => {
    const result: TransitionData[] = []
    for (let i = 0; i < parsedKeys.length - 1; i++) {
      const a = parsedKeys[i]
      const b = parsedKeys[i + 1]
      if (!a || !b) continue

      const fromKey = `${a.num}${a.letter}`
      const toKey = `${b.num}${b.letter}`
      const score = getCamelotCompatibility(fromKey, toKey)

      let color = 'var(--muted)'
      if (score >= 80) color = 'var(--green)'
      else if (score >= 60) color = 'var(--yellow)'
      else color = 'var(--red)'

      result.push({
        fromIdx: i,
        toIdx: i + 1,
        fromKey,
        toKey,
        fromNum: a.num,
        toNum: b.num,
        score,
        color,
      })
    }
    return result
  }, [parsedKeys])

  // Score médio
  const avgScore = useMemo(() => {
    if (transitions.length === 0) return 0
    return Math.round(transitions.reduce((acc, t) => acc + t.score, 0) / transitions.length)
  }, [transitions])

  // Saltos (< 60)
  const jumps = useMemo(() => {
    return transitions.filter(t => t.score < 60)
  }, [transitions])

  // Se não tem dados, mostra "aguardando"
  if (validCount < 2) {
    return (
      <div style={{
        padding: '16px 20px',
        background: 'var(--surface2)',
        border: '1px dashed var(--border)',
        borderRadius: 10,
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--muted)',
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        ⏳ curva de harmonia disponível após análise das faixas (precisa de `key`)
      </div>
    )
  }

  // Helpers de coordenada
  const innerW = width - padding * 2
  const innerH = height - padding * 2
  const n = Math.max(parsedKeys.length, 1)

  const xFor = (i: number) => padding + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yFor = (num: number) => height - padding - ((num - 1) / 11) * innerH

  // Linhas coloridas
  const lines = transitions.map(t => ({
    ...t,
    x1: xFor(t.fromIdx),
    y1: yFor(t.fromNum),
    x2: xFor(t.toIdx),
    y2: yFor(t.toNum),
  }))

  // Marcas no eixo X
  const xLabels: number[] = []
  for (let i = 0; i < n; i += 5) xLabels.push(i)
  if (xLabels[xLabels.length - 1] !== n - 1) xLabels.push(n - 1)

  // Cor do score
  const scoreColor = avgScore >= 80 ? 'var(--green)'
    : avgScore >= 60 ? 'var(--yellow)'
      : 'var(--red)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <p style={{
          fontSize: 11,
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono, monospace)',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}>
          curva de harmonia do set (Camelot)
        </p>
        <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          <span>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginRight: 4, verticalAlign: 'middle' }} />
            Camelot A
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#c45cfc', marginRight: 4, verticalAlign: 'middle' }} />
            Camelot B
          </span>
        </div>
      </div>

      {/* SVG */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          height: 'auto',
          background: 'var(--surface2)',
          borderRadius: 10,
          border: '1px solid var(--border)',
        }}
      >
        {/* Grid horizontal (Camelot 1-12) */}
        {[1, 3, 5, 7, 9, 11, 12].map(num => (
          <g key={`grid-${num}`}>
            <line
              x1={padding}
              y1={yFor(num)}
              x2={width - padding}
              y2={yFor(num)}
              stroke="var(--border)"
              strokeOpacity={0.3}
              strokeWidth={1}
            />
            <text
              x={padding - 8}
              y={yFor(num) + 3}
              fontSize={9}
              fill="var(--muted)"
              fontFamily="var(--font-mono, monospace)"
              textAnchor="end"
            >
              {num}
            </text>
          </g>
        ))}

        {/* Linhas de transição */}
        {lines.map((line, i) => (
          <line
            key={`line-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.color}
            strokeWidth={2}
            strokeOpacity={0.7}
          >
            <title>{`Posição ${line.fromIdx + 1} → ${line.toIdx + 1}: ${line.fromKey} → ${line.toKey} (score ${line.score})`}</title>
          </line>
        ))}

        {/* Pontos das faixas */}
        {parsedKeys.map((k, i) => {
          if (!k) return null
          const cx = xFor(i)
          const cy = yFor(k.num)
          const isHovered = hoveredIdx === i
          const fillColor = k.letter === 'A' ? 'var(--accent)' : '#c45cfc'

          return (
            <g key={`pt-${i}`}>
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 7 : 5}
                fill={fillColor}
                stroke="var(--surface2)"
                strokeWidth={1.5}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: 'pointer', transition: 'r 0.1s' }}
              >
                <title>{`Posição ${i + 1}: ${k.num}${k.letter}`}</title>
              </circle>
              {isHovered && (
                <text
                  x={cx}
                  y={cy - 12}
                  fontSize={10}
                  fill="var(--text)"
                  fontFamily="var(--font-mono, monospace)"
                  textAnchor="middle"
                  fontWeight={700}
                >
                  {k.num}{k.letter}
                </text>
              )}
            </g>
          )
        })}

        {/* Marcas no eixo X */}
        {xLabels.map(i => (
          <text
            key={`xl-${i}`}
            x={xFor(i)}
            y={height - 8}
            fontSize={9}
            fill="var(--muted)"
            fontFamily="var(--font-mono, monospace)"
            textAnchor="middle"
          >
            {i + 1}
          </text>
        ))}
      </svg>

      {/* Resumo */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11,
        color: 'var(--muted)',
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        <span>
          score médio: <strong style={{ color: scoreColor }}>{avgScore}/100</strong>
        </span>
        <span>
          transições: <strong>{transitions.length}</strong>
        </span>
        <span>
          saltos: <strong style={{ color: jumps.length > 0 ? 'var(--red)' : 'var(--green)' }}>
            {jumps.length}
          </strong>
        </span>
      </div>

      {/* Lista de saltos (colapsável) */}
      {jumps.length > 0 && (
        <div>
          <button
            onClick={() => setShowJumps(!showJumps)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text)',
              fontSize: 12,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {showJumps ? '▼' : '▶'} ⚠️ {jumps.length} transições tensas
          </button>

          {showJumps && (
            <div style={{
              marginTop: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              {jumps.map((j, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(252, 92, 92, 0.08)',
                    border: '1px solid rgba(252, 92, 92, 0.3)',
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono, monospace)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: 'var(--muted)' }}>
                    pos {j.fromIdx + 1} → {j.toIdx + 1}
                  </span>
                  <span style={{ color: 'var(--text)' }}>
                    {j.fromKey} → {j.toKey}
                  </span>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>
                    score {j.score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}