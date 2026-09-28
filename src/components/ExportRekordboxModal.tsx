'use client'

import { useState, useEffect } from 'react'
import { GeneratedSetlist } from '@/lib/types'
import { Transition } from '@/lib/mix-timeline'
import { generateRekordboxXML } from '@/lib/rekordbox-export'

interface ExportRekordboxModalProps {
  setlist: GeneratedSetlist
  transitions: Transition[]
  onClose: () => void
}

interface FolderEntry {
  name: string
  path: string
}

export default function ExportRekordboxModal({
  setlist,
  transitions,
  onClose,
}: ExportRekordboxModalProps) {
  const [folders, setFolders] = useState<FolderEntry[]>([])
  const [basePath, setBasePath] = useState('')
  const [selectedFolder, setSelectedFolder] = useState('')
  const [customFolder, setCustomFolder] = useState('')
  const [loadingFolders, setLoadingFolders] = useState(true)
  const [error, setError] = useState('')

  // Carrega as subpastas
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/list-subfolders')
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erro ao listar pastas')
        }
        const data = await res.json()
        setBasePath(data.basePath || '')
        setFolders(data.folders || [])
        if (data.folders?.length > 0) {
          setSelectedFolder(data.folders[0].name)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setLoadingFolders(false)
      }
    }
    load()
  }, [])

  // Pasta final (a escolhida ou a customizada)
  const finalFolder = customFolder.trim() || selectedFolder

  // Gera e baixa o XML
  const handleExport = () => {
    if (!finalFolder) {
      setError('Selecione ou digite uma subpasta')
      return
    }

    try {
      const xml = generateRekordboxXML(
        setlist,
        transitions,
        basePath,
        finalFolder
      )

      // Cria o blob e baixa
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rekordbox-${finalFolder}.xml`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Fecha o modal
      setTimeout(() => onClose(), 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar XML')
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 24,
          maxWidth: 520,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>
            📥 exportar pro Rekordbox
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              fontSize: 20,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {/* Pasta base */}
        <div>
          <label style={{
            fontSize: 11,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono, monospace)',
            textTransform: 'uppercase',
            letterSpacing: 1,
            display: 'block',
            marginBottom: 6,
          }}>
            pasta base
          </label>
          <p style={{
            fontSize: 12,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--text)',
            padding: '8px 12px',
            background: 'var(--surface2)',
            borderRadius: 6,
            wordBreak: 'break-all',
          }}>
            {basePath || 'carregando...'}
          </p>
        </div>

        {/* Subpasta */}
        <div>
          <label style={{
            fontSize: 11,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono, monospace)',
            textTransform: 'uppercase',
            letterSpacing: 1,
            display: 'block',
            marginBottom: 6,
          }}>
            subpasta (uma por set)
          </label>

          {loadingFolders ? (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>carregando...</p>
          ) : (
            <>
              <select
                value={selectedFolder}
                onChange={e => {
                  setSelectedFolder(e.target.value)
                  setCustomFolder('')
                }}
                disabled={!!customFolder.trim()}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  opacity: customFolder.trim() ? 0.5 : 1,
                }}
              >
                {folders.length === 0 && <option value="">(nenhuma pasta)</option>}
                {folders.map(f => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
              </select>

              <p style={{
                fontSize: 11,
                color: 'var(--muted)',
                textAlign: 'center',
                marginTop: 8,
                marginBottom: 6,
              }}>
                ou digite uma nova:
              </p>

              <input
                type="text"
                value={customFolder}
                onChange={e => setCustomFolder(e.target.value)}
                placeholder="ex: 137"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              />
            </>
          )}
        </div>

        {/* Preview */}
        {finalFolder && (
          <div>
            <label style={{
              fontSize: 11,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono, monospace)',
              textTransform: 'uppercase',
              letterSpacing: 1,
              display: 'block',
              marginBottom: 6,
            }}>
              preview
            </label>
            <p style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--accent)',
              padding: '8px 12px',
              background: 'rgba(124, 92, 252, 0.1)',
              border: '1px solid rgba(124, 92, 252, 0.3)',
              borderRadius: 6,
              wordBreak: 'break-all',
            }}>
              {basePath}\{finalFolder}\{setlist.setlist[0]?.title || 'faixa1'}.mp3
            </p>
          </div>
        )}

        {/* Erro */}
        {error && (
          <p style={{
            fontSize: 12,
            color: 'var(--red)',
            padding: '8px 12px',
            background: 'rgba(252, 92, 92, 0.1)',
            borderRadius: 6,
          }}>
            ⚠️ {error}
          </p>
        )}

        {/* Botão gerar */}
        <button
          onClick={handleExport}
          disabled={!finalFolder || loadingFolders}
          style={{
            padding: '12px 20px',
            background: finalFolder ? 'linear-gradient(135deg, #7c5cfc, #c45cfc)' : 'var(--surface2)',
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: finalFolder ? 'pointer' : 'not-allowed',
            opacity: finalFolder ? 1 : 0.5,
            marginTop: 8,
          }}
        >
          📥 gerar e baixar XML
        </button>

        {/* Instruções */}
        <div style={{
          fontSize: 11,
          color: 'var(--muted)',
          lineHeight: 1.6,
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
        }}>
          <p style={{ marginBottom: 4 }}><strong>depois de baixar:</strong></p>
          <p>1. Abra o Rekordbox</p>
          <p>2. Arquivo → Importar → Importar XML</p>
          <p>3. Selecione o arquivo baixado</p>
          <p>4. Confira a playlist "SetForge {finalFolder || '...'}"</p>
        </div>
      </div>
    </div>
  )
}