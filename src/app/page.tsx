'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import TrackUpload from '@/components/TrackUpload'
import FolderList from '@/components/FolderList'
import { Track, Folder, SetConfig, GeneratedSetlist } from '@/lib/types'
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
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | 'all'>('all')

  const [setlist, setSetlist] = useState<GeneratedSetlist | null>(null)
  const [loading, setLoading] = useState(false)

  const [analyses, setAnalyses] = useState<Record<string, AudioAnalysis>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})

  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)

  // 🔒 Redireciona se não estiver logado
  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.href = '/login'
    }
  }, [status])

  // 📥 Carrega faixas do banco
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
          folderId: t.folderId ?? null,
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

  // 📁 Carrega pastas do banco
  useEffect(() => {
    if (status !== 'authenticated') return

    const loadFolders = async () => {
      try {
        const res = await fetch('/api/folders')
        if (!res.ok) {
          console.warn('[page] Falha ao carregar pastas:', res.status)
          return
        }

        const data = await res.json()
        const rawFolders: any[] = data.folders ?? []

        const mappedFolders: Folder[] = rawFolders.map(f => ({
          id: f.id,
          name: f.name,
          trackCount: f._count?.tracks ?? 0,
          createdAt: f.createdAt,
        }))

        setFolders(mappedFolders)
        console.log(`[page] Carregadas ${mappedFolders.length} pastas do banco`)
      } catch (err) {
        console.error('[page] Erro ao carregar pastas:', err)
      }
    }

    loadFolders()
  }, [status])

  // 🎯 Filtra faixas pela pasta selecionada
  const filteredTracks = (() => {
    if (selectedFolderId === 'all') return tracks
    if (selectedFolderId === null) return tracks.filter(t => !t.folderId)
    return tracks.filter(t => t.folderId === selectedFolderId)
  })()

  const tracksWithoutFolder = tracks.filter(t => !t.folderId).length

  // ➕ Adiciona faixa (local + banco) — com folderId
  const addTrack = (track: Track, durationSec?: number) => {
    const folderId = (selectedFolderId === 'all' || selectedFolderId === null)
      ? null
      : selectedFolderId

    const trackWithFolder: Track = {
      ...track,
      folderId,
    }

    setTracks(prev => prev.find(t => t.id === track.id) ? prev : [...prev, trackWithFolder])

    fetch('/api/tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: track.id,
        folderId,
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

    // Atualiza contador local da pasta
    if (folderId) {
      setFolders(prev => prev.map(f =>
        f.id === folderId ? { ...f, trackCount: f.trackCount + 1 } : f
      ))
    }
  }

  // ➖ Remove faixa
  const removeTrack = (id: string) => {
    const track = tracks.find(t => t.id === id)

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

    // Atualiza contador local da pasta
    if (track?.folderId) {
      setFolders(prev => prev.map(f =>
        f.id === track.folderId
          ? { ...f, trackCount: Math.max(0, f.trackCount - 1) }
          : f
      ))
    }

    fetch(`/api/tracks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      .catch(err => console.warn('[page] Erro ao deletar faixa:', err))
  }

  // 🧹 Limpa biblioteca (apenas faixas visíveis)
  const clearLibrary = () => {
    const ids = filteredTracks.map(t => t.id)
    setTracks(prev => prev.filter(t => !ids.includes(t.id)))
    setAnalyses(prev => {
      const next = { ...prev }
      ids.forEach(id => delete next[id])
      return next
    })
    setDurations(prev => {
      const next = { ...prev }
      ids.forEach(id => delete next[id])
      return next
    })
    setSetlist(null)

    ids.forEach(id => {
      fetch(`/api/tracks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        .catch(err => console.warn('[page] Erro ao deletar faixa:', err))
    })

    // Atualiza contador da pasta atual
    if (selectedFolderId && selectedFolderId !== 'all' && selectedFolderId !== null) {
      setFolders(prev => prev.map(f =>
        f.id === selectedFolderId ? { ...f, trackCount: 0 } : f
      ))
    }
  }

  // 📁 Cria pasta
  const createFolder = async (name: string) => {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Erro ao criar pasta')
    }

    const data = await res.json()
    const newFolder: Folder = {
      id: data.folder.id,
      name: data.folder.name,
      trackCount: 0,
      createdAt: data.folder.createdAt,
    }

    setFolders(prev => [newFolder, ...prev])
    setSelectedFolderId(newFolder.id)
    console.log('[page] Pasta criada:', newFolder.name)
  }

  // 🗑 Deleta pasta
  const deleteFolder = async (folderId: string) => {
    const res = await fetch(`/api/folders?id=${encodeURIComponent(folderId)}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Erro ao deletar pasta')
    }

    setFolders(prev => prev.filter(f => f.id !== folderId))

    setTracks(prev => prev.map(t =>
      t.folderId === folderId ? { ...t, folderId: null } : t
    ))

    if (selectedFolderId === folderId) {
      setSelectedFolderId('all')
    }

    console.log('[page] Pasta deletada:', folderId)
  }

  // ✏️ Renomeia pasta
  const renameFolder = async (folderId: string, newName: string) => {
    const res = await fetch('/api/folders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: folderId, name: newName }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Erro ao renomear pasta')
    }

    setFolders(prev => prev.map(f =>
      f.id === folderId ? { ...f, name: newName.trim() } : f
    ))
    console.log('[page] Pasta renomeada:', folderId, '→', newName)
  }

  // 🎼 Recebe análise estrutural
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
    if (filteredTracks.length < 3) return
    setLoading(true)
    setSetlist(null)
    try {
      const optimalOrder = computeOptimalOrder(filteredTracks)
      const optimalScore = scoreOrder(optimalOrder)

      console.log(`[page] Ordem ótima local: score médio ${optimalScore}%`)
      console.log(`[page] Ordem sugerida:`, optimalOrder.map(t => t.title).join(' → '))

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
    const base = `${filteredTracks.length} faixa${filteredTracks.length !== 1 ? 's' : ''}`
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

      {/* 🎯 LAYOUT PRINCIPAL: sidebar + conteúdo */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '28px 20px',
        display: 'flex',
        gap: 24,
        alignItems: 'flex-start',
      }}>

        {/* 📁 SIDEBAR (pastas) */}
        <aside style={{
          width: 220,
          flexShrink: 0,
          position: 'sticky',
          top: 20,
          maxHeight: 'calc(100vh - 100px)',
          overflowY: 'auto',
          padding: '16px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
        }}>
          <FolderList
            folders={folders}
            selectedFolderId={selectedFolderId}
            totalTracks={tracks.length}
            tracksWithoutFolder={tracksWithoutFolder}
            onSelect={setSelectedFolderId}
            onCreate={createFolder}
            onDelete={deleteFolder}
            onRename={renameFolder}
          />
        </aside>

        {/* 📚 CONTEÚDO PRINCIPAL */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>

          <Panel title="biblioteca de músicas" badge={libraryBadge}>
            <TrackUpload
              onAddTrack={addTrack}
              onAddAnalysis={handleAddAnalysis}
              onQueueChange={setQueueStats}
              libraryTracks={filteredTracks}
            />

            {filteredTracks.length > 0 && (
              <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                <button
                  onClick={clearLibrary}
                  style={{ ...btnStyle('secondary'), color: 'var(--red)', borderColor: 'var(--red)' }}
                >
                  limpar {selectedFolderId === 'all' ? 'biblioteca' : 'pasta'}
                </button>
              </div>
            )}

            {filteredTracks.length > 0 && (
              <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 12 }}>
                  faixas {selectedFolderId === 'all' ? 'na biblioteca' : 'nesta pasta'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredTracks.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <strong>{t.title}</strong> {t.artist && `— ${t.artist}`}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>
                        {t.bpm > 0 ? `${t.bpm} BPM` : ''}
                        {t.key && t.key !== 'desconhecido' ? ` · ${t.key}` : ''}
                      </span>
                      {analyses[t.id] && (
                        <span style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>
                          ✓ estrutura
                        </span>
                      )}
                      <button onClick={() => removeTrack(t.id)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <button
                onClick={generate}
                disabled={filteredTracks.length < 3 || loading}
                style={{
                  ...btnStyle('primary'),
                  width: '100%',
                  justifyContent: 'center',
                  opacity: filteredTracks.length < 3 ? 0.5 : 1,
                  cursor: filteredTracks.length < 3 ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? '⟳ montando...' : '✦ montar setlist'}
              </button>
              {filteredTracks.length < 3 && (
                <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
                  adicione pelo menos 3 faixas para montar
                </p>
              )}
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

        </main>
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