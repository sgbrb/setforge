'use client'

import { useState, useEffect, useCallback } from 'react'

interface SetlistSummary {
  id: string
  name: string
  createdAt: string
  analysis: string | null
  totalDuration: string | null
  trackCount: number
}

interface SetlistHistoryProps {
  onOpen: (setlistId: string) => void
}

export default function SetlistHistory({ onOpen }: SetlistHistoryProps) {
  const [setlists, setSetlists] = useState<SetlistSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  
  // 🆕 Estados para as novas funções
  const [selected, setSelected] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const loadInitial = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/setlists')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSetlists(data.setlists ?? [])
      setHasMore(data.hasMore ?? false)
      setNextCursor(data.nextCursor ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/setlists?cursor=${encodeURIComponent(nextCursor)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSetlists(prev => [...prev, ...(data.setlists ?? [])])
      setHasMore(data.hasMore ?? false)
      setNextCursor(data.nextCursor ?? null)
    } catch (err) {
      console.error('[SetlistHistory] Erro ao carregar mais:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Apagar este setlist? Não tem volta.')) return

    setDeletingId(id)
    try {
      const res = await fetch(`/api/setlists/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSetlists(prev => prev.filter(s => s.id !== id))
      setSelected(prev => prev.filter(sid => sid !== id))
    } catch (err) {
      alert('Erro ao deletar setlist')
    } finally {
      setDeletingId(null)
    }
  }

  // 🆕 Deletar selecionados
  const handleDeleteSelected = async () => {
    if (selected.length === 0) return
    if (!confirm(`Apagar ${selected.length} set(s)? Não tem volta.`)) return
    
    try {
      await Promise.all(selected.map(id => fetch(`/api/setlists/${id}`, { method: 'DELETE' })))
      setSetlists(prev => prev.filter(s => !selected.includes(s.id)))
      setSelected([])
    } catch (err) {
      alert('Erro ao apagar setlists')
    }
  }

  // 🆕 Renomear
  const handleRename = async (id: string) => {
    const trimmed = editingName.trim()
    if (!trimmed) { setEditingId(null); return }
    
    try {
      const res = await fetch(`/api/setlists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error('Erro')
      
      setSetlists(prev => prev.map(s => s.id === id ? { ...s, name: trimmed } : s))
      setEditingId(null)
    } catch (err) {
      alert('Erro ao renomear setlist')
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  if (loading) {
    return (
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: 13, textAlign: 'center', padding: 24 }}>
        ⟳ carregando seus sets...
      </p>
    )
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <p style={{ color: 'var(--red)', marginBottom: 12 }}>Erro: {error}</p>
        <button onClick={loadInitial} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer' }}>
          tentar de novo
        </button>
      </div>
    )
  }

  if (setlists.length === 0) {
    return (
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: 13, textAlign: 'center', padding: 24 }}>
        Nenhum set salvo ainda. Gere um via ⚡ gerar inteligente.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      
      {/* 🆕 Botão de apagar selecionados */}
      {selected.length > 0 && (
        <button
          onClick={handleDeleteSelected}
          style={{
            alignSelf: 'flex-start', padding: '8px 16px',
            background: 'var(--red)', color: '#fff', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            marginBottom: 8
          }}
        >
          🗑 apagar {selected.length} selecionado(s)
        </button>
      )}

      {setlists.map(s => (
        <div
          key={s.id}
          style={{
            background: 'var(--surface2)',
            border: `1px solid ${selected.includes(s.id) ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 10,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {/* 🆕 Checkbox */}
          <input
            type="checkbox"
            checked={selected.includes(s.id)}
            onChange={() => toggleSelect(s.id)}
            style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* 🆕 Input para renomear */}
            {editingId === s.id ? (
              <input
                type="text"
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onBlur={() => handleRename(s.id)}
                onKeyDown={e => e.key === 'Enter' && handleRename(s.id)}
                autoFocus
                style={{
                  width: '100%', background: 'var(--surface)',
                  border: '1px solid var(--accent)', borderRadius: 6,
                  color: 'var(--text)', padding: '4px 8px', fontSize: 14,
                  fontWeight: 600, marginBottom: 4
                }}
              />
            ) : (
              <p 
                style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                onDoubleClick={() => { setEditingId(s.id); setEditingName(s.name) }}
                title="Clique duplo para renomear"
              >
                {s.name}
              </p>
            )}
            <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
              {new Date(s.createdAt).toLocaleString('pt-BR')} · {s.trackCount} faixa{s.trackCount !== 1 ? 's' : ''}
            </p>
            {s.analysis && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.analysis}
              </p>
            )}
          </div>
          <button
            onClick={() => onOpen(s.id)}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #7c5cfc, #c45cfc)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            abrir
          </button>
          <button
            onClick={(e) => handleDelete(s.id, e)}
            disabled={deletingId === s.id}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: deletingId === s.id ? 'var(--muted)' : 'var(--red)',
              fontSize: 12,
              cursor: deletingId === s.id ? 'not-allowed' : 'pointer',
              flexShrink: 0
            }}
            title="apagar setlist"
          >
            {deletingId === s.id ? '⟳' : '✕'}
          </button>
        </div>
      ))}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          style={{
            marginTop: 8,
            padding: '10px 20px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface2)',
            color: 'var(--text)',
            fontSize: 13,
            fontFamily: 'var(--font-mono, monospace)',
            cursor: loadingMore ? 'not-allowed' : 'pointer',
          }}
        >
          {loadingMore ? '⟳ carregando...' : 'carregar mais 20'}
        </button>
      )}
    </div>
  )
}