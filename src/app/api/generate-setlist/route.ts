import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Track, SetConfig } from '@/lib/types'

// Cliente OpenRouter (compatível com OpenAI SDK)
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

// ⏱ Timeout de segurança: se o modelo não responder em 90s, cancela
const TIMEOUT_MS = 90_000

interface GenerateRequest {
  tracks: Track[]
  config: SetConfig
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

    // Prompt para o modelo
    const systemPrompt = `Você é um DJ profissional e curador musical com décadas de experiência.
Sua tarefa é criar um setlist harmônico e tecnicamente viável.

Regras que você DEVE seguir:
1. BPM: A diferença entre faixas consecutivas deve ser de no máximo ±3 BPM (ideal) ou ±6 BPM (aceitável).
2. Tom (Camelot): Priorize transições entre:
   - Mesmo código Camelot (ex: 8A → 8A) — match perfeito
   - Números adjacentes, mesma letra (ex: 8A → 9A ou 7A) — muito suave
   - Mesmo número, letra diferente (ex: 8A → 8B) — muda o humor
3. Curva de energia: Respeite a curva solicitada no contexto.
4. Duração: Calcule a duração aproximada do set.

Retorne APENAS um JSON válido no formato:
{
  "setlist": [
    {
      "position": 1,
      "title": "Nome da música",
      "artist": "Artista",
      "bpm": 128,
      "key": "8A",
      "energy": 7,
      "transitionNote": "Nota sobre a transição para a próxima faixa"
    }
  ],
  "analysis": "Análise geral do setlist explicando as escolhas harmônicas",
  "djTip": "Dica prática de DJ para este set",
  "peakMoment": "Descrição do momento de pico do set"
}`

    const userPrompt = `Contexto do set:
- Tipo de evento: ${config.eventType}
- Duração: ${config.duration}
- Curva de energia: ${config.energyCurve}
- Público: ${config.audience || 'Não especificado'}

Faixas disponíveis na biblioteca do DJ (${tracks.length} faixas):
${tracks.map((t, i) => `${i + 1}. "${t.title}" — ${t.artist} (BPM: ${t.bpm || '?'}, Tom: ${t.key || '?'}, Energia: ${t.energy}/10)`).join('\n')}

Monte o melhor setlist possível usando essas faixas, respeitando as regras de compatibilidade harmônica (BPM e Camelot).`

    // 🎯 Modelo fixo em vez do roteador aleatório
    // 'google/gemini-2.0-flash-exp:free' é rápido, confiável e gratuito
    const MODEL = 'cohere/north-mini-code:free'

    // ⏱ Timeout via AbortController
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
          temperature: 0.7,
          max_tokens: 8192,
          response_format: { type: 'json_object' },
        },
        { signal: controller.signal }
      )
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new Error(`O modelo demorou mais de ${TIMEOUT_MS / 1000}s para responder. Tente de novo.`)
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
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
      throw new Error(
        `Resposta vazia do modelo (finish: ${finishReason}). Tente novamente.`
      )
    }

    // Extrai JSON da resposta (o modelo pode envolver em ```json ... ```)
    let cleanJson = responseText.trim()
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    // Diagnóstico de tamanho
    console.log(`[SetForge] JSON limpo: ${cleanJson.length} chars`)
    console.log(`[SetForge] Últimos 200 chars: ${cleanJson.slice(-200)}`)

    let parsed
    try {
      parsed = JSON.parse(cleanJson)
    } catch (parseError) {
      // Tentativa de reparo: extrai o primeiro { até o último }
      const firstBrace = cleanJson.indexOf('{')
      const lastBrace = cleanJson.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const extracted = cleanJson.slice(firstBrace, lastBrace + 1)
        try {
          parsed = JSON.parse(extracted)
          console.log('[SetForge] JSON reparado com sucesso')
        } catch {
          throw new Error(
            `JSON inválido do modelo (${cleanJson.length} chars). ` +
            `Resposta foi truncada — tente de novo ou reduza o número de faixas.`
          )
        }
      } else {
        throw parseError
      }
    }

    // Salva no banco
    const setlist = await prisma.setlist.create({
      data: {
        name: `Set ${config.eventType} - ${new Date().toLocaleDateString('pt-BR')}`,
        eventType: config.eventType,
        duration: config.duration,
        energyCurve: config.energyCurve,
        audience: config.audience,
        analysis: parsed.analysis,
        djTip: parsed.djTip,
        peakMoment: parsed.peakMoment,
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
      ...parsed,
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