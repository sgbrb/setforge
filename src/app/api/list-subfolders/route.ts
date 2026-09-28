import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'

/**
 * GET /api/list-subfolders
 *
 * Lê a pasta base (definida em SETFORGE_EXPORT_PATH) e retorna
 * a lista de subpastas (ex: 130, 131, 132).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const basePath = process.env.SETFORGE_EXPORT_PATH
    if (!basePath) {
      return NextResponse.json(
        { error: 'SETFORGE_EXPORT_PATH não configurada no .env.local' },
        { status: 500 }
      )
    }

    // Verifica se a pasta base existe
    try {
      await fs.access(basePath)
    } catch {
      return NextResponse.json(
        { error: `Pasta não encontrada: ${basePath}` },
        { status: 404 }
      )
    }

    // Lê o conteúdo
    const entries = await fs.readdir(basePath, { withFileTypes: true })

    // Filtra só pastas
    const folders = entries
      .filter(e => e.isDirectory())
      .map(e => ({
        name: e.name,
        path: path.join(basePath, e.name),
      }))
      .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))

    return NextResponse.json({
      basePath,
      folders,
    })
  } catch (error) {
    console.error('[api/list-subfolders] Erro:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return NextResponse.json(
      { error: `Erro ao listar subpastas: ${message}` },
      { status: 500 }
    )
  }
}