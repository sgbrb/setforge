'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import TrackUpload from '@/components/TrackUpload'
import { Track, SetConfig, GeneratedSetlist } from '@/lib/types'
import SetlistView from '@/components/SetlistView'
import { findCompatibleTracks } from '@/lib/harmonic-utils'
import { AudioAnalysis } from '@/lib/mix-timeline'

interface QueueStats {
  total: number
  done: number
  pending: number
  processing: number
  errors: number
}

export default function Home() {
  const { status } = useSession()

  const [tracks, setTracks] = useState<Track[]>([])
  const [config, setConfig] = useState<SetConfig>({
    eventType: 'Balada eletrônica',
    duration: '2 horas',
    energyCurve: 'aquecer (começa suave, vai subindo)',
    audience: '',
  })
  const [setlist, setSetlist] = useState<GeneratedSetlist | null>(null)
  const [loading, setLoading] = useState(false)

  // Análise estrutural por trackId + duração
  const [analyses, setAnalyses] = useState<Record<string, AudioAnalysis>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})

  // Estado da fila de upload (refletido no badge do painel)
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)

  // 🔒 Se não estiver logado, redireciona
  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.href = '/login'
    }
  }, [status])

  const addTrack = (track: Track) => {
    setTracks(prev => prev.find(t => t.id === track.id) ? prev : [...prev, track])
  }

  // Remove a faixa E a análise associada (evita lixo em memória)
  const removeTrack = (id: string) => {
    setTracks(prev => prev.filter(t => t.id !== id))
    setAnalyses(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setDurations(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  // Limpa tudo: faixas + análises + durações
  const clearLibrary = () => {
    setTracks([])
    setAnalyses({})
    setDurations({})
    setSetlist(null)
  }

  // Recebe a análise estrutural do TrackUpload
  const handleAddAnalysis = (
    trackId: string,
    analysis: AudioAnalysis,
    durationSec: number
  ) => {
    setAnalyses(prev => ({ ...prev, [trackId]: analysis }))
    setDurations(prev => ({ ...prev, [trackId]: durationSec }))
  }

  const generate = async () => {
    if (tracks.length < 3) return
    setLoading(true)
    setSetlist(null)
    try {
      const anchor = tracks[0]
      const compatible = findCompatibleTracks(anchor, tracks, 60)
      const tracksForAI = compatible.length > 0
        ? [anchor, ...compatible.slice(0, 20).map(c => c.track)]
        : tracks

      const res = await fetch('/api/generate-setlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: tracksForAI, config }),
      })

      if (res.status === 401) {
        alert('Você precisa fazer login para gerar um set list.')
        window.location.href = '/login'
        return
      }

      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Erro ao gerar set list')
        return
      }
      setSetlist(data)
    } catch (error) {
      console.error('Erro completo:', error)
      const msg = error instanceof Error ? error.message : 'Erro desconhecido'
      alert(`Erro ao gerar set list: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  // Badge do painel "biblioteca" — mostra faixas + progresso da fila
  const libraryBadge = (() => {
    const base = `${tracks.length} faixa${tracks.length !== 1 ? 's' : ''}`
    if (queueStats && (queueStats.processing > 0 || queueStats.pending > 0)) {
      const total = queueStats.total
      const done = queueStats.done
      return `${base} · ⟳ ${done}/${total}`
    }
    return base
  })()

  if (status === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <p style={{
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 13,
        }}>
          ⟳ verificando sessão...
        </p>
      </div>
    )
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

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {status === 'authenticated' ? (
            <>
              <span style={{
                fontSize: 12,
                color: 'var(--muted)',
                fontFamily: 'var(--font-mono, monospace)',
              }}>
                ● logado
              </span>
              <button
                onClick={async () => {
                  const { signOut } = await import('next-auth/react')
                  await signOut({ callbackUrl: '/' })
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--muted)',
                  padding: '6px 14px',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono, monospace)',
                  cursor: 'pointer',
                }}
              >
                sair
              </button>
            </>
          ) : (
            <a
              href="/login"
              style={{
                background: 'linear-gradient(135deg, #7c5cfc, #c45cfc)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              entrar
            </a>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Config */}
        <Panel title="configuração do set">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Onde vai tocar */}
            <Field label="🎧 Onde você vai tocar?">
              <select value={config.eventType} onChange={e => setConfig(c => ({ ...c, eventType: e.target.value }))}>
                {['Balada eletrônica','Festa aberta / open bar','Casamento','Corporativo','Festival','Bar / Lounge'].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>

            {/* Quanto tempo */}
            <Field label="⏱ Quanto tempo de set?">
              <select value={config.duration} onChange={e => setConfig(c => ({ ...c, duration: e.target.value }))}>
                {['1 hora','2 horas','3 horas','4 horas','5+ horas'].map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>

            {/* Como a pista deve reagir */}
            <Field label="⚡ Como a pista deve reagir?">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { value: 'aquecer (começa suave, vai subindo)', label: 'Aquecer devagar e explodir no final' },
                  { value: 'constante alta energia', label: 'Manter energia alta o tempo todo' },
                  { value: 'pico no meio (sobe, pico, desce)', label: 'Pico no meio e descer no final' },
                  { value: 'montanha russa (variada)', label: 'Altos e baixos (montanha-russa)' },
                ].map(opt => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      background: config.energyCurve === opt.value ? 'rgba(124, 92, 252, 0.1)' : 'var(--surface2)',
                      border: `1px solid ${config.energyCurve === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      name="energyCurve"
                      checked={config.energyCurve === opt.value}
                      onChange={() => setConfig(c => ({ ...c, energyCurve: opt.value }))}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </Field>

            {/* Quem vai estar na pista */}
            <Field label="👥 Quem vai estar na pista? (opcional)">
              <input
                type="text"
                value={config.audience}
                onChange={e => setConfig(c => ({ ...c, audience: e.target.value }))}
                placeholder="ex: público jovem 20-30 anos, fãs de house music..."
              />
            </Field>
          </div>
        </Panel>

        {/* Library */}
        <Panel title="biblioteca de músicas" badge={libraryBadge}>
          <TrackUpload
            onAddTrack={addTrack}
            onAddAnalysis={handleAddAnalysis}
            onQueueChange={setQueueStats}
            libraryTracks={tracks}
          />

          {tracks.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <button
                onClick={clearLibrary}
                style={{ ...btnStyle('secondary'), color: 'var(--red)', borderColor: 'var(--red)' }}
              >
                limpar biblioteca
              </button>
            </div>
          )}

          {/* Tracks list */}
          {tracks.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 12 }}>faixas na biblioteca</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tracks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                    {t.artworkUrl && <img src={t.artworkUrl} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />}
                    <div style={{ flex: 1, fontSize: 13 }}><strong>{t.title}</strong> {t.artist && `— ${t.artist}`}</div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                      {t.bpm > 0 ? `${t.bpm} BPM` : ''}
                      {t.key && t.key !== 'desconhecido' ? ` · ${t.key}` : ''}
                    </span>
                    {analyses[t.id] && (
                      <span style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-mono, monospace)' }}>
                        ✓ estrutura
                      </span>
                    )}
                    <button onClick={() => removeTrack(t.id)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <button onClick={generate} disabled={tracks.length < 3 || loading} style={{ ...btnStyle('primary'), width: '100%', justifyContent: 'center', opacity: tracks.length < 3 ? 0.5 : 1, cursor: tracks.length < 3 ? 'not-allowed' : 'pointer' }}>
              {loading ? '⟳ montando...' : '✦ montar setlist'}
            </button>
            {tracks.length < 3 && <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>adicione pelo menos 3 faixas para montar</p>}
          </div>
        </Panel>

        {/* Setlist output */}
        {(loading || setlist) && (
          <Panel title="set list gerado" badge={setlist ? '● gerado com IA' : undefined}>
            {loading && (
              <div style={{ textAlign: 'center', padding: 48 }}>
                <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, color: 'var(--muted)' }}>analisando harmonia e estrutura...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            )}
            {setlist && (
              <SetlistView
                setlist={setlist}
                onRegenerate={generate}
                analyses={analyses}
                durations={durations}
              />
            )}
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