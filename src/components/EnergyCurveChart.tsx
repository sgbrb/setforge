'use client'

import { useMemo } from 'react'
import { getTargetEnergy } from '@/lib/harmonic-utils'

interface TrackForChart {
  energy?: number
  segments?: { energy?: number }
}

interface EnergyCurveChartProps {
  tracks: TrackForChart[]
  totalPositions: number
}

export default function EnergyCurveChart({
  tracks,
  totalPositions,
}: EnergyCurveChartProps) {
  const width = 800
  const height = 200
  const padding = 32

  // Extrai a energia real de cada faixa
  const realEnergies = useMemo(() => {
    return tracks.map(t => {
      const e = t.energy ?? t.segments?.energy ?? 0
      return typeof e === 'number' && e > 0 ? e : 0
    })
  }, [tracks])

  // Calcula a energia alvo pra cada posição
  const targetEnergies = useMemo(() => {
    const arr: number[] = []
    for (let i = 1; i <= totalPositions; i++) {
      arr.push(getTargetEnergy(i, totalPositions))
    }
    return arr
  }, [totalPositions])

  // Se não há dados, mostra "aguardando"
  if (realEnergies.every(e => e === 0)) {
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
        ⏳ curva de energia disponível após análise das faixas
      </div>
    )
  }

  // Helpers de coordenada
  const innerW = width - padding * 2
  const innerH = height - padding * 2
  const n = Math.max(realEnergies.length, 1)

  const xFor = (i: number) => padding + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yFor = (energy: number) => height - padding - (energy / 10) * innerH

  // Monta o `points` do SVG pra cada linha
  const realPoints = realEnergies
    .map((e, i) => `${xFor(i)},${yFor(e)}`)
    .join(' ')

  const targetPoints = targetEnergies
    .map((e, i) => `${xFor(i)},${yFor(e)}`)
    .join(' ')

  // Pontos coloridos por energia
  const getPointColor = (energy: number) => {
    if (energy >= 8) return 'var(--red)'
    if (energy >= 6) return 'var(--yellow)'
    if (energy >= 4) return 'var(--accent)'
    return 'var(--green)'
  }

  // Marcas no eixo X (a cada 5 posições)
  const xLabels: number[] = []
  for (let i = 0; i < n; i += 5) {
    xLabels.push(i)
  }
  if (xLabels[xLabels.length - 1] !== n - 1) {
    xLabels.push(n - 1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <p style={{
          fontSize: 11,
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono, monospace)',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}>
          curva de energia do set
        </p>
        <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          <span>
            <span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--accent)', marginRight: 6, verticalAlign: 'middle' }} />
            real
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 14, height: 2, borderTop: '2px dashed var(--muted)', marginRight: 6, verticalAlign: 'middle' }} />
            alvo
          </span>
        </div>
      </div>

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
        {/* Grid de energia (0, 2, 4, 6, 8, 10) */}
        {[0, 2, 4, 6, 8, 10].map(e => (
          <g key={`grid-${e}`}>
            <line
              x1={padding}
              y1={yFor(e)}
              x2={width - padding}
              y2={yFor(e)}
              stroke="var(--border)"
              strokeOpacity={0.4}
              strokeWidth={1}
            />
            <text
              x={padding - 6}
              y={yFor(e) + 3}
              fontSize={9}
              fill="var(--muted)"
              fontFamily="var(--font-mono, monospace)"
              textAnchor="end"
            >
              {e}
            </text>
          </g>
        ))}

        {/* Linha alvo (tracejada) */}
        <polyline
          points={targetPoints}
          fill="none"
          stroke="var(--muted)"
          strokeOpacity={0.5}
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />

        {/* Linha real (sólida) */}
        <polyline
          points={realPoints}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Pontos coloridos */}
        {realEnergies.map((e, i) => (
          <circle
            key={`pt-${i}`}
            cx={xFor(i)}
            cy={yFor(e)}
            r={4}
            fill={getPointColor(e)}
            stroke="var(--surface2)"
            strokeWidth={1.5}
          >
            <title>{`Posição ${i + 1} · Energia ${e.toFixed(1)}/10`}</title>
          </circle>
        ))}

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
          pico: <strong style={{ color: 'var(--red)' }}>{Math.max(...realEnergies).toFixed(1)}</strong>/10
        </span>
        <span>
          média: <strong style={{ color: 'var(--accent)' }}>
            {(realEnergies.reduce((a, b) => a + b, 0) / realEnergies.length).toFixed(1)}
          </strong>/10
        </span>
        <span>
          vale: <strong style={{ color: 'var(--green)' }}>{Math.min(...realEnergies.filter(e => e > 0)).toFixed(1)}</strong>/10
        </span>
      </div>
    </div>
  )
}