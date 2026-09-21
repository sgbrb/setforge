'use client'
import { useState, useCallback, useRef } from 'react'
import { Track } from '@/lib/types'

interface Props {
  onAddTrack: (track: Track) => void
}

// Fontes ativas no SetForge.
// - YouTube: única fonte funcional no momento (API key configurada).
// - Spotify: pendente (requer conta Premium para criar app no Developer Dashboard).
// - Beatport: pendente (Ator da Apify bloqueado pelo Cloudflare do Beatport).
// - SoundCloud: descartado (API exige Artist Pro e proíbe "DJ apps" nos Termos).
const AVAILABLE_SOURCES = ['youtube'] as const
type SourceKey = typeof AVAILABLE_SOURCES[number]

export default function TrackSearch({ onAddTrack }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<Record<SourceKey, boolean>>({
    youtube: true,
  })
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }

    const activeSources = (Object.entries(sources) as [SourceKey, boolean][])
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(',')

    if (!activeSources) { setResults([]); return }

    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&sources=${activeSources}`)
      const data = await res.json()
      setResults(data.tracks ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [sources])

  const handleInput = (value: string) => {
    setQuery(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 400)
  }

  const sourceColor = (src?: string) => {
    if (src === 'spotify') return '#1DB954'
    if (src === 'youtube') return '#FF0000'
    if (src === 'beatport') return '#00FF7F'
    if (src === 'soundcloud') return '#FF5500'
    return 'var(--muted)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Source toggles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {AVAILABLE_SOURCES.map(src => (
          <button
            key={src}
            onClick={() => setSources(s => ({ ...s, [src]: !s[src] }))}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: `1px solid ${sources[src] ? sourceColor(src) : 'var(--border)'}`,
              background: sources[src] ? `${sourceColor(src)}22` : 'transparent',
              color: sources[src] ? sourceColor(src) : 'var(--muted)',
              fontSize: 12,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {src.charAt(0).toUpperCase() + src.slice(1)}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          placeholder="Buscar músicas por título ou artista..."
          style={{
            width: '100%',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: 14,
            padding: '10px 14px 10px 38px',
            outline: 'none',
          }}
        />
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 16 }}>
          {loading ? '⟳' : '🔍'}
        </span>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map(track => (
            <div
              key={track.id}
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: track.artworkUrl ? '40px 1fr auto' : '1fr auto',
                gap: 12,
                alignItems: 'center',
              }}
            >
              {track.artworkUrl && (
                <img
                  src={track.artworkUrl}
                  alt=""
                  style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }}
                />
              )}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{track.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {track.artist}
                  {track.bpm > 0 && ` · ${track.bpm} BPM`}
                  {track.key && ` · ${track.key}`}
                  <span style={{ marginLeft: 6, color: sourceColor(track.source), fontSize: 11 }}>
                    {track.source}
                  </span>
                </div>
              </div>
              <button
                onClick={() => { onAddTrack(track); setResults([]); setQuery('') }}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 13,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                + Add
              </button>
            </div>
          ))}
        </div>
      )}

      {query.length >= 2 && !loading && results.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>
          Nenhuma faixa encontrada. Tente outros termos.
        </p>
      )}
    </div>
  )
}