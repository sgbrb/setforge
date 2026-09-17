import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Track, SetConfig, GeneratedSetlist } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const body = await req.json() as { tracks: Track[]; config: SetConfig }
  const { tracks, config } = body

  if (!tracks?.length || tracks.length < 3) {
    return NextResponse.json({ error: 'Mínimo de 3 faixas necessário' }, { status: 400 })
  }

  const trackList = tracks.map((t, i) =>
    `${i + 1}. "${t.title}" — ${t.artist} | BPM: ${t.bpm} | Tom: ${t.key || 'N/A'} | Energia: ${t.energy}/10`
  ).join('\n')

  const prompt = `Você é um DJ profissional especialista em programação de set lists.

Contexto do set:
- Evento: ${config.eventType}
- Duração: ${config.duration}
- BPM alvo: ${config.targetBpm}
- Curva de energia: ${config.energyCurve}
- Público: ${config.audience || 'não especificado'}

Biblioteca disponível:
${trackList}

Regras de ordenação:
1. Respeite a curva de energia desejada
2. Variação máxima de 8 BPM entre faixas consecutivas (exceto breaks intencionais)
3. Prefira tons harmonicamente compatíveis entre faixas consecutivas
4. Não use todas as músicas se não fizerem sentido para o set

Responda APENAS em JSON válido:
{
  "setlist": [
    {
      "position": 1,
      "title": "título exato como na lista",
      "artist": "artista",
      "bpm": 128,
      "key": "Am",
      "energy": 7,
      "transitionNote": "nota sobre transição para próxima (máx 60 chars)"
    }
  ],
  "totalDuration": "estimativa",
  "analysis": "análise em 2-3 frases",
  "peakMoment": "título do pico do set",
  "djTip": "dica profissional específica"
}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content.map(c => (c.type === 'text' ? c.text : '')).join('')
  const clean = raw.replace(/```json|```/g, '').trim()
  const setlist = JSON.parse(clean) as GeneratedSetlist

  return NextResponse.json(setlist)
}
