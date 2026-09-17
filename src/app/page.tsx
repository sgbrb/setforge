'use client'
import { useState } from 'react'
import { Track, SetConfig, GeneratedSetlist } from '@/lib/types'
import TrackSearch from '@/components/TrackSearch'
import SetlistView from '@/components/SetlistView'

const SAMPLE_TRACKS: Track[] = [
  { id: '1', title: 'Ultra Soul', artist: 'Vintage Culture', bpm: 124, key: 'Dm', energy: 8, source: 'manual' },
  { id: '2', title: 'Losing It', artist: 'FISHER', bpm: 128, key: 'Bm', energy: 9, source: 'manual' },
  { id: '3', title: 'See the Sun', artist: 'Shouse', bpm: 120, key: 'C', energy: 8, source: 'manual' },
  { id: '4', title: 'Love Tonight', artist: 'Shouse', bpm: 118, key: 'Am', energy: 7, source: 'manual' },
  { id: '5', title: 'Cola', artist: 'CamelPhat', bpm: 124, key: 'Gm', energy: 7, source: 'manual' },
  { id: '6', title: 'Kernkraft 400', artist: 'Zombie Nation', bpm: 130, key: 'Fm', energy: 10, source: 'manual' },
]

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [config, setConfig] = useState<SetConfig>({
    eventType: 'balada eletrônica',
    duration: '2 horas',
    targetBpm: '120-130 BPM',
    energyCurve: 'crescente (começa suave, vai subindo)',
    audience: '',
  })
  const [setlist, setSetlist] = useState<GeneratedSetlist | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'search' | 'manual'>('search')

  const addTrack = (track: Track) => {
    setTracks(prev => prev.find(t => t.id === track.id) ? prev : [...prev, track])
  }

  const removeTrack = (id: string) => setTracks(prev => prev.filter(t => t.id !== id))

  const loadSamples = () => setTracks(SAMPLE_TRACKS)

  const generate = async () => {
    if (tracks.length < 3) return
    setLoading(true)
    setSetlist(null)
    try {
      const res = await fetch('/api/generate-setlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks, config }),
      })
      const data = await res.json()
      setSetlist(data)
    } catch {
      alert('Erro ao gerar set list. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 80 }}>
      {/* Header */}
      <header style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg, #7c5cfc, #c45cfc)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: '#fff', fontSize: 16, boxShadow: '0 0 20px rgba(124,92,252,0.3)' }}>SF</div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>SetForge</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>gerador de set list com IA</p>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Config */}
        <Panel title="configuração do set">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="tipo de evento">
              <select value={config.eventType} onChange={e => setConfig(c => ({ ...c, eventType: e.target.value }))}>
                {['Balada eletrônica','Festa aberta / open bar','Casamento','Corporativo','Festival','Bar / Lounge'].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="duração">
              <select value={config.duration} onChange={e => setConfig(c => ({ ...c, duration: e.target.value }))}>
                {['1 hora','2 horas','3 horas','4 horas','5+ horas'].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="BPM alvo">
              <select value={config.targetBpm} onChange={e => setConfig(c => ({ ...c, targetBpm: e.target.value }))}>
                {['80-100 BPM','100-120 BPM','120-130 BPM','130-145 BPM','145-175 BPM'].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="curva de energia">
              <select value={config.energyCurve} onChange={e => setConfig(c => ({ ...c, energyCurve: e.target.value }))}>
                {['crescente (começa suave, vai subindo)','pico no meio (sobe, pico, desce)','constante alta energia','montanha russa (variada)'].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="público / contexto" full>
              <input type="text" value={config.audience} onChange={e => setConfig(c => ({ ...c, audience: e.target.value }))} placeholder="ex: público jovem 20-30 anos, fãs de house music..." />
            </Field>
          </div>
        </Panel>

        {/* Library */}
        <Panel title="biblioteca de músicas" badge={`${tracks.length} faixa${tracks.length !== 1 ? 's' : ''}`}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 10, padding: 4, marginBottom: 20 }}>
            {(['search','manual'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: activeTab === tab ? '1px solid var(--border)' : 'none', background: activeTab === tab ? 'var(--surface)' : 'transparent', color: activeTab === tab ? 'var(--text)' : 'var(--muted)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>
                {tab === 'search' ? '🔍 Buscar (Spotify · SoundCloud · YouTube)' : '✏️ Adicionar manual'}
              </button>
            ))}
          </div>

          {activeTab === 'search' && <TrackSearch onAddTrack={addTrack} />}

          {activeTab === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: '0 0 8px' }}>
                {['título — artista','BPM','tom','energia'].map(h => <span key={h} style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', padding: '0 12px' }}>{h}</span>)}
              </div>
              {tracks.map(t => (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                  <input defaultValue={t.title} onChange={e => setTracks(prev => prev.map(x => x.id === t.id ? { ...x, title: e.target.value } : x))} />
                  <input type="number" defaultValue={t.bpm} onChange={e => setTracks(prev => prev.map(x => x.id === t.id ? { ...x, bpm: Number(e.target.value) } : x))} />
                  <input defaultValue={t.key} onChange={e => setTracks(prev => prev.map(x => x.id === t.id ? { ...x, key: e.target.value } : x))} />
                  <input type="number" defaultValue={t.energy} min={1} max={10} onChange={e => setTracks(prev => prev.map(x => x.id === t.id ? { ...x, energy: Number(e.target.value) } : x))} />
                  <button onClick={() => removeTrack(t.id)} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 8, background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              ))}
              <button onClick={() => addTrack({ id: Date.now().toString(), title: '', artist: '', bpm: 128, key: 'Am', energy: 7, source: 'manual' })} style={{ border: '1px dashed var(--accent)', borderRadius: 10, background: 'none', color: 'var(--accent)', padding: '9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, marginTop: 4 }}>
                + adicionar faixa
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button onClick={loadSamples} style={btnStyle('secondary')}>carregar exemplos</button>
            {tracks.length > 0 && <button onClick={() => setTracks([])} style={{ ...btnStyle('secondary'), color: 'var(--red)', borderColor: 'var(--red)' }}>limpar biblioteca</button>}
          </div>

          {/* Tracks list (visible in both tabs) */}
          {tracks.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 12 }}>faixas na biblioteca</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tracks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                    {t.artworkUrl && <img src={t.artworkUrl} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />}
                    <div style={{ flex: 1, fontSize: 13 }}><strong>{t.title}</strong> {t.artist && `— ${t.artist}`}</div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>{t.bpm > 0 ? `${t.bpm} BPM` : ''} {t.key}</span>
                    <button onClick={() => removeTrack(t.id)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <button onClick={generate} disabled={tracks.length < 3 || loading} style={{ ...btnStyle('primary'), width: '100%', justifyContent: 'center', opacity: tracks.length < 3 ? 0.5 : 1, cursor: tracks.length < 3 ? 'not-allowed' : 'pointer' }}>
              {loading ? '⟳ gerando...' : '✦ gerar set list com IA'}
            </button>
            {tracks.length < 3 && <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>adicione pelo menos 3 faixas para gerar</p>}
          </div>
        </Panel>

        {/* Setlist output */}
        {(loading || setlist) && (
          <Panel title="set list gerado" badge={setlist ? '● gerado com IA' : undefined}>
            {loading && (
              <div style={{ textAlign: 'center', padding: 48 }}>
                <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, color: 'var(--muted)' }}>analisando BPM e harmonia...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            )}
            {setlist && <SetlistView setlist={setlist} onRegenerate={generate} />}
          </Panel>
        )}
      </div>
    </div>
  )
}

function Panel({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--muted)' }}>{title}</span>
        {badge && <span style={{ fontSize: 12, color: 'var(--green)', fontFamily: 'var(--font-mono, monospace)' }}>{badge}</span>}
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>{label}</label>
      {children}
    </div>
  )
}

const btnStyle = (variant: 'primary' | 'secondary') => ({
  padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8,
  background: variant === 'primary' ? 'linear-gradient(135deg, #7c5cfc, #c45cfc)' : 'var(--surface2)',
  color: '#fff', border: variant === 'primary' ? 'none' : '1px solid var(--border)',
} as React.CSSProperties)
