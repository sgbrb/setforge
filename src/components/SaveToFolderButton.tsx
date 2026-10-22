'use client'

import { useState, useEffect } from 'react'

interface Folder {
  id: string
  name: string
  isVirtual: boolean
}

interface SaveToFolderButtonProps {
  setlistId: string | undefined
  trackIds: string[]
  onSaved?: (folderId: string, folderName: string) => void
}

export default function SaveToFolderButton({
  setlistId,
  trackIds,
  onSaved,
}: SaveToFolderButtonProps) {
  const [open, setOpen] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Carrega pastas virtuais quando abre
  useEffect(() => {
    if (!open) return

    setLoading(true)
    setError(null)

    fetch('/api/folders')
      .then(r => r.json())
      .then(data => {
        const virtualFolders = (data.folders ?? []).filter((f: any) => f.isVirtual)
        setFolders(virtualFolders)
      })
      .catch(err => {
        console.error('[SaveToFolder] Erro ao carregar pastas:', err)
        setError('Erro ao carregar pastas')
      })
      .finally(() => setLoading(false))
  }, [open])

  const handleSave = async (folderId: string, folderName: string) => {
    if (!setlistId) {
      setError('Setlist sem ID')
      return
    }

    setSaving(true)
    setError(null)

    try {
      // 1. Adiciona as faixas na pasta virtual
      const addRes = await fetch(`/api/folders/${folderId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds }),
      })

      if (!addRes.ok) {
        const err = await addRes.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao adicionar faixas')
      }

      // 2. Vincula o setlist à pasta
      const patchRes = await fetch(`/api/setlists/${setlistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          folderId,
          name: folderName
        }),
      })

      if (!patchRes.ok) {
        throw new Error('Erro ao vincular setlist à pasta')
      }

      setSuccess(`${trackIds.length} faixas salvas em "${folderName}"`)
      setOpen(false)
      setNewFolderName('')
      onSaved?.(folderId, folderName)

      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateAndSave = async () => {
    if (!newFolderName.trim()) {
      setError('Digite um nome')
      return
    }

    setSaving(true)
    setError(null)

    try {
      // 1. Cria a pasta virtual
      const createRes = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          isVirtual: true,
        }),
      })

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao criar pasta')
      }

      const { folder } = await createRes.json()
      await handleSave(folder.id, folder.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setSaving(false)
    }
  }

  return (
  <div style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setOpen(!open)}
        disabled={!setlistId}
        style={{
  width: '100%',
  padding: '12px 20px',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  cursor: setlistId ? 'pointer' : 'not-allowed',
  opacity: setlistId ? 1 : 0.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
}}
      >
        📁 salvar em pasta
      </button>

      {success && (
        <div style={{
          marginTop: 8,
          padding: '8px 12px',
          background: 'rgba(76, 252, 154, 0.1)',
          border: '1px solid rgba(76, 252, 154, 0.3)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--green)',
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          ✅ {success}
        </div>
      )}

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          minWidth: 320,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 12,
          zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 8, textTransform: 'uppercase' }}>
            salvar {trackIds.length} faixas em:
          </p>

          {loading && <p style={{ fontSize: 12, color: 'var(--muted)' }}>⟳ carregando pastas...</p>}

          {!loading && folders.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => handleSave(f.id, f.name)}
                  disabled={saving}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                  }}
                >
                  📁 {f.name}
                </button>
              ))}
            </div>
          )}

          {!loading && folders.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, fontStyle: 'italic' }}>
              Nenhuma pasta virtual ainda. Crie uma abaixo:
            </p>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="nome da pasta nova..."
              disabled={saving}
              style={{
                flex: 1,
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: 12,
                padding: '6px 10px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleCreateAndSave}
              disabled={saving || !newFolderName.trim()}
              style={{
                padding: '6px 12px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '⟳' : '+ criar'}
            </button>
          </div>

          {error && (
            <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>
              ⚠️ {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}