import { Track } from './types'

/**
 * Integração com o Beatport via Apify.
 * Ator: crawlerbros/beatport-scraper
 * Retorna metadados completos: BPM, tom (com Camelot), preview, artwork.
 */

const ACTOR_ID = 'crawlerbros~beatport-scraper'
const APIFY_BASE = 'https://api.apify.com/v2'

interface ApifyKeyObject {
  name?: string
  camelotNumber?: number
  camelotLetter?: string
  letter?: string
}

interface ApifyBeatportItem {
  id?: number
  title?: string
  mixName?: string
  artists?: string[]
  primaryArtist?: string
  bpm?: number
  key?: ApifyKeyObject
  durationMs?: number
  previewUrl?: string
  artworkUrl?: string
  sourceUrl?: string
}

/**
 * Formata o tom no padrão Camelot (ex: "7B") se possível.
 * Fallback para o nome musical (ex: "F Major").
 */
function formatKey(key?: ApifyKeyObject): string {
  if (!key) return ''
  if (key.camelotNumber && key.camelotLetter) {
    return `${key.camelotNumber}${key.camelotLetter}`
  }
  return key.name ?? ''
}

export async function searchBeatportTracks(query: string, limit = 6): Promise<Track[]> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    console.warn('[Beatport] APIFY_API_TOKEN não configurado — pulando busca')
    return []
  }

  const input = {
    mode: 'search',
    searchQuery: query,
    searchType: 'tracks',
    maxItems: limit,
  }

  const url = `${APIFY_BASE}/actors/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Beatport (Apify) search failed: ${res.status} — ${body.slice(0, 200)}`)
  }

  const items: ApifyBeatportItem[] = await res.json()
  console.log(`[Beatport] Apify retornou ${items.length} item(s) para "${query}"`)

  return items.map((item): Track => {
    const title = item.title
      ? `${item.title}${item.mixName ? ` (${item.mixName})` : ''}`
      : 'Faixa desconhecida'

    // artists é array de strings — join simples
    const artist = item.artists?.join(', ') ?? item.primaryArtist ?? ''

    return {
      id: `beatport-${item.id ?? crypto.randomUUID()}`,
      title,
      artist,
      bpm: item.bpm ?? 0,
      key: formatKey(item.key),
      energy: 7,
      durationMs: item.durationMs,
      previewUrl: item.previewUrl,
      artworkUrl: item.artworkUrl,
      source: 'beatport',
    }
  })
}