'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao criar conta')
        return
      }

      router.push('/login?registered=true')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #7c5cfc, #c45cfc)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: '#fff', fontSize: 18, margin: '0 auto 16px', boxShadow: '0 0 24px rgba(124,92,252,0.3)' }}>
            SF
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Criar conta</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Comece a montar set lists com IA</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 6 }}>nome</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              minLength={2}
              placeholder="Seu nome"
              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'inherit', fontSize: 14, padding: '10px 14px', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 6 }}>email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="seu@email.com"
              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'inherit', fontSize: 14, padding: '10px 14px', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 6 }}>senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontFamily: 'inherit', fontSize: 14, padding: '10px 14px', outline: 'none' }}
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(252,92,92,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #7c5cfc, #c45cfc)', color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, marginTop: 4 }}
          >
            {loading ? 'criando...' : 'criar conta'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginTop: 20 }}>
          Já tem conta? <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Entrar</Link>
        </p>
      </div>
    </div>
  )
}