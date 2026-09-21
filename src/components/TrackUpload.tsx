'use client'

import { useState, useRef } from 'react'
import MusicTempo from 'music-tempo'
import { Track } from '@/lib/types'
import { findCompatibleTracks } from '@/lib/harmonic-utils'
import { AudioAnalysis } from '@/lib/mix-timeline'

interface TrackUploadProps {
  onAddTrack?: (track: Track) => void
  onAddAnalysis?: (trackId: string, analysis: AudioAnalysis, durationSec: number) => void
  libraryTracks?: Track[]
}

const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 200  // ~10 minutos de tolerância

export default function TrackUpload({
  onAddTrack,
  onAddAnalysis,
  libraryTracks = [],
}: TrackUploadProps) {
  const [bpm, setBpm] = useState<number | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzingStructure, setAnalyzingStructure] = useState(false)
  const [structureOk, setStructureOk] = useState(false)
  const [jobStatus, setJobStatus] = useState<string>('')
  const [compatible, setCompatible] = useState<Array<{ track: Track; score: number }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    console.log('[TrackUpload] arquivo selecionado:', file.name)

    setFileName(file.name)
    setBpm(null)
    setCompatible([])
    setStructureOk(false)
    setJobStatus('')
    setAnalyzing(true)
    setAnalyzingStructure(false)

    let detectedBpm: number | null = null
    let durationSec = 0

    try {
      const arrayBuffer = await file.arrayBuffer()
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
      setBpm(detectedBpm)
      await audioContext.close()
    } catch (error) {
      console.error('[TrackUpload] Erro BPM:', error)
      alert('Não foi possível analisar o BPM deste arquivo.')
      setAnalyzing(false)
      return
    }

    setAnalyzing(false)

    const newTrack: Track = {
      id: `upload-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ''),
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

    if (onAddTrack) {
      onAddTrack(newTrack)
    }

    // 🎧 Análise estrutural assíncrona
    setAnalyzingStructure(true)
    setJobStatus('criando job...')

    try {
      const fd = new FormData()
      fd.append('file', file)

      console.log(`[TrackUpload] POST /api/analyze-track para "${file.name}"...`)
      const res = await fetch('/api/analyze-track', {
        method: 'POST',
        body: fd,
      })

      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        console.error('[TrackUpload] POST falhou:', res.status, txt.slice(0, 300))
        setJobStatus(`erro ${res.status}`)
        setAnalyzingStructure(false)
        return
      }

      const { job_id } = await res.json()
      console.log(`[TrackUpload] Job criado: ${job_id}. Iniciando polling...`)
      setJobStatus('processando...')

      // 🔁 Polling
      let attempts = 0
      let finalResult: AudioAnalysis | null = null

      while (attempts < MAX_POLL_ATTEMPTS) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        attempts++

        try {
          const pollRes = await fetch(`/api/analyze-track?jobId=${job_id}`)
          if (!pollRes.ok) {
            console.warn(`[TrackUpload] Poll ${attempts} falhou: ${pollRes.status}`)
            continue
          }

          const data = await pollRes.json()

          if (data.status === 'done' && data.result) {
            finalResult = data.result as AudioAnalysis
            console.log(
              `[TrackUpload] Análise OK após ${attempts} polls:`,
              finalResult?.segments?.length ?? 0,
              'segmentos'
            )
            break
          }

          if (data.status === 'error') {
            console.error('[TrackUpload] Job retornou erro:', data.error)
            setJobStatus(`erro: ${data.error}`)
            break
          }

          // ainda processando — segue o loop
        } catch (pollErr) {
          console.warn('[TrackUpload] Erro no poll:', pollErr)
        }
      }

      if (finalResult) {
        setStructureOk(true)
        setJobStatus('')
        if (onAddAnalysis) {
          onAddAnalysis(newTrack.id, finalResult, durationSec)
        }
      } else if (!jobStatus.startsWith('erro')) {
        setJobStatus('timeout — não terminou a tempo')
      }
    } catch (err) {
      console.error('[TrackUpload] Erro na análise estrutural:', err)
      setJobStatus('erro na conexão')
    } finally {
      setAnalyzingStructure(false)
    }
  }

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
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>
          📁 clique para selecionar um arquivo de áudio
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          mp3, wav, ogg, flac — o BPM é detectado localmente no navegador
        </p>
      </div>

      {fileName && (
        <div style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          arquivo: <span style={{ color: 'var(--text)' }}>{fileName}</span>
        </div>
      )}

      {analyzing && (
        <p style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          ⟳ analisando BPM...
        </p>
      )}

      {bpm !== null && (
        <div style={{
          padding: '10px 14px',
          background: 'var(--surface2)',
          border: '1px solid var(--green)',
          borderRadius: 8,
          fontSize: 13,
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          ✓ BPM detectado: <strong style={{ color: 'var(--green)' }}>{bpm}</strong>
        </div>
      )}

      {analyzingStructure && (
        <p style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          ⟳ analisando estrutura (intro/outro/drop)... {jobStatus && `[${jobStatus}]`}
        </p>
      )}

      {structureOk && (
        <div style={{
          padding: '10px 14px',
          background: 'var(--surface2)',
          border: '1px solid var(--green)',
          borderRadius: 8,
          fontSize: 13,
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          ✓ estrutura detectada
        </div>
      )}

      {!analyzingStructure && jobStatus && !structureOk && (
        <p style={{
          fontSize: 12,
          color: 'var(--red)',
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          ⚠ {jobStatus}
        </p>
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