'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import TrackUpload from '@/components/TrackUpload'
import { Track, SetConfig, GeneratedSetlist } from '@/lib/types'
import SetlistView from '@/components/SetlistView'
import { computeOptimalOrder, scoreOrder } from '@/lib/optimal-order'
import { AudioAnalysis } from '@/lib/mix-timeline'

interface QueueStats {
  total: number
  done: number
  pending: number
  processing: number
  errors: number
}

const DEFAULT_CONFIG: SetConfig = {
  eventType: 'Balada eletrônica',
  duration: '2 horas',
  energyCurve: 'aquecer (começa suave, vai subindo)',
  audience: '',
}

export default function Home() {
  const { status } = useSession()

  const [tracks, setTracks] = useState<Track[]>([])
  const [setlist, setSetlist] = useState<GeneratedSetlist | null>(null)
  const [loading, setLoading] = useState(false)

  const [analyses, setAnalyses] = useState<Record<string, AudioAnalysis>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})

  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.href = '/login'
    }
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return

    const loadTracks = async () => {
      try {
        const res = await fetch('/api/tracks')
        if (!res.ok) {
          console.warn('[page] Falha ao carregar faixas:', res.status)
          return
        }

        const data = await res.json()
        const dbTracks: any[] = data.tracks ?? []

        const mappedTracks: Track[] = dbTracks.map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          bpm: t.bpm,
          key: t.key,
          energy: t.energy,
          source: 'upload',
        }))

        const newAnalyses: Record<string, AudioAnalysis> = {}
        const newDurations: Record<string, number> = {}

        dbTracks.forEach(t => {
          if (t.segments) {
            newAnalyses[t.id] = t.segments as AudioAnalysis
          }
          if (t.durationSec && t.durationSec > 0) {
            newDurations[t.id] = t.durationSec
          }
        })

        setTracks(mappedTracks)
        setAnalyses(newAnalyses)
        setDurations(newDurations)

        console.log(`[page] Carregadas ${mappedTracks.length} faixas do banco`)
      } catch (err) {
        console.error('[page] Erro ao carregar faixas:', err)
      }
    }

    loadTracks()
  }, [status])

  // ➕ Adiciona faixa (local + banco)
  const addTrack = (track: Track, durationSec?: number) => {
    setTracks(prev => prev.find(t => t.id === track.id) ? prev : [...prev, track])

    fetch('/api/tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: track.id,
        title: track.title,
        artist: track.artist || '',
        bpm: track.bpm || 0,
        key: track.key || '',
        energy: track.energy || 7,
        durationSec: durationSec ?? 0,
      }),
    })
      .then(res => {
        if (!res.ok) console.warn('[page] Falha ao salvar faixa:', res.status)
        else console.log('[page] Faixa salva no banco:', track.title)
      })
      .catch(err => console.warn('[page] Erro ao salvar faixa:', err))
  }

  // ➖ Remove faixa (local + banco)
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

    fetch(`/api/tracks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      .catch(err => console.warn('[page] Erro ao deletar faixa:', err))
  }

  // 🧹 Limpa biblioteca (local + banco)
  const clearLibrary = () => {
    const ids = tracks.map(t => t.id)
    setTracks([])
    setAnalyses({})
    setDurations({})
    setSetlist(null)

    ids.forEach(id => {
      fetch(`/api/tracks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        .catch(err => console.warn('[page] Erro ao deletar faixa:', err))
    })
  }

  // 🎼 Recebe análise estrutural (local + banco)
  const handleAddAnalysis = (
    trackId: string,
    analysis: AudioAnalysis & { key?: string; bpm?: number },
    durationSec: number
  ) => {
    setAnalyses(prev => ({ ...prev, [trackId]: analysis }))
    setDurations(prev => ({ ...prev, [trackId]: durationSec }))

    setTracks(prev => prev.map(t => {
      if (t.id !== trackId) return t
      return {
        ...t,
        key: analysis.key || t.key,
        bpm: analysis.bpm && analysis.bpm > 0 ? analysis.bpm : t.bpm,
      }
    }))

    fetch('/api/tracks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: trackId,
        key: analysis.key || '',
        bpm: analysis.bpm ?? 0,
        durationSec: durationSec,
        segments: analysis,
      }),
    })
      .then(res => {
        if (!res.ok) console.warn('[page] Falha ao salvar análise:', res.status)
        else console.log('[page] Análise salva no banco:', trackId)
      })
      .catch(err => console.warn('[page] Erro ao salvar análise:', err))
  }

  const generate = async () => {
    if (tracks.length < 3) return
    setLoading(true)
    setSetlist(null)
    try {
      // 🎯 A1: Calcula a ordem ótima LOCAL antes de enviar pra IA
      const optimalOrder = computeOptimalOrder(tracks)
      const optimalScore = scoreOrder(optimalOrder)

      console.log(`[page] Ordem ótima local: score médio ${optimalScore}%`)
      console.log(`[page] Ordem sugerida:`, optimalOrder.map(t => t.title).join(' → '))

      // Envia a ordem ótima pra IA (ela pode refinar, mas já parte do melhor)
      const tracksForAI = optimalOrder

      const res = await fetch('/api/generate-setlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: tracksForAI, config: DEFAULT_CONFIG }),
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
      <header style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg, #7c5cfc, #c45cfc)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: '#fff', fontSize: 16, boxShadow: '0 0 20px rgba(124,92,252,0.3)' }}>SF</div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>SetForge</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>gerador de set list com IA</p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {status === 'authenticated' ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
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

          {tracks.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 12 }}>faixas na biblioteca</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tracks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
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

const btnStyle = (variant: 'primary' | 'secondary') => ({
  padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8,
  background: variant === 'primary' ? 'linear-gradient(135deg, #7c5cfc, #c45cfc)' : 'var(--surface2)',
  color: '#fff', border: variant === 'primary' ? 'none' : '1px solid var(--border)',
} as React.CSSProperties)