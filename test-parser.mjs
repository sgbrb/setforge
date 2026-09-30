import { readFileSync } from 'fs'
import { XMLParser } from 'fast-xml-parser'

// ===== CÓPIA DAS FUNÇÕES (pra testar isolado) =====

const CAMELOT_MAP = {
  'C major': '8B', 'C# major': '3B', 'Db major': '3B', 'D major': '10B',
  'D# major': '5B', 'Eb major': '5B', 'E major': '12B', 'F major': '7B',
  'F# major': '2B', 'Gb major': '2B', 'G major': '9B', 'G# major': '4B',
  'Ab major': '4B', 'A major': '11B', 'A# major': '6B', 'Bb major': '6B',
  'B major': '1B', 'Cb major': '1B',
  'C minor': '5A', 'C# minor': '12A', 'Db minor': '12A', 'D minor': '7A',
  'D# minor': '2A', 'Eb minor': '2A', 'E minor': '9A', 'F minor': '4A',
  'F# minor': '11A', 'Gb minor': '11A', 'G minor': '6A', 'G# minor': '1A',
  'Ab minor': '1A', 'A minor': '8A', 'A# minor': '3A', 'Bb minor': '3A',
  'B minor': '10A', 'Cb minor': '10A',
}

function normalizeTonality(raw) {
  const s = raw.trim()
  if (!s) return ''
  if (s.includes(' ')) return s
  if (s.endsWith('m')) return `${s.slice(0, -1)} minor`
  return `${s} major`
}

function tonalityToCamelot(raw) {
  return CAMELOT_MAP[normalizeTonality(raw)] || ''
}

function decodeLocation(location) {
  if (!location) return ''
  let path = location.replace(/^file:\/\/localhost\//i, '').replace(/^file:\/\//i, '')
  try { path = decodeURIComponent(path) } catch {}
  path = path.replace(/\//g, '\\')
  if (!path.match(/^[A-Za-z]:/)) path = 'C:' + path
  return path
}

// ===== TESTE =====

console.log('📖 Lendo XML...')
const xml = readFileSync('./rekordbox-full.xml', 'utf-8')
console.log(`   Tamanho: ${(xml.length / 1024 / 1024).toFixed(2)} MB`)

console.log('🔍 Parseando...')
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => name === 'TRACK',
})
const parsed = parser.parse(xml)
const collection = parsed?.DJ_PLAYLISTS?.COLLECTION

if (!collection) {
  console.error('❌ COLLECTION não encontrada!')
  process.exit(1)
}

const entries = Number(collection['@_Entries']) || 0
const rawTracks = collection.TRACK || []

console.log(`   Entries declarado: ${entries}`)
console.log(`   TRACKs lidos:      ${rawTracks.length}`)

// ===== Estatísticas =====

let semKey = 0
let semTempo = 0
let semLocation = 0
let bpm0 = 0

const amostras = []
for (let i = 0; i < Math.min(5, rawTracks.length); i++) {
  const t = rawTracks[i]
  const tonalityRaw = String(t['@_Tonality'] || '')
  const key = tonalityToCamelot(tonalityRaw)
  const tempos = t.TEMPO
  const firstTempo = Array.isArray(tempos) ? tempos[0] : tempos
  const firstBeatSec = Number(firstTempo?.['@_Inizio']) || 0

  amostras.push({
    trackId: String(t['@_TrackID']),
    name: String(t['@_Name']).slice(0, 40),
    bpm: Math.round(Number(t['@_AverageBpm']) || 0),
    tonalityRaw,
    key,
    firstBeatSec,
    location: decodeLocation(String(t['@_Location'] || '')).slice(0, 60),
  })
}

// Contagens
for (const t of rawTracks) {
  const tonalityRaw = String(t['@_Tonality'] || '')
  if (!tonalityToCamelot(tonalityRaw)) semKey++
  const tempos = t.TEMPO
  if (!tempos) semTempo++
  if (!t['@_Location']) semLocation++
  if ((Number(t['@_AverageBpm']) || 0) <= 0) bpm0++
}

console.log('')
console.log('📊 AMOSTRA (5 primeiras):')
for (const a of amostras) {
  console.log(`   [${a.key || '??'}] ${a.bpm} BPM | ${a.tonalityRaw.padEnd(5)} | beat@${a.firstBeatSec}s | ${a.name}`)
}

console.log('')
console.log('📈 ESTATÍSTICAS:')
console.log(`   Sem Camelot:   ${semKey}`)
console.log(`   Sem TEMPO:     ${semTempo}`)
console.log(`   Sem Location:  ${semLocation}`)
console.log(`   BPM = 0:       ${bpm0}`)
console.log('')
console.log('✅ Parser funcionou!')