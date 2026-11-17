'use client'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import TrackUpload from '@/components/TrackUpload'
import FolderList from '@/components/FolderList'
import TrackList from '@/components/TrackList'
import { Track, Folder, SetConfig, GeneratedSetlist } from '@/lib/types'
import SetlistView from '@/components/SetlistView'
import SmartSetlistModal, { type SmartSetlistFilters } from '@/components/SmartSetlistModal'
import { computeOptimalOrder, scoreOrder } from '@/lib/optimal-order'
import { AudioAnalysis } from '@/lib/mix-timeline'
import { normalizeTitle } from '@/lib/harmonic-utils'
import SetlistHistory from '@/components/SetlistHistory'

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

const isRealFolder = (id: string | null | 'all'): id is string =>
  typeof id === 'string' && id !== 'all'

export default function Home() {
  const { status } = useSession()

  const [tracks, setTracks] = useState<Track[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | 'all'>('all')

  const [setlist, setSetlist] = useState<GeneratedSetlist | null>(null)
  const [loading, setLoading] = useState(false)

  const [smartModalOpen, setSmartModalOpen] = useState(false)
  const [smartLoading, setSmartLoading] = useState(false)
  
  const [lastEnergyTrend, setLastEnergyTrend] = useState<'steady' | 'build' | 'wave' | 'custom'>('steady')
  const [lastFilters, setLastFilters] = useState<SmartSetlistFilters | null>(null)

  const [analyses, setAnalyses] = useState<Record<string, AudioAnalysis>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})

  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null)

  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<'library' | 'history'>('library')

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
          folderId: t.folderId ?? null,
          title: t.title,
          artist: t.artist,
          bpm: t.bpm,
          key: t.key,
          energy: t.energy,
          source: 'upload',
          firstBeatSec: t.firstBeatSec ?? 0,
        }))

        const newAnalyses: Record<string, AudioAnalysis> = {}
        const newDurations: Record<string, number> = {}

        dbTracks.forEach(t => {
          if (t.segments && Array.isArray(t.segments) && t.segments.length > 0) {
            newAnalyses[t.id] = {
              bpm: t.bpm || 0,
              segments: t.segments,
            }
          }
          
          if (t.durationSec && t.durationSec > 0) {
            newDurations[t.id] = t.durationSec
          }
        })

        setTracks(mappedTracks)
        setAnalyses(newAnalyses)
        setDurations(newDurations)
      } catch (err) {
        console.error('[page] Erro ao carregar faixas:', err)
      }
    }

    loadTracks()
  }, [status, refreshKey])

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

        const mappedFolders: Folder[] = rawFolders
          .filter(f => !f.isVirtual)
          .map(f => ({
            id: f.id,
            name: f.name,
            trackCount: f._count?.tracks ?? 0,
            createdAt: f.createdAt,
          }))

        setFolders(mappedFolders)
      } catch (err) {
        console.error('[page] Erro ao carregar pastas:', err)
      }
    }

    loadFolders()
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    if (!isRealFolder(selectedFolderId)) {
      setSetlist(null)
      return
    }

    let cancelled = false

    const loadSetlistForFolder = async () => {
      try {
        const res = await fetch(`/api/setlist?folderId=${encodeURIComponent(selectedFolderId)}`)
        if (!res.ok) {
          console.warn('[page] Falha ao carregar setlist:', res.status)
          return
        }

        const data = await res.json()
        if (cancelled) return

        if (data.setlist && data.setlist.length > 0) {
          setSetlist(data)
        } else {
          setSetlist(null)
        }
      } catch (err) {
        if (!cancelled) console.error('[page] Erro ao carregar setlist:', err)
      }
    }

    loadSetlistForFolder()

    return () => {
      cancelled = true
    }
  }, [status, selectedFolderId])

  const filteredTracks = tracks
  const tracksWithoutFolder = 0
  const canGenerateSetlist = selectedFolderId === 'all' || isRealFolder(selectedFolderId)
  const folderName = canGenerateSetlist
    ? folders.find(f => f.id === selectedFolderId)?.name ?? 'pasta'
    : null

  const addTrack = (track: Track, durationSec?: number, fileHash?: string | null) => {
    const folderId = (selectedFolderId === 'all' || selectedFolderId === null)
      ? null
      : selectedFolderId

    const trackWithFolder: Track = { ...track, folderId }

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
        firstBeatSec: track.firstBeatSec ?? 0,
        fileHash: fileHash ?? null,
      }),
    })
      .then(res => {
        if (!res.ok) console.warn('[page] Falha ao salvar faixa:', res.status)
      })
      .catch(err => console.warn('[page] Erro ao salvar faixa:', err))

    if (folderId) {
      setFolders(prev => prev.map(f =>
        f.id === folderId ? { ...f, trackCount: f.trackCount + 1 } : f
      ))
    }
  }

  const removeTrack = (id: string) => {
    const track = tracks.find(t => t.id === id)

    setTracks(prev => prev.filter(t => t.id !== id))
    setAnalyses(prev => { const next = { ...prev }; delete next[id]; return next })
    setDurations(prev => { const next = { ...prev }; delete next[id]; return next })

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

  const moveTrackToFolder = (trackId: string, folderId: string | null) => {
    const track = tracks.find(t => t.id === trackId)
    if (!track) return
    if (track.folderId === folderId) return

    const oldFolderId = track.folderId

    setTracks(prev => prev.map(t =>
      t.id === trackId ? { ...t, folderId } : t
    ))

    setFolders(prev => prev.map(f => {
      if (f.id === oldFolderId) return { ...f, trackCount: Math.max(0, f.trackCount - 1) }
      if (f.id === folderId) return { ...f, trackCount: f.trackCount + 1 }
      return f
    }))

    fetch('/api/tracks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: trackId, folderId }),
    })
      .then(res => {
        if (!res.ok) console.warn('[page] Falha ao mover faixa:', res.status)
      })
      .catch(err => console.warn('[page] Erro ao mover faixa:', err))
  }

  const clearLibrary = () => {
    const count = filteredTracks.length
    const scope = selectedFolderId === 'all' ? 'biblioteca inteira' : 'esta pasta'

    const confirmed = window.confirm(
      `Tem certeza que quer apagar ${count} faixa${count !== 1 ? 's' : ''} da ${scope}?\n\n` +
      `Essa ação é IRREVERSÍVEL.`
    )

    if (!confirmed) return

    const ids = filteredTracks.map(t => t.id)
    setTracks(prev => prev.filter(t => !ids.includes(t.id)))
    setAnalyses(prev => { const next = { ...prev }; ids.forEach(id => delete next[id]); return next })
    setDurations(prev => { const next = { ...prev }; ids.forEach(id => delete next[id]); return next })
    setSetlist(null)

    ids.forEach(id => {
      fetch(`/api/tracks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        .catch(err => console.warn('[page] Erro ao deletar faixa:', err))
    })

    if (selectedFolderId && selectedFolderId !== 'all' && selectedFolderId !== null) {
      setFolders(prev => prev.map(f =>
        f.id === selectedFolderId ? { ...f, trackCount: 0 } : f
      ))
    }
  }

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
  }

  const deleteFolder = async (folderId: string) => {
    const res = await fetch(`/api/folders?id=${encodeURIComponent(folderId)}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Erro ao deletar pasta')
    }

    setFolders(prev => prev.filter(f => f.id !== folderId))
    setTracks(prev => prev.map(t => t.folderId === folderId ? { ...t, folderId: null } : t))

    if (selectedFolderId === folderId) setSelectedFolderId('all')
  }

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
  }

  const handleAddAnalysis = (
    trackId: string,
    analysis: AudioAnalysis & { key?: string; bpm?: number },
    durationSec: number
  ) => {
    setAnalyses(prev => ({ ...prev, [trackId]: analysis }))
    setDurations(prev => ({ ...prev, [trackId]: durationSec }))

    if (setlist) {
      const uploaded = tracks.find(t => t.id === trackId)
      if (uploaded) {
        const match = setlist.setlist.find(st =>
          normalizeTitle(st.title) === normalizeTitle(uploaded.title) &&
          Math.abs((st.bpm || 0) - (uploaded.bpm || 0)) <= 2
        )
        if (match && match.id !== trackId) {
          setAnalyses(prev => ({ ...prev, [match.id]: analysis }))
          setDurations(prev => ({ ...prev, [match.id]: durationSec }))
        }
      }
    }

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
    }).catch(err => console.warn('[page] Erro ao salvar análise:', err))
  }

  const clearAnalysis = (trackId: string) => {
    setAnalyses(prev => {
      const next = { ...prev }
      delete next[trackId]
      return next
    })

    fetch('/api/tracks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: trackId,
        key: '',
        bpm: 0,
        segments: null,
      }),
    }).catch(err => console.warn('[page] Erro ao apagar análise:', err))
  }

  const handleSmartGenerate = async (filters: SmartSetlistFilters) => {
    setSmartLoading(true)
    setSetlist(null)
    setLastFilters(filters)
    
    if (filters.energyTrend) {
      setLastEnergyTrend(filters.energyTrend)
    }
    
    try {
      const res = await fetch('/api/generate-smart-setlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bpmTarget: filters.bpmTarget,
          bpmRange: filters.bpmRange,
          camelotStrict: filters.camelotStrict,
          setSize: filters.setSize,
          onlyAnalyzed: true,
          folderId: 'all',
          energyTrend: filters.energyTrend,
          energyBlocks: filters.energyBlocks,
          variety: (filters as any).variety,
        }),
      })

      if (res.status === 401) { alert('Você precisa fazer login.'); window.location.href = '/login'; return }
      if (res.status === 422) { const data = await res.json(); alert(`⚠️ ${data.error}\n\n${data.details}\n\n💡 ${data.suggestion}`); setSmartModalOpen(false); setSmartLoading(false); return }
      
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erro ao gerar setlist inteligente'); return }

      // 🆕 Injeção de Dados Definitiva
            // 🆕 MÁGICA DEFINITIVA
            // 🆕 MÁGICA DEFINITIVA (EXTREMAMENTE TOLERANTE)
      const tracksComDados = data.tracks.map((t: any) => {
  // 1. Tenta achar pelo ID exato
  let original = tracks.find(orig => orig.id === t.id);
  
  // 2. Se não achar, tenta pelo Título
  if (!original) {
    const cleanTitle = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const apiTitle = cleanTitle(t.title);
    
    original = tracks.find(orig => {
      const libTitle = cleanTitle(orig.title);
      return libTitle.includes(apiTitle) || apiTitle.includes(libTitle);
    });
  }
  
  // 🆕 CORREÇÃO: Usa os segments que vêm da API, não só do estado local
  const analysisFromApi = t.segments ? { bpm: t.bpm, segments: t.segments } : null;
  const analysisFromState = original ? analyses[original.id] : null;
  
  return {
    ...t,
    id: original ? original.id : t.id,
    bpm: original ? original.bpm : t.bpm,
    _analysis: analysisFromState || analysisFromApi, // 🆕 Prioriza estado local, mas usa da API se não tiver
    _duration: original ? durations[original.id] || t.durationSec : t.durationSec,
  }
})
      const adapted = {
        id: data.id,
        setlist: tracksComDados.map((t: any, i: number) => ({
          ...t,
          position: i + 1,
          transitionNote: `score médio TSP: ${data.averageScore}/100`,
        })),
        analysis: `Setlist gerado por TSP. ${data.tracks.length} faixas. Score médio ${data.averageScore}/100.`,
        djTip: 'Setlist otimizado.',
        peakMoment: 'Análise disponível.',
        totalDuration: `${data.tracks.length}`,
        filters: data.filters,
      } as GeneratedSetlist

      setSetlist(adapted)
      setSmartModalOpen(false)
    } catch (error) {
      console.error('[page] Erro no generate-smart:', error)
      alert(`Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    } finally {
      setSmartLoading(false)
    }
  }

  const handleOpenSetlist = async (setlistId: string) => {
    try {
      const res = await fetch(`/api/setlist?id=${encodeURIComponent(setlistId)}`)
      if (!res.ok) {
        alert('Erro ao abrir setlist')
        return
      }
      const data = await res.json()
      if (!data.id) {
        alert('Setlist não encontrado')
        return
      }
      setSetlist(data)
      setActiveTab('library')
    } catch (err) {
      console.error('[page] Erro ao abrir setlist:', err)
    }
  }

  const refreshSetlist = async () => {
    if (!isRealFolder(selectedFolderId) && selectedFolderId !== 'all') return
    try {
      const res = await fetch(`/api/setlist?folderId=${encodeURIComponent(selectedFolderId || 'all')}`)
      if (res.ok) {
        const data = await res.json()
        setSetlist(data.setlist?.length > 0 ? data : null)
      }
    } catch (err) {
      console.error('Erro ao atualizar setlist:', err)
    }
  }

  const generate = async () => {
    if (!canGenerateSetlist) {
      alert('Selecione uma pasta específica para montar o setlist.')
      return
    }

    if (filteredTracks.length < 3) {
      alert(`A pasta "${folderName}" precisa de pelo menos 3 faixas pra montar o setlist.`)
      return
    }

    setLoading(true)
    setSetlist(null)
    try {
      const optimalOrder = computeOptimalOrder(filteredTracks)
      const res = await fetch('/api/generate-setlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: optimalOrder, config: DEFAULT_CONFIG }),
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
      alert(`Erro ao gerar set list: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    } finally {
      setLoading(false)
    }
  }

  const libraryBadge = (() => {
    const base = `${filteredTracks.length} faixa${filteredTracks.length !== 1 ? 's' : ''}`
    if (queueStats && (queueStats.processing > 0 || queueStats.pending > 0)) {
      return `${base} · ⟳ ${queueStats.done}/${queueStats.total}`
    }
    return base
  })()

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
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
          <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>gerador de set list</p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginLeft: 24 }}>
          <button
            onClick={() => setActiveTab('library')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: activeTab === 'library' ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: activeTab === 'library' ? 'rgba(124, 92, 252, 0.15)' : 'transparent',
              color: activeTab === 'library' ? 'var(--accent)' : 'var(--muted)',
              fontSize: 12,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
            }}
          >
            biblioteca
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: activeTab === 'history' ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: activeTab === 'history' ? 'rgba(124, 92, 252, 0.15)' : 'transparent',
              color: activeTab === 'history' ? 'var(--accent)' : 'var(--muted)',
              fontSize: 12,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
            }}
          >
            meus sets
          </button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {status === 'authenticated' ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>● logado</span>
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
              >sair</button>
            </>
          ) : (
            <a href="/login" style={{
              background: 'linear-gradient(135deg, #7c5cfc, #c45cfc)',
              border: 'none', borderRadius: 8, color: '#fff', padding: '8px 18px',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none',
            }}>entrar</a>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <aside style={{ width: 220, flexShrink: 0, position: 'sticky', top: 20, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto', padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <FolderList
            folders={folders}
            selectedFolderId={selectedFolderId}
            totalTracks={tracks.length}
            tracksWithoutFolder={tracksWithoutFolder}
            onSelect={setSelectedFolderId}
            onCreate={createFolder}
            onDelete={deleteFolder}
            onRename={renameFolder}
            onDropTrack={moveTrackToFolder}
            draggingTrackId={draggingTrackId}
          />
        </aside>

        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {activeTab === 'history' ? (
            <Panel title="meus sets">
              <SetlistHistory onOpen={handleOpenSetlist} />
            </Panel>
          ) : (
            <>
              {activeTab === 'library' && (
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
                        onClick={() => setSmartModalOpen(true)}
                        disabled={loading}
                        style={{
                          ...btnStyle('secondary'),
                          flex: 1,
                          justifyContent: 'center',
                          cursor: loading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        gerar SetForge
                      </button>
                    </div>
                  )}
                </Panel>
              )}

              {canGenerateSetlist && (loading || setlist) && (
                <Panel title="set list gerado" badge={setlist ? '● gerado' : undefined}>
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
                      energyTrend={lastEnergyTrend}
                      bpmTarget={lastFilters?.bpmTarget}
                      bpmRange={lastFilters?.bpmRange}
                      filters={lastFilters}
                      onUpdate={refreshSetlist}
                      analyses={analyses}
                      durations={durations}
                      allTracks={tracks}
                      allFolders={folders}
                    />
                  )}
                </Panel>
              )}

              {filteredTracks.length > 0 && (
                <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                  <TrackList
                    tracks={filteredTracks}
                    folders={folders}
                    analyses={analyses}
                    onRemove={removeTrack}
                    onMoveToFolder={moveTrackToFolder}
                    onDragStart={setDraggingTrackId}
                    onDragEnd={() => setDraggingTrackId(null)}
                    onClearAnalysis={clearAnalysis}
                    showAnalysis={selectedFolderId !== 'all'}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <SmartSetlistModal
        open={smartModalOpen}
        defaultSetSize={30}
        onClose={() => setSmartModalOpen(false)}
        onGenerate={handleSmartGenerate}
        loading={smartLoading}
      />
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