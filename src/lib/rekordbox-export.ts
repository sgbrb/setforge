// ============================================================
// REKORDBOX XML EXPORT
// ============================================================

import { GeneratedSetlist, SetlistTrack } from './types'
import { MixTimeline, Transition } from './mix-timeline'

/**
 * Converte Camelot (8A, 8B, 12A) em notação musical (Am, A, Dbm).
 * Fonte: Mixed In Key / Camelot wheel.
 */
export function camelotToMusical(camelot: string): string {
  if (!camelot) return ''
  const match = camelot.trim().match(/^(\d{1,2})\s*([AB])$/i)
  if (!match) return ''

  const num = parseInt(match[1], 10)
  const letter = match[2].toUpperCase()

  // Tabela Camelot → musical (menor = A, maior = B)
  const menorTable: Record<number, string> = {
    1: 'Abm', 2: 'Ebm', 3: 'Bbm', 4: 'Fm', 5: 'Cm', 6: 'Gm',
    7: 'Dm', 8: 'Am', 9: 'Em', 10: 'Bm', 11: 'F#m', 12: 'Dbm',
  }
  const maiorTable: Record<number, string> = {
    1: 'B', 2: 'F#', 3: 'Db', 4: 'Ab', 5: 'Eb', 6: 'Bb',
    7: 'F', 8: 'C', 9: 'G', 10: 'D', 11: 'A', 12: 'E',
  }

  if (num < 1 || num > 12) return ''
  return letter === 'A' ? menorTable[num] : maiorTable[num]
}

/**
 * Formata um path absoluto Windows pra URL file://localhost/...
 * Ex: C:\Users\bruno\SetForge-Export\130\faixa1.mp3
 *   → file://localhost/C:/Users/bruno/SetForge-Export/130/faixa1.mp3
 */
