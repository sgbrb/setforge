'use client'

import { useState, useRef, useEffect } from 'react'
import MusicTempo from 'music-tempo'
import { Track } from '@/lib/types'
import { findCompatibleTracks } from '@/lib/harmonic-utils'
import { AudioAnalysis } from '@/lib/mix-timeline'

interface TrackUploadProps {
  onAddTrack?: (track: Track) => void
  onAddAnalysis?: (trackId: string, analysis: AudioAnalysis, durationSec: number) => void
  onQueueChange?: (stats: {
    total: number
    done: number
    pending: number
    processing: number
    errors: number
  }) => void
  libraryTracks?: Track[]
}

type FileStatus = 'pending' | 'analyzing-bpm' | 'analyzing-structure' | 'done' | 'error' | 'cancelled'

interface QueueItem {
  id: string
  file: File
  status: FileStatus
  bpm?: number
  trackId?: string
  error?: string
  progress?: number
}

const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 400  // ~20 minutos por faixa

export default function TrackUpload({
  onAddTrack,
  onAddAnalysis,
  onQueueChange,
  libraryTracks = [],
}: TrackUploadProps) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [compatible, setCompatible] = useState<Array<{ track: Track; score: number }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)
  const processingRef = useRef(false)

  useEffect(() => {
    return () => {
      cancelRef.current = true
    }
  }, [])

  useEffect(() => {
    if (processingRef.current) return
    const next = queue.find(q => q.status === 'pending')
    if (!next) return

    processingRef.current = true
    cancelRef.current = false
    processItem(next).finally(() => {
      processingRef.current = false
      setQueue(prev => [...prev])
    })
  }, [queue])

  const processItem = async (item: QueueItem) => {
    // 1. BPM local (client-side, music-tempo)
    setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'analyzing-bpm' } : q))

    let detectedBpm: number | null = null
    let durationSec = 0
    let bpmLocalFailed = false

    try {
      const arrayBuffer = await item.file.arrayBuffer()
      const audioContext = new AudioContext({ sampleRate: 44100 })
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      durationSec = audioBuffer.duration

      let audioData: Float32Array
      if (audioBuffer.numberOfChannels === 2) {
        const ch1 = audioBuffer.getChannelData(0)
        const ch2 = audioBuffer.getChannelData(1)
        audioData = new Float32Array(ch1.length)
        for (let i = 0; i < ch1.length; i++) {
          audioData[i] = (ch1[i] + ch2[i]) / 2
        }
      } else {
        audioData = audioBuffer.getChannelData(0)
      }

      const mt = new MusicTempo(audioData, {
        minBeatInterval: 60 / 160,
        maxBeatInterval: 60 / 90,
      })
      detectedBpm = Math.round(mt.tempo)
      await audioContext.close()
    } catch (error) {
      console.warn(`[TrackUpload] BPM local falhou para "${item.file.name}". Vai seguir pro Python.`, error)
      bpmLocalFailed = true
      // Não descarta — vai pro Python mesmo assim. O Python detecta BPM via GPU.
    }

    if (cancelRef.current) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'cancelled' } : q))
      return
    }

    // 2. Cria a faixa (BPM pode ser 0 — o Python corrige depois)
    const newTrack: Track = {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: item.file.name.replace(/\.[^/.]+$/, ''),
      artist: '',
      bpm: detectedBpm ?? 0,
      key: '',
      energy: 7,
      source: 'manual',
    }

    if (libraryTracks.length > 0 && detectedBpm) {
      const matches = findCompatibleTracks(newTrack, libraryTracks, 70)
      setCompatible(matches)
    }

    if (onAddTrack) onAddTrack(newTrack)

    setQueue(prev => prev.map(q => q.id === item.id
      ? { ...q, status: 'analyzing-structure', bpm: detectedBpm ?? 0, trackId: newTrack.id }
      : q
    ))

    // 3. Análise estrutural (job + polling)
    try {
      const fd = new FormData()
      fd.append('file', item.file)

      const res = await fetch('/api/analyze-track', { method: 'POST', body: fd })
      if (!res.ok) {
        throw new Error(`POST falhou: ${res.status}`)
      }

      const { job_id } = await res.json()

      let attempts = 0
      let finalResult: AudioAnalysis | null = null

      while (attempts < MAX_POLL_ATTEMPTS) {
        if (cancelRef.current) {
          setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'cancelled' } : q))
          return
        }

        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        attempts++

        try {
          const pollRes = await fetch(`/api/analyze-track?jobId=${job_id}`)
          if (!pollRes.ok) continue
          const data = await pollRes.json()

          if (data.status === 'done' && data.result) {
            finalResult = data.result as AudioAnalysis
            break
          }
          if (data.status === 'error') {
            throw new Error(data.error || 'Erro no job')
          }
        } catch (pollErr) {
          console.warn('[TrackUpload] Poll falhou:', pollErr)
        }
      }

      if (cancelRef.current) {
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'cancelled' } : q))
        return
      }

      if (finalResult) {
        if (onAddAnalysis) onAddAnalysis(newTrack.id, finalResult, durationSec)
        setQueue(prev => prev.map(q => q.id === item.id
          ? { ...q, status: 'done', bpm: finalResult.bpm ?? detectedBpm ?? 0 }
          : q
        ))
      } else {
        setQueue(prev => prev.map(q => q.id === item.id
          ? { ...q, status: 'error', error: 'Timeout na análise' }
          : q
        ))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      setQueue(prev => prev.map(q => q.id === item.id
        ? { ...q, status: 'error', error: msg }
        : q
      ))
    }
  }

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const items: QueueItem[] = files.map(f => ({
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      status: 'pending',
    }))

    setQueue(prev => [...prev, ...items])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCancel = () => {
    cancelRef.current = true
    setQueue(prev => prev.map(q =>
      q.status === 'pending' ? { ...q, status: 'cancelled' } : q
    ))
  }

  const handleClearDone = () => {
    setQueue(prev => prev.filter(q => q.status !== 'done' && q.status !== 'cancelled'))
  }

  const stats = {
    total: queue.length,
    done: queue.filter(q => q.status === 'done').length,
    pending: queue.filter(q => q.status === 'pending').length,
    processing: queue.filter(q => q.status === 'analyzing-bpm' || q.status === 'analyzing-structure').length,
    errors: queue.filter(q => q.status === 'error').length,
    cancelled: queue.filter(q => q.status === 'cancelled').length,
  }

  useEffect(() => {
    if (onQueueChange) {
      onQueueChange({
        total: stats.total,
        done: stats.done,
        pending: stats.pending,
        processing: stats.processing,
        errors: stats.errors,
      })
    }
  }, [stats.total, stats.done, stats.pending, stats.processing, stats.errors, onQueueChange])

  const hasActive = stats.processing > 0 || stats.pending > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 12,
          padding: '32px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: 'var(--surface2)',
          transition: 'border-color 0.15s',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFilesSelected}
          style={{ display: 'none' }}
        />
        <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>
          📁 clique para selecionar arquivos de áudio
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          mp3, wav, ogg, flac — pode selecionar vários (fila serial)
        </p>
      </div>

      {stats.total > 0 && (
        <div style={{
          padding: '12px 14px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--muted)',
          }}>
            <span>
              fila: <strong style={{ color: 'var(--text)' }}>{stats.done}/{stats.total}</strong> concluídos
              {stats.pending > 0 && ` · ${stats.pending} na espera`}
              {stats.errors > 0 && ` · ${stats.errors} com erro`}
              {stats.cancelled > 0 && ` · ${stats.cancelled} cancelados`}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {hasActive && (
                <button
                  onClick={handleCancel}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--red)',
                    color: 'var(--red)',
                    borderRadius: 6,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono, monospace)',
                    cursor: 'pointer',
                  }}
                >
                  ✕ cancelar
                </button>
              )}
              {stats.done > 0 && (
                <button
                  onClick={handleClearDone}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                    borderRadius: 6,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono, monospace)',
                    cursor: 'pointer',
                  }}
                >
                  limpar concluídos
                </button>
              )}
            </div>
          </div>
          <div style={{
            height: 4,
            background: 'var(--border)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${(stats.done / stats.total) * 100}%`,
              height: '100%',
              background: 'var(--green)',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          maxHeight: 240,
          overflowY: 'auto',
        }}>
          {queue.map(q => (
            <QueueRow key={q.id} item={q} />
          ))}
        </div>
      )}

      {compatible.length > 0 && (
        <div style={{
          padding: '12px 14px',
          background: 'var(--surface2)',
          border: '1px solid var(--accent)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <p style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 4 }}>
            🎵 {compatible.length} faixa{compatible.length > 1 ? 's' : ''} compatível{compatible.length > 1 ? 'is' : ''} na biblioteca
          </p>
          {compatible.slice(0, 5).map(({ track, score }) => (
            <div key={track.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
              <span>
                <strong style={{ color: 'var(--text)' }}>{track.title}</strong>
                {track.artist && ` — ${track.artist}`}
              </span>
              <span style={{ fontFamily: 'var(--font-mono, monospace)', color: score >= 85 ? 'var(--green)' : 'var(--muted)', fontSize: 11 }}>
                {score}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QueueRow({ item }: { item: QueueItem }) {
  const statusIcon = {
    'pending': '○',
    'analyzing-bpm': '⟳',
    'analyzing-structure': '⟳',
    'done': '✓',
    'error': '✗',
    'cancelled': '—',
  }[item.status]

  const statusColor = {
    'pending': 'var(--muted)',
    'analyzing-bpm': 'var(--accent)',
    'analyzing-structure': 'var(--accent)',
    'done': 'var(--green)',
    'error': 'var(--red)',
    'cancelled': 'var(--muted)',
  }[item.status]

  const statusText = {
    'pending': 'na fila',
    'analyzing-bpm': 'analisando BPM...',
    'analyzing-structure': 'analisando estrutura...',
    'done': 'concluído',
    'error': item.error || 'erro',
    'cancelled': 'cancelado',
  }[item.status]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      background: 'var(--surface2)',
      border: `1px solid ${item.status === 'error' ? 'var(--red)' : item.status === 'done' ? 'var(--green)' : 'var(--border)'}`,
      borderRadius: 8,
      fontSize: 12,
      fontFamily: 'var(--font-mono, monospace)',
    }}>
      <span style={{ color: statusColor, width: 14, textAlign: 'center' }}>{statusIcon}</span>
      <span style={{
        flex: 1,
        color: 'var(--text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {item.file.name}
      </span>
      {item.bpm !== undefined && item.bpm > 0 && (
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
          {item.bpm} BPM
        </span>
      )}
      <span style={{ color: statusColor, fontSize: 11 }}>
        {statusText}
      </span>
    </div>
  )
}