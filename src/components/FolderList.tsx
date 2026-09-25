'use client'

import { useState } from 'react'
import { Folder } from '@/lib/types'

interface FolderListProps {
  folders: Folder[]
  selectedFolderId: string | null | 'all'
  totalTracks: number
  tracksWithoutFolder: number
  onSelect: (folderId: string | null | 'all') => void
  onCreate: (name: string) => Promise<void>
  onDelete: (folderId: string) => Promise<void>
  onRename: (folderId: string, newName: string) => Promise<void>
  onDropTrack?: (trackId: string, folderId: string | null) => void
  draggingTrackId?: string | null
}

export default function FolderList({
  folders,
  selectedFolderId,
  totalTracks,
  tracksWithoutFolder,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onDropTrack,
  draggingTrackId,
}: FolderListProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleCreate = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return

    setIsSaving(true)
    try {
      await onCreate(trimmed)
      setNewName('')
      setIsCreating(false)
    } catch (err) {
      console.error('[FolderList] Erro ao criar pasta:', err)
      alert('Erro ao criar pasta')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') {
      setIsCreating(false)
      setNewName('')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono, monospace)',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          minhas pastas
        </p>
        <button
          onClick={() => setIsCreating(true)}
          title="Criar nova pasta"
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--muted)',
            width: 24,
            height: 24,
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {isCreating && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleCreateKeyDown}
            placeholder="nome da pasta..."
            disabled={isSaving}
            style={{
              flex: 1,
              background: 'var(--surface2)',
              border: '1px solid var(--accent)',
              borderRadius: 6,
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 13,
              padding: '6px 10px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleCreate}
            disabled={isSaving || !newName.trim()}
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
              opacity: isSaving || !newName.trim() ? 0.5 : 1,
            }}
          >
            ✓
          </button>
        </div>
      )}

      <FolderRow
        icon="▦"
        name="todas as faixas"
        count={totalTracks}
        isSelected={selectedFolderId === 'all'}
        onClick={() => onSelect('all')}
      />

      {/* "Sem pasta" — aceita drop também */}
      {(tracksWithoutFolder > 0 || draggingTrackId) && (
        <FolderRow
          icon="◌"
          name="sem pasta"
          count={tracksWithoutFolder}
          isSelected={selectedFolderId === null}
          onClick={() => onSelect(null)}
          onDropTrack={onDropTrack}
          dropFolderId={null}
          draggingTrackId={draggingTrackId}
        />
      )}

      {folders.length === 0 && !isCreating && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono, monospace)',
            fontStyle: 'italic',
            padding: '8px 4px',
          }}
        >
          nenhuma pasta ainda
        </p>
      )}

      {folders.map(folder => (
        <FolderRow
          key={folder.id}
          icon="📁"
          name={folder.name}
          count={folder.trackCount}
          isSelected={selectedFolderId === folder.id}
          isEditing={editingFolderId === folder.id}
          editingName={editingName}
          onClick={() => onSelect(folder.id)}
          onStartEdit={() => {
            setEditingFolderId(folder.id)
            setEditingName(folder.name)
          }}
          onEditChange={setEditingName}
          onEditSave={async () => {
            const trimmed = editingName.trim()
            if (!trimmed) {
              setEditingFolderId(null)
              setEditingName('')
              return
            }
            if (trimmed !== folder.name) {
              try {
                await onRename(folder.id, trimmed)
              } catch (err) {
                console.error('[FolderList] Erro ao renomear:', err)
                alert('Erro ao renomear pasta')
              }
            }
            setEditingFolderId(null)
            setEditingName('')
          }}
          onEditCancel={() => {
            setEditingFolderId(null)
            setEditingName('')
          }}
          onDelete={() => {
            if (confirm(`Deletar a pasta "${folder.name}"? As faixas dela ficarão "sem pasta".`)) {
              onDelete(folder.id)
            }
          }}
          onDropTrack={onDropTrack}
          dropFolderId={folder.id}
          draggingTrackId={draggingTrackId}
        />
      ))}
    </div>
  )
}

function FolderRow({
  icon,
  name,
  count,
  isSelected,
  isEditing = false,
  editingName = '',
  onClick,
  onStartEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  onDropTrack,
  dropFolderId,
  draggingTrackId,
}: {
  icon: string
  name: string
  count: number
  isSelected: boolean
  isEditing?: boolean
  editingName?: string
  onClick: () => void
  onStartEdit?: () => void
  onEditChange?: (v: string) => void
  onEditSave?: () => void
  onEditCancel?: () => void
  onDelete?: () => void
  onDropTrack?: (trackId: string, folderId: string | null) => void
  dropFolderId?: string | null
  draggingTrackId?: string | null
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') onEditSave?.()
    if (e.key === 'Escape') onEditCancel?.()
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!onDropTrack || !draggingTrackId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = () => setIsDragOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const trackId = e.dataTransfer.getData('text/plain') || draggingTrackId
    if (trackId && onDropTrack) {
      onDropTrack(trackId, dropFolderId ?? null)
    }
  }

  if (isEditing) {
    return (
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          background: 'var(--surface2)',
          border: '1px solid var(--accent)',
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1, opacity: 0.8 }}>{icon}</span>
        <input
          type="text"
          autoFocus
          value={editingName}
          onChange={e => onEditChange?.(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => onEditSave?.()}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: 13,
            padding: 0,
            minWidth: 0,
          }}
        />
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      onDoubleClick={onStartEdit ? (e) => { e.stopPropagation(); onStartEdit() } : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      title={onStartEdit ? 'Clique duas vezes para renomear' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
minHeight: 44,
        background: isDragOver
          ? 'rgba(124, 92, 252, 0.25)'
          : isSelected
          ? 'rgba(124, 92, 252, 0.15)'
          : 'transparent',
        border: `1px solid ${
          isDragOver ? 'var(--accent)' : isSelected ? 'var(--accent)' : 'transparent'
        }`,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'all 0.15s',
        transform: isDragOver ? 'scale(1.02)' : 'scale(1)',
        boxShadow: isDragOver ? '0 0 0 3px rgba(124, 92, 252, 0.15)' : 'none',
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, opacity: 0.8 }}>{icon}</span>
      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: isSelected || isDragOver ? 'var(--text)' : 'var(--muted)',
          fontWeight: isSelected || isDragOver ? 600 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontSize: 11,
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono, monospace)',
          flexShrink: 0,
        }}
      >
        {count}
      </span>
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Deletar pasta"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
            width: 16,
            opacity: 0.5,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}