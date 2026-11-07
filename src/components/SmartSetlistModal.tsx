'use client'
import { useState } from 'react'

export interface SmartSetlistFilters {
  bpmTarget: number | null
  bpmRange: number
  camelotStrict: boolean
  setSize: number
  onlyAnalyzed: boolean
  energyTrend?: 'steady' | 'build' | 'wave' | 'custom' // 🆕
  energyBlocks?: number[] // Mantido para modo custom
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
  defaultSetSize = 20,
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
  
  // 🆕 Tendência de Energia
  const [energyTrend, setEnergyTrend] = useState<'steady' | 'build' | 'wave' | 'custom'>('steady')
  const [numBlocks, setNumBlocks] = useState<number>(3)
  const [blockEnergies, setBlockEnergies] = useState<number[]>([7, 9, 8])

  if (!open) return null

  const handleGenerate = () => {
    const parsedBpmTarget = bpmTarget.trim() === '' ? null : Number(bpmTarget)
    const parsedBpmRange = Number(bpmRange) || 10
    const parsedSetSize = Number(setSize) || 20

    // 🆕 Se for custom, envia os blocos. Senão, só a tendência
    const finalEnergies = energyTrend === 'custom' 
      ? Array.from({ length: numBlocks }, (_, i) => blockEnergies[i] || 7)
      : undefined

    onGenerate({
      bpmTarget: parsedBpmTarget !== null && parsedBpmTarget > 0 ? parsedBpmTarget : null,
      bpmRange: parsedBpmRange > 0 ? parsedBpmRange : 10,
      camelotStrict,
      setSize: Math.max(1, Math.min(parsedSetSize, 200)),
      onlyAnalyzed: true,
      energyTrend: energyTrend === 'custom' ? undefined : energyTrend, // 🆕
      energyBlocks: finalEnergies, // 🆕
    })
  }

  const updateBlockEnergy = (index: number, value: number) => {
    setBlockEnergies(prev => {
      const next = [...prev]
      next[index] = value
      return next
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
          maxWidth: 520,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
          ⚡ gerar setlist inteligente
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 24 }}>
          TSP + Curva de Energia Elástica (Regra do ±1)
        </p>

        {/* BPM alvo */}
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 6 }}>
            BPM alvo (vazio = sem filtro)
          </span>
          <input
            type="number"
            value={bpmTarget}
            onChange={(e) => setBpmTarget(e.target.value)}
            placeholder="ex: 124"
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 14 }}
          />
        </label>

        {/* BPM range */}
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 6 }}>
            Range do BPM (± variação aceita)
          </span>
          <input
            type="number"
            value={bpmRange}
            onChange={(e) => setBpmRange(e.target.value)}
            placeholder="10"
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 14 }}
          />
        </label>

        {/* Tamanho do set */}
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 6 }}>
            Tamanho do set (quantas faixas)
          </span>
          <input
            type="number"
            value={setSize}
            onChange={(e) => setSetSize(e.target.value)}
            placeholder="20"
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--fg)', fontFamily: 'inherit', fontSize: 14 }}
          />
        </label>

        {/* 🆕 Tendência de Energia */}
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 8 }}>
            Tendência de Energia (Regra do ±1)
          </span>
          
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => setEnergyTrend('steady')}
              style={{
                flex: 1,
                minWidth: 100,
                padding: '10px 8px',
                borderRadius: 8,
                background: energyTrend === 'steady' ? 'var(--accent)' : 'var(--surface2)',
                border: '1px solid var(--border)',
                color: energyTrend === 'steady' ? '#fff' : 'var(--fg)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ➡️ Manter
            </button>
            <button
              onClick={() => setEnergyTrend('build')}
              style={{
                flex: 1,
                minWidth: 100,
                padding: '10px 8px',
                borderRadius: 8,
                background: energyTrend === 'build' ? 'var(--accent)' : 'var(--surface2)',
                border: '1px solid var(--border)',
                color: energyTrend === 'build' ? '#fff' : 'var(--fg)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📈 Subir
            </button>
            <button
              onClick={() => setEnergyTrend('wave')}
              style={{
                flex: 1,
                minWidth: 100,
                padding: '10px 8px',
                borderRadius: 8,
                background: energyTrend === 'wave' ? 'var(--accent)' : 'var(--surface2)',
                border: '1px solid var(--border)',
                color: energyTrend === 'wave' ? '#fff' : 'var(--fg)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🌊 Onda
            </button>
            <button
              onClick={() => setEnergyTrend('custom')}
              style={{
                flex: 1,
                minWidth: 100,
                padding: '10px 8px',
                borderRadius: 8,
                background: energyTrend === 'custom' ? 'var(--accent)' : 'var(--surface2)',
                border: '1px solid var(--border)',
                color: energyTrend === 'custom' ? '#fff' : 'var(--fg)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🎛️ Custom
            </button>
          </div>

          {/* 🆕 Se for Custom, mostra os sliders */}
          {energyTrend === 'custom' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => {
                      setNumBlocks(n)
                      setBlockEnergies(prev => {
                        const next = [...prev]
                        while (next.length < n) next.push(7)
                        return next.slice(0, n)
                      })
                    }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 6,
                      background: numBlocks === n ? 'var(--accent)' : 'var(--surface2)',
                      border: '1px solid var(--border)',
                      color: numBlocks === n ? '#fff' : 'var(--fg)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {n} blocos
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.from({ length: numBlocks }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', width: 60 }}>Bloco {i + 1}</span>
                    <input type="range" min="1" max="10" value={blockEnergies[i] || 7} onChange={(e) => updateBlockEnergy(i, Number(e.target.value))} style={{ flex: 1 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', width: 30, textAlign: 'center' }}>{blockEnergies[i] || 7}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            {energyTrend === 'steady' && 'A energia fica constante (ideal para peak time).'}
            {energyTrend === 'build' && 'A energia sobe gradualmente (ideal para aquecer a pista).'}
            {energyTrend === 'wave' && 'A energia sobe e desce (ideal para sets longos).'}
            {energyTrend === 'custom' && 'Você define a energia de cada bloco manualmente.'}
          </p>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{ flex: 1, padding: '12px 20px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
          >
            cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{ flex: 1, padding: '12px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #7c5cfc, #c45cfc)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? '⟳ gerando...' : '⚡ gerar'}
          </button>
        </div>
      </div>
    </div>
  )
}