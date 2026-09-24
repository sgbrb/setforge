import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Agent, setGlobalDispatcher } from 'undici'

/**
 * POST → recebe um arquivo, cria um job no Python e retorna { job_id }
 * GET  → consulta o status do job no Python (chamado em polling pelo front)
 *
 * 🆕 Keep-alive: reutiliza conexões TCP em vez de abrir uma nova a cada poll.
 *    O Windows só tem 16384 portas efêmeras (49152-65535) e cada conexão fechada
 *    fica 120s em TIME_WAIT. Sem keep-alive, o polling esgota as portas e
 *    requests novos falham com EADDRINUSE.
 *
 * 🆕 Retry com backoff pra sobreviver a EADDRINUSE / ECONNREFUSED transitório
 *    (o Flask no Windows fica "surdo" por alguns ms enquanto o analyze() segura o GIL)
 */

// 🆕 keep-alive global — vale pra TODOS os fetch do processo Next.js, não só este arquivo.
setGlobalDispatcher(new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connections: 10,
}))

const PYTHON_BASE = 'http://127.0.0.1:8000'
const MAX_RETRIES = 4              // 1 tentativa + 3 retries
const RETRY_DELAYS_MS = [300, 800, 2000]  // backoff progressivo

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Faz fetch com retry em erros de rede transitórios.
 * NÃO faz retry em respostas HTTP com status (4xx/5xx do Flask) —
 * só em falhas de conexão (fetch lança TypeError).
 */
async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  label = 'fetch'
): Promise<Response> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, init)
      return res
    } catch (err) {
      lastError = err
      const isRetryable =
        err instanceof TypeError || // fetch failed (EADDRINUSE, ECONNREFUSED, etc)
        (err as any)?.cause?.code === 'EADDRINUSE' ||
        (err as any)?.cause?.code === 'ECONNREFUSED' ||
        (err as any)?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'

      if (!isRetryable || attempt === MAX_RETRIES) {
        throw err
      }

      const delay = RETRY_DELAYS_MS[attempt] ?? 2000
      console.warn(
        `[analyze-track] ${label} tentativa ${attempt + 1} falhou (${(err as any)?.cause?.code ?? 'network'}), retry em ${delay}ms...`
      )
      await sleep(delay)
    }
  }

  throw lastError
}

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

    console.log(
      `[analyze-track] POST "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB) para o Python...`
    )

    const pythonRes = await fetchWithRetry(
      `${PYTHON_BASE}/analyze`,
      { method: 'POST', body: pythonFormData },
      'POST'
    )

    if (!pythonRes.ok) {
      const errorBody = await pythonRes.text().catch(() => '')
      console.error(
        `[analyze-track] Python respondeu ${pythonRes.status}:`,
        errorBody.slice(0, 200)
      )
      return NextResponse.json(
        { error: `Erro no serviço de análise: ${pythonRes.status}` },
        { status: 502 }
      )
    }

    const data = await pythonRes.json()
    console.log(`[analyze-track] Job criado: ${data.job_id}`)

    return NextResponse.json(data)
  } catch (error) {
    console.error('[analyze-track] Erro no POST (após retries):', error)
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
    const pythonRes = await fetchWithRetry(
      `${PYTHON_BASE}/analyze-status/${jobId}`,
      undefined,
      'GET'
    )

    if (!pythonRes.ok) {
      return NextResponse.json(
        { error: `Job não encontrado ou erro: ${pythonRes.status}` },
        { status: pythonRes.status === 404 ? 404 : 502 }
      )
    }

    const data = await pythonRes.json()

    if (data.status === 'done' || data.status === 'error') {
      console.log(`[analyze-track] Status do job ${jobId.slice(0, 8)}: ${data.status}`)
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[analyze-track] Erro no GET (após retries):', error)
    return NextResponse.json(
      { error: 'Erro ao consultar job' },
      { status: 500 }
    )
  }
}