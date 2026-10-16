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
    } catch (err) {
      alert('Erro ao deletar setlist')
    } finally {
      setDeletingId(null)
    }
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
      {setlists.map(s => (
        <div
          key={s.id}
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.name}
            </p>
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