export function formatLocation(absolutePath: string): string {
  let path = absolutePath.replace(/\\/g, '/')
  path = path.replace(/^file:\/\//, '')
  
  // 🆕 NÃO encoda o drive (C:) — mantém os dois pontos
  const driveMatch = path.match(/^([A-Za-z]):\//)
  const drive = driveMatch ? `${driveMatch[1]}:` : ''
  const rest = driveMatch ? path.slice(driveMatch[0].length) : path
  
  // Encoda só o resto (espaços, acentos, etc)
  const encodedRest = rest
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
  
  return `file://localhost/${drive}/${encodedRest}`
}

/**
 * Escapa caracteres especiais do XML (& < > " ').
 */
export function escapeXml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 🆕 Gera o XML do Rekordbox com hot cues + playlist do setlist.
 *
 * Hot cues (por faixa):
 *   A (Num=0) — entrada da faixa (playBAt da transição anterior, ou 0:00 na primeira)
 *   B (Num=1) — saída (crossfadeStart da transição ATUAL)
 *   C (Num=2) — stop (crossfadeEnd da transição ATUAL)
 *   Memory (Num=-1) — referência (mesmo valor do A)
 */
export function generateRekordboxXML(
  setlist: GeneratedSetlist,
  transitions: Transition[],
  basePath: string,
  subfolder: string
): string {
  const tracks = setlist.setlist
  const trackPath = (filename: string) => {
    // Adiciona .mp3 se não tiver extensão
    const ext = filename.match(/\.(mp3|wav|flac|ogg|aiff|aif|m4a)$/i) ? '' : '.mp3'
    return `${basePath}\\${subfolder}\\${filename}${ext}`
  }

  // Mapeia cada faixa pra um TrackID (começando em 1)
  const trackIds: Record<string, number> = {}
  tracks.forEach((t, i) => {
    trackIds[t.id] = i + 1
  })

  const collectionXml = tracks.map((track, i) => {
    const trackId = trackIds[track.id]
    const isFirst = i === 0
    const isLast = i === tracks.length - 1

    // Hot cue A (entrada) — playBAt da transição ANTERIOR
    const prevTransition = i > 0 ? transitions[i - 1] : null
    const hotCueA = isFirst ? 0 : (prevTransition?.timeline.playBAtSec ?? 0)

    // Hot cue B (saída) — crossfadeStart da transição ATUAL
    const currentTransition = i < transitions.length ? transitions[i] : null
    const hotCueB = currentTransition?.timeline.crossfadeStartSec ?? 0

    // Hot cue C (stop) — crossfadeEnd da transição ATUAL
    const hotCueC = currentTransition?.timeline.crossfadeEndSec ?? 0

    // TotalTime em segundos (arredondado)
    const totalTime = Math.round(track.durationSec ?? 0)

    // BPM
    const bpm = track.bpm || 0

    // Tonality (converte Camelot pra musical)
    const tonality = camelotToMusical(track.key || '')

    // Location
    const location = formatLocation(trackPath(track.title))

    // Hot cues XML
    const hotCuesXml: string[] = []

    // Hot cue A — verde
    if (hotCueA > 0 || isFirst) {
      hotCuesXml.push(
        `      <POSITION_MARK Name="ENTRADA" Type="0" Start="${hotCueA.toFixed(3)}" Num="0" Red="40" Green="226" Blue="20"/>`
      )
      // Memory cue (mesmo valor)
      hotCuesXml.push(
        `      <POSITION_MARK Name="ENTRADA-MEM" Type="0" Start="${hotCueA.toFixed(3)}" Num="-1"/>`
      )
    }

    // Hot cue B — vermelho
    if (hotCueB > 0) {
      hotCuesXml.push(
        `      <POSITION_MARK Name="SAIDA" Type="0" Start="${hotCueB.toFixed(3)}" Num="1" Red="226" Green="40" Blue="40"/>`
      )
    }

    // Hot cue C — azul
    if (hotCueC > 0 && hotCueC !== hotCueB) {
      hotCuesXml.push(
        `      <POSITION_MARK Name="STOP" Type="0" Start="${hotCueC.toFixed(3)}" Num="2" Red="40" Green="40" Blue="226"/>`
      )
    }

    // Tempo (beatgrid básico)
    const firstBeat = track.firstBeatSec ?? 0
    const tempoXml = bpm > 0
      ? `      <TEMPO Inizio="${firstBeat.toFixed(3)}" Bpm="${bpm.toFixed(2)}" Metro="4/4" Battito="1"/>`
      : ''

    return `    <TRACK TrackID="${trackId}" Name="${escapeXml(track.title)}" Artist="${escapeXml(track.artist || '')}" Composer="" Album="" Grouping="" Genre="" Kind="Ficheiro MP3" Size="0" TotalTime="${totalTime}" DiscNumber="0" TrackNumber="${i + 1}" Year="0" AverageBpm="${bpm.toFixed(2)}" DateAdded="${new Date().toISOString().split('T')[0]}" BitRate="320" SampleRate="44100" Comments="SetForge" PlayCount="0" Rating="0" Location="${location}" Remixer="" Tonality="${escapeXml(tonality)}" Label="" Mix="">
${tempoXml}
${hotCuesXml.join('\n')}
    </TRACK>`
  }).join('\n')

  // Playlist
  const playlistXml = tracks.map((t, i) =>
    `        <TRACK Key="${trackIds[t.id]}"/>`
  ).join('\n')

  const totalDuration = transitions.reduce((acc, t) => acc + (t.timeline.crossfadeDurationSec ?? 0), 0)
  const setlistName = `SetForge ${subfolder}`

  return `<?xml version="1.0" encoding="UTF-8"?>

<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.0.0" Company="AlphaTheta"/>
  <COLLECTION Entries="${tracks.length}">
${collectionXml}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="${escapeXml(setlistName)}" Type="1" KeyType="0" Entries="${tracks.length}">
${playlistXml}
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`
}