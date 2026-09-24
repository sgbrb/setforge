import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Track, SetConfig } from '@/lib/types'

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

const TIMEOUT_MS = 300_000  // 5 min — margem para modelos free lentos

// ⚠️ MODELO ATUAL: grátis (pode dar 429/503, sujeito a pool compartilhado)
// 🔜 QUANDO TIVER CRÉDITO WISE: trocar por 'openai/gpt-4o-mini' (pago, estável)
const MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'

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

  // 1. Match exato + BPM próximo (±2)
  let original = tracks.find(
    (t) =>
      normalizeTitle(t.title) === aiTitle &&
      Math.abs((t.bpm || 0) - aiBpm) <= 2
  )
  if (original) return original

  // 2. Match exato de título (ignora BPM)
  original = tracks.find((t) => normalizeTitle(t.title) === aiTitle)
  if (original) return original

  // 3. Remove sufixos comuns
  const aiClean = cleanTitle(aiTitle)
  original = tracks.find((t) => cleanTitle(t.title) === aiClean)
  if (original) return original

  // 4. Match por includes
  original = tracks.find((t) => {
    const tClean = cleanTitle(t.title)
    return tClean.includes(aiClean) || aiClean.includes(tClean)
  })
  if (original) return original

  // 5. BPM + energia (último recurso)
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

    const orderedList = tracks
      .map((t, i) => `${i + 1}. "${t.title}" — ${t.artist} (BPM: ${t.bpm || '?'}, Tom: ${t.key || '?'}, Energia: ${t.energy}/10)`)
      .join('\n')

    const systemPrompt = `Você é um DJ profissional e curador musical com décadas de experiência.
Sua tarefa é CRIAR UMA ANÁLISE e NOTAS DE TRANSIÇÃO para um setlist
que JÁ FOI PRÉ-ORDENADO por um algoritmo de compatibilidade harmônica.

⚠️ REGRA CRÍTICA — NÃO IGNORE:
A ordem das faixas abaixo FOI CALCULADA por um algoritmo que analisou
BPM + Camelot + estrutura de cada faixa. Esta ordem é o ponto de partida
e você DEVE RESPEITÁ-LA.

Se você identificar uma ordem MELHOR, você PODE reordenar — MAS APENAS se:
- A mudança melhorar o score médio de compatibilidade
- Você EXPLICAR na "analysis" por que a ordem original não era ideal

NÃO reordene por preferência subjetiva. NÃO invente ordem aleatória.
NÃO descarte faixas.

Regras técnicas que você DEVE respeitar:
- BPM: diferença entre faixas consecutivas ≤ ±3 BPM (ideal) ou ±6 (aceitável)
- Tom (Camelot): priorize mesmo código, adjacentes mesma letra, ou mesmo número
- Energia: respeite a curva solicitada

Retorne APENAS um JSON válido no formato:
{
  "setlist": [
    {
      "position": 1,
      "title": "Nome EXATO da música (copie da lista)",
      "artist": "Artista",
      "bpm": 128,
      "key": "8A",
      "energy": 7,
      "transitionNote": "Nota prática sobre como mixar para a próxima faixa (ex: 'solte no breakdown, crossfade de 16 barras, corta o kick aos 4:30')"
    }
  ],
  "analysis": "Análise geral do setlist em 2-3 frases, explicando as escolhas harmônicas e se você manteve ou alterou a ordem pré-calculada (e por quê)",
  "djTip": "Dica prática de DJ: efeito, EQ, técnica de mixagem para este set específico",
  "peakMoment": "Descrição do momento de pico do set (qual faixa, qual minuto aproximado)"
}`

    const userPrompt = `Contexto do set:
- Tipo de evento: ${config.eventType}
- Duração: ${config.duration}
- Curva de energia: ${config.energyCurve}
- Público: ${config.audience || 'Não especificado'}

⚠️ ORDEM PRÉ-CALCULADA PELO ALGORITMO (mantenha esta ordem, salvo se tiver motivo forte):

${orderedList}

Total: ${tracks.length} faixas.

Sua tarefa:
1. Confirme a ordem acima (ou justifique uma alteração se necessário)
2. Para cada transição, escreva uma "transitionNote" prática de DJ
3. Escreva a "analysis" geral (mencionando se manteve a ordem)
4. Escreva o "djTip" e o "peakMoment"

Retorne APENAS o JSON no formato especificado.`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    console.log(`[OpenRouter] Iniciando geração com modelo: ${MODEL}`)
    const startTime = Date.now()

    let completion
    try {
      completion = await openai.chat.completions.create(
        {
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.5,
          max_tokens: 8192,
        } as any,
        { signal: controller.signal }
      )
    } catch (err) {
      const errName = (err as any)?.name
      const errStatus = (err as any)?.status

      if (errName === 'AbortError' || errName === 'APIUserAbortError') {
        return NextResponse.json(
          { error: `O modelo demorou mais de ${TIMEOUT_MS / 1000}s. Tente de novo ou reduza o número de faixas.` },
          { status: 504 }
        )
      }

      // 429 vira 503 (retry) em vez de 500 (erro fatal)
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

    // 🔑 REINJEÇÃO DE IDs
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
        tracks: {
          create: parsed.setlist.map((t: any, i: number) => ({
            position: i + 1,
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