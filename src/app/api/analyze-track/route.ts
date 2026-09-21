import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * POST → recebe um arquivo, cria um job no Python e retorna { job_id }
 * GET  → consulta o status do job no Python (chamado em polling pelo front)
 */

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
    }

    const pythonFormData = new FormData()
    pythonFormData.append('file', file)

    console.log(`[analyze-track] POST "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB) para o Python...`)

    const pythonRes = await fetch('http://127.0.0.1:8000/analyze', {
      method: 'POST',
      body: pythonFormData,
    })

    if (!pythonRes.ok) {
      const errorBody = await pythonRes.text().catch(() => '')
      console.error(`[analyze-track] Python respondeu ${pythonRes.status}:`, errorBody.slice(0, 200))
      return NextResponse.json(
        { error: `Erro no serviço de análise: ${pythonRes.status}` },
        { status: 502 }
      )
    }

    const data = await pythonRes.json()
    console.log(`[analyze-track] Job criado: ${data.job_id}`)

    return NextResponse.json(data)
  } catch (error) {
    console.error('[analyze-track] Erro no POST:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return NextResponse.json(
      { error: `Erro ao criar job: ${message}` },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'jobId não fornecido' }, { status: 400 })
  }

  try {
    const pythonRes = await fetch(`http://127.0.0.1:8000/analyze-status/${jobId}`)

    if (!pythonRes.ok) {
      return NextResponse.json(
        { error: `Job não encontrado ou erro: ${pythonRes.status}` },
        { status: pythonRes.status === 404 ? 404 : 502 }
      )
    }

    const data = await pythonRes.json()

    // Log só quando muda de estado ou termina (pra não poluir)
    if (data.status === 'done' || data.status === 'error') {
      console.log(`[analyze-track] Status do job ${jobId.slice(0, 8)}: ${data.status}`)
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[analyze-track] Erro no GET:', error)
    return NextResponse.json(
      { error: 'Erro ao consultar job' },
      { status: 500 }
    )
  }
}