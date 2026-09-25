import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Track, SetConfig } from '@/lib/types'

const TIMEOUT_MS = 300_000  // 5 min
const MODEL = 'openai/gpt-4o-mini'

interface GenerateRequest {
  tracks: Track[]
  config: SetConfig
}

function normalizeTitle(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function cleanTitle(s: string): string {
  if (!s || typeof s !== 'string') return ''
  return normalizeTitle(s)
    .replace(/[_\-]pn$/i, '')
    .replace(/\s*\(original mix\)\s*/gi, '')
    .replace(/\s*\(remix\)\s*/gi, '')
    .replace(/\s*\[.*?\]\s*/g, '')
    .trim()
}

function findOriginalTrack(setlistTrack: any, tracks: Track[]): Track | undefined {
  if (!setlistTrack?.title) return undefined

  const aiTitle = normalizeTitle(setlistTrack.title)
  const aiBpm = Number(setlistTrack.bpm)

  let original = tracks.find(
    (t) =>
      normalizeTitle(t.title) === aiTitle &&
      Math.abs((t.bpm || 0) - aiBpm) <= 2
  )
  if (original) return original

  original = tracks.find((t) => normalizeTitle(t.title) === aiTitle)
  if (original) return original

  const aiClean = cleanTitle(aiTitle)
  original = tracks.find((t) => cleanTitle(t.title) === aiClean)
  if (original) return original

  original = tracks.find((t) => {
    const tClean = cleanTitle(t.title)
    return tClean.includes(aiClean) || aiClean.includes(tClean)
  })
  if (original) return original

  original = tracks.find(
    (t) =>
      Math.abs((t.bpm || 0) - aiBpm) <= 1 &&
      t.energy === setlistTrack.energy
  )
  if (original) return original

  return undefined
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { tracks, config } = (await req.json()) as GenerateRequest

    if (!tracks || tracks.length < 3) {
      return NextResponse.json(
        { error: 'Adicione pelo menos 3 faixas' },
        { status: 400 }
      )
    }

    const folderIds = new Set(tracks.map(t => t.folderId ?? null))
    if (folderIds.size > 1) {
      return NextResponse.json(
        { error: 'Todas as faixas do setlist devem ser da mesma pasta.' },
        { status: 400 }
      )
    }

    const onlyFolderId = tracks[0].folderId
    if (!onlyFolderId) {
      return NextResponse.json(
        { error: 'Não é possível montar setlist com faixas sem pasta. Crie uma pasta e arraste as faixas pra lá.' },
        { status: 400 }
      )
    }

    const orderedList = tracks
      .map((t, i) => `${i + 1}. "${t.title}" — ${t.artist} (BPM: ${t.bpm || '?'}, Tom: ${t.key || '?'}, Energia: ${t.energy}/10)`)
      .join('\n')

    const systemPrompt = `Você é um DJ profissional. O setlist abaixo JÁ FOI PRÉ-ORDENADO por um algoritmo (BPM + Camelot + estrutura). MANTENHA a ordem.

Se mudar a ordem, justifique na "analysis". NÃO descarte faixas.

Regras de mixagem:
- BPM consecutivo: diferença ≤ ±3 (ideal) ou ±6 (aceitável)
- Camelot: mesmo código, adjacente mesma letra, ou mesmo número
- Energia: respeite a curva pedida

Retorne APENAS JSON válido:
{
  "setlist": [
    {
      "position": 1,
      "title": "Nome EXATO (copie)",
      "artist": "Artista",
      "bpm": 128,
      "key": "8A",
      "energy": 7,
      "transitionNote": "1 frase curta e prática (máx 120 chars)"
    }
  ],
  "analysis": "2-3 frases sobre a ordem",
  "djTip": "1 dica prática (máx 200 chars)",
  "peakMoment": "1 frase sobre o pico do set (máx 200 chars)"
}

⚠️ SEJA CONCISO. transitionNote com UMA frase. Nada de introdução, nada de markdown, só o JSON.`

    const userPrompt = `Contexto:
- Evento: ${config.eventType}
- Duração: ${config.duration}
- Curva: ${config.energyCurve}
- Público: ${config.audience || 'Não especificado'}

ORDEM PRÉ-CALCULADA (mantenha):

${orderedList}

Total: ${tracks.length} faixas.

Gere o JSON: análise geral + transitionNote CURTA pra cada faixa + djTip + peakMoment.`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    console.log(`[OpenRouter] Iniciando geração com modelo: ${MODEL}`)
    console.log(`[OpenRouter] Pasta: ${onlyFolderId} · ${tracks.length} faixas`)
    const startTime = Date.now()

    let completion: any
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://setforge.app',
          'X-Title': 'SetForge',
          'Accept-Encoding': 'identity',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 16000,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error(`[OpenRouter] HTTP ${response.status}:`, errText.slice(0, 500))
        return NextResponse.json(
          { error: `OpenRouter ${response.status}: ${errText.slice(0, 200)}` },
          { status: response.status }
        )
      }

      // LÊ COMO TEXTO E PARSEIA MANUALMENTE
      const rawText = await response.text()
      console.log(`[OpenRouter] Resposta crua (200 chars):`, rawText.slice(0, 200))

      try {
        completion = JSON.parse(rawText.trim())
      } catch (parseErr) {
        console.error('[OpenRouter] Falha ao parsear:', parseErr)
        console.error('[OpenRouter] Texto:', rawText.slice(0, 500))
        return NextResponse.json(
          { error: `JSON inválido do OpenRouter: ${rawText.slice(0, 100)}` },
          { status: 502 }
        )
      }
    } catch (err) {
      const errName = (err as any)?.name
      const errStatus = (err as any)?.status

      if (errName === 'AbortError' || errName === 'APIUserAbortError') {
        return NextResponse.json(
          { error: `O modelo demorou mais de ${TIMEOUT_MS / 1000}s. Tente de novo ou reduza o número de faixas.` },
          { status: 504 }
        )
      }
      if (errStatus === 429) {
        return NextResponse.json(
          { error: 'Modelo temporariamente sobrecarregado. Aguarde 30s e tente de novo.' },
          { status: 503 }
        )
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }

    if (!completion?.choices?.length) {
      console.error('[OpenRouter] Resposta sem choices:', JSON.stringify(completion).slice(0, 500))
      return NextResponse.json(
        { error: 'Resposta inválida do modelo (sem choices). Tente de novo.' },
        { status: 502 }
      )
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const finishReason = completion.choices[0]?.finish_reason
    const responseText = completion.choices[0]?.message?.content

    console.log(`[OpenRouter] Modelo usado: ${completion.model}`)
    console.log(`[OpenRouter] Tempo: ${elapsed}s`)
    console.log(`[OpenRouter] Finish reason: ${finishReason}`)
    console.log(`[OpenRouter] Tamanho da resposta: ${responseText?.length ?? 0} chars`)
    console.log(`[OpenRouter] Usage:`, completion.usage)

    if (!responseText) {
      console.error('[OpenRouter] Resposta vazia. Detalhes:', {
        model: completion.model,
        finishReason,
        usage: completion.usage,
      })
      return NextResponse.json(
        { error: `Resposta vazia do modelo (finish: ${finishReason}). Tente novamente.` },
        { status: 502 }
      )
    }

    let cleanJson = responseText.trim()
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    console.log(`[SetForge] JSON limpo: ${cleanJson.length} chars`)

    let parsed
    try {
      parsed = JSON.parse(cleanJson)
    } catch (parseError) {
      const firstBrace = cleanJson.indexOf('{')
      const lastBrace = cleanJson.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const extracted = cleanJson.slice(firstBrace, lastBrace + 1)
        try {
          parsed = JSON.parse(extracted)
          console.log('[SetForge] JSON reparado com sucesso')
        } catch {
          return NextResponse.json(
            { error: `JSON inválido do modelo (${cleanJson.length} chars). Resposta foi truncada — tente de novo ou reduza o número de faixas.` },
            { status: 502 }
          )
        }
      } else {
        return NextResponse.json(
          { error: `JSON inválido do modelo. Tente novamente.` },
          { status: 502 }
        )
      }
    }

    if (!Array.isArray(parsed?.setlist) || parsed.setlist.length === 0) {
      console.error('[SetForge] parsed.setlist inválido:', JSON.stringify(parsed).slice(0, 500))
      return NextResponse.json(
        { error: 'O modelo não retornou um setlist válido. Tente novamente.' },
        { status: 502 }
      )
    }

    const tracksWithIds = parsed.setlist.map((setlistTrack: any) => {
      const original = findOriginalTrack(setlistTrack, tracks)

      if (original) {
        console.log(`[SetForge] Match OK: "${setlistTrack.title}" → id=${original.id}`)
      } else {
        console.warn(`[SetForge] SEM MATCH: "${setlistTrack.title}" (BPM ${setlistTrack.bpm})`)
      }

      return {
        ...setlistTrack,
        id: original?.id ?? `gen-${Math.random().toString(36).slice(2, 10)}`,
        artist: original?.artist || setlistTrack.artist || '',
      }
    })

    parsed.setlist = tracksWithIds

    if (parsed.setlist.length < tracks.length) {
      console.warn(
        `[SetForge] OpenRouter usou ${parsed.setlist.length} de ${tracks.length} faixas ` +
        `(${tracks.length - parsed.setlist.length} descartadas)`
      )
    }

    const setlist = await prisma.setlist.create({
      data: {
        name: `Set ${config.eventType} - ${new Date().toLocaleDateString('pt-BR')}`,
        eventType: config.eventType,
        duration: config.duration,
        energyCurve: config.energyCurve,
        audience: config.audience,
        analysis: parsed.analysis || null,
        djTip: parsed.djTip || null,
        peakMoment: parsed.peakMoment || null,
        totalDuration: parsed.setlist?.length?.toString() || '0',
        userId: session.user.id,
        folderId: onlyFolderId,
        tracks: {
          create: parsed.setlist.map((t: any, i: number) => ({
            position: i + 1,
            trackId: t.id,
            title: t.title,
            artist: t.artist,
            bpm: t.bpm,
            key: t.key,
            energy: t.energy,
            transitionNote: t.transitionNote,
          })),
        },
      },
    })

    return NextResponse.json({
      setlist: parsed.setlist,
      analysis: parsed.analysis || '',
      djTip: parsed.djTip || '',
      peakMoment: parsed.peakMoment || '',
      totalDuration: parsed.setlist?.length?.toString() || '0',
      id: setlist.id,
      folderId: onlyFolderId,
    })
  } catch (error) {
    console.error('Generate setlist error:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return NextResponse.json(
      { error: `Erro ao gerar set list: ${message}` },
      { status: 500 }
    )
  }
}