'use client'
import { useState } from 'react'

export interface SmartSetlistFilters {
  bpmTarget: number | null
  bpmRange: number
  camelotStrict: boolean
  setSize: number
  onlyAnalyzed: boolean
}

interface Props {
  open: boolean
  defaultBpm?: number | null
  defaultSetSize?: number
  onClose: () => void
  onGenerate: (filters: SmartSetlistFilters) => void
  loading?: boolean
}

export default function SmartSetlistModal({
  open,
  defaultBpm = null,
  defaultSetSize = 30,
  onClose,
  onGenerate,
  loading = false,
}: Props) {
  const [bpmTarget, setBpmTarget] = useState<string>(
    defaultBpm !== null ? String(defaultBpm) : ''
  )
  const [bpmRange, setBpmRange] = useState<string>('10')
  const [camelotStrict, setCamelotStrict] = useState<boolean>(false)
  const onlyAnalyzed = true
  const [setSize, setSetSize] = useState<string>(String(defaultSetSize))

  if (!open) return null

  const handleGenerate = () => {
    const parsedBpmTarget = bpmTarget.trim() === '' ? null : Number(bpmTarget)
    const parsedBpmRange = Number(bpmRange) || 10
    const parsedSetSize = Number(setSize) || 30

    onGenerate({
      bpmTarget:
        parsedBpmTarget !== null && parsedBpmTarget > 0
          ? parsedBpmTarget
          : null,
      bpmRange: parsedBpmRange > 0 ? parsedBpmRange : 10,
      camelotStrict,
      setSize: Math.max(1, Math.min(parsedSetSize, 200)),
      onlyAnalyzed: true,
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 28,
          maxWidth: 480,
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          ⚡ gerar setlist inteligente
        </h2>
        <p
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono, monospace)',
            marginBottom: 24,
          }}
        >
          TSP (nearest neighbor + 2-opt + or-opt) escolhe as melhores faixas
        </p>

        {/* BPM alvo */}
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono, monospace)',
              display: 'block',
              marginBottom: 6,
            }}
          >
            BPM alvo (vazio = sem filtro)
          </span>
          <input
            type="number"
            value={bpmTarget}
            onChange={(e) => setBpmTarget(e.target.value)}
            placeholder="ex: 124"
            style={{
              width: '100%',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 12px',
              color: 'var(--fg)',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          />
        </label>

        {/* BPM range */}
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono, monospace)',
              display: 'block',
              marginBottom: 6,
            }}
          >
            Range do BPM (± variação aceita)
          </span>
          <input
            type="number"
            value={bpmRange}
            onChange={(e) => setBpmRange(e.target.value)}
            placeholder="10"
            style={{
              width: '100%',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 12px',
              color: 'var(--fg)',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          />
        </label>

        {/* Tamanho do set */}
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono, monospace)',
              display: 'block',
              marginBottom: 6,
            }}
          >
            Tamanho do set (quantas faixas)
          </span>
          <input
            type="number"
            value={setSize}
            onChange={(e) => setSetSize(e.target.value)}
            placeholder="30"
            style={{
              width: '100%',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 12px',
              color: 'var(--fg)',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          />
        </label>

        

        {/* Botões */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: '12px 20px',
              borderRadius: 10,
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              flex: 1,
              padding: '12px 20px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #7c5cfc, #c45cfc)',
              border: 'none',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '⟳ gerando...' : '⚡ gerar'}
          </button>
        </div>
      </div>
    </div>
  )
}