'use client'
import { GeneratedSetlist } from '@/lib/types'

interface Props {
  setlist: GeneratedSetlist
  onRegenerate: () => void
}

export default function SetlistView({ setlist, onRegenerate }: Props) {
  const energyValues = setlist.setlist.map(t => t.energy ?? 5)
  const maxE = Math.max(...energyValues)

  const copySetlist = () => {
    const text = setlist.setlist.map((t, i) => `${i + 1}. ${t.title} — ${t.artist} (${t.bpm} BPM)`).join('\n')
    navigator.clipboard.writeText(text)
  }

  const exportTxt = () => {
    let txt = 'SET LIST — SetForge\n' + '='.repeat(40) + '\n\n'
    setlist.setlist.forEach((t, i) => {
      txt += `${i + 1}. ${t.title} — ${t.artist}\n`
      txt += `   ${t.bpm} BPM | ${t.key} | Energia: ${t.energy}/10\n`
      if (t.transitionNote && i < setlist.setlist.length - 1) txt += `   → ${t.transitionNote}\n`
      txt += '\n'
    })
    txt += `\nAnálise: ${setlist.analysis}\nDica: ${setlist.djTip}\n`
    const blob = new Blob([txt], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'setlist.txt'
    a.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Meta chips */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          `${setlist.setlist.length} faixas`,
          `duração: ${setlist.totalDuration}`,
          `pico: ${setlist.peakMoment}`,
        ].map(label => (
          <span key={label} style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '5px 12px', fontSize: 12,
            fontFamily: 'var(--font-mono, monospace)', color: 'var(--muted)',
          }}>{label}</span>
        ))}
      </div>

      {/* Energy curve */}
      <div>
        <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 8 }}>
          curva de energia
        </p>
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 40 }}>
          {energyValues.map((e, i) => (
            <div key={i} style={{
              flex: 1, borderRadius: '3px 3px 0 0',
              background: `linear-gradient(to top, var(--accent), var(--accent2))`,
              opacity: 0.75,
              height: `${Math.round((e / maxE) * 100)}%`,
            }} />
          ))}
        </div>
      </div>

      {/* Tracks */}
      {setlist.setlist.map((track, i) => (
        <div key={i}>
          <div style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '14px 18px',
            display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 14, alignItems: 'center',
          }}>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 18, color: 'var(--muted)', textAlign: 'center' }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>{track.title}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {track.artist}
                {i < setlist.setlist.length - 1 && track.transitionNote && ` · → ${track.transitionNote}`}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <span style={{ background: 'rgba(124,92,252,0.2)', color: 'var(--accent)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>
                {track.bpm} BPM
              </span>
              {track.key && (
                <span style={{ background: 'rgba(76,252,154,0.15)', color: 'var(--green)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>
                  {track.key}
                </span>
              )}
            </div>
          </div>

          {i < setlist.setlist.length - 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 18px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>
                Δ{Math.abs((setlist.setlist[i + 1]?.bpm ?? track.bpm) - track.bpm)} BPM
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          )}
        </div>
      ))}

      {/* AI Analysis */}
      <div style={{
        background: 'rgba(124,92,252,0.06)', border: '1px solid rgba(124,92,252,0.25)',
        borderRadius: 12, padding: 18,
      }}>
        <p style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 10 }}>✦ análise do set</p>
        <p style={{ fontSize: 14, lineHeight: 1.65 }}>{setlist.analysis}</p>
        {setlist.djTip && (
          <p style={{ fontSize: 13, color: 'var(--accent)', marginTop: 10 }}>
            <strong>Dica:</strong> {setlist.djTip}
          </p>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={exportTxt} style={btnStyle('secondary')}>exportar .txt</button>
        <button onClick={copySetlist} style={btnStyle('secondary')}>copiar lista</button>
        <button onClick={onRegenerate} style={btnStyle('primary')}>↺ regerar</button>
      </div>
    </div>
  )
}

const btnStyle = (variant: 'primary' | 'secondary') => ({
  padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
  background: variant === 'primary' ? 'linear-gradient(135deg, #7c5cfc, #c45cfc)' : 'var(--surface2)',
  color: variant === 'primary' ? '#fff' : 'var(--text)',
  border: variant === 'primary' ? 'none' : '1px solid var(--border)',
} as React.CSSProperties)
