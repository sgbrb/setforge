'use client'

import { useMemo } from 'react'

interface TrackForChart {
  energy?: number
  segments?: { energy?: number }
}

interface EnergyCurveChartProps {
  tracks: TrackForChart[]
  totalPositions: number
  energyTrend?: 'steady' | 'build' | 'wave' | 'custom' // 🆕
}

export default function EnergyCurveChart({
  tracks,
  totalPositions,
  energyTrend,
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

  // 🆕 Calcula a energia alvo pra cada posição baseada na tendência
  const targetEnergies = useMemo(() => {
    const arr: number[] = []
    const n = totalPositions

    if (energyTrend === 'steady') {
      // Manter: linha reta em 9 (a energia mais comum da sua biblioteca)
      for (let i = 1; i <= n; i++) arr.push(9)
    } else if (energyTrend === 'build') {
      // Subir: começa em 8, sobe linearmente até 10, depois desce um pouco para 9
      for (let i = 1; i <= n; i++) {
        const pct = i / n
        if (pct <= 0.33) arr.push(8 + (9 - 8) * (pct / 0.33))
        else if (pct <= 0.66) arr.push(9 + (10 - 9) * ((pct - 0.33) / 0.33))
        else arr.push(10 - (10 - 9) * ((pct - 0.66) / 0.34))
      }
    } else if (energyTrend === 'wave') {
      // Onda: sobe e desce duas vezes (9 → 10 → 8 → 10)
      for (let i = 1; i <= n; i++) {
        const pct = i / n
        if (pct <= 0.25) arr.push(9 + (10 - 9) * (pct / 0.25))
        else if (pct <= 0.5) arr.push(10 - (10 - 8) * ((pct - 0.25) / 0.25))
        else if (pct <= 0.75) arr.push(8 + (10 - 8) * ((pct - 0.5) / 0.25))
        else arr.push(10 - (10 - 9) * ((pct - 0.75) / 0.25))
      }
    } else {
      // Fallback: curva adaptativa antiga (se não tiver tendência)
      for (let i = 1; i <= n; i++) {
        const pct = i / n
        if (pct < 0.17) arr.push(4)
        else if (pct < 0.50) arr.push(6)
        else if (pct < 0.83) arr.push(9)
        else arr.push(6)
      }
    }
    return arr
  }, [totalPositions, energyTrend])

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

  const realPoints = realEnergies
    .map((e, i) => `${xFor(i)},${yFor(e)}`)
    .join(' ')

  const targetPoints = targetEnergies
    .map((e, i) => `${xFor(i)},${yFor(e)}`)
    .join(' ')

  const getPointColor = (energy: number) => {
    if (energy >= 8) return 'var(--red)'
    if (energy >= 6) return 'var(--yellow)'
    if (energy >= 4) return 'var(--accent)'
    return 'var(--green)'
  }

  const xLabels: number[] = []
  for (let i = 0; i < n; i += 5) xLabels.push(i)
  if (xLabels[xLabels.length - 1] !== n - 1) xLabels.push(n - 1)

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

        <polyline
          points={targetPoints}
          fill="none"
          stroke="var(--muted)"
          strokeOpacity={0.5}
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />

        <polyline
          points={realPoints}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

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