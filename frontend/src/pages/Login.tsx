import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card } from '../components/ui'
import type { UserRole } from '../api/types'

function roleHome(role: UserRole) {
  if (role === 'patient') return '/patient'
  if (role === 'provider') return '/provider'
  return '/admin'
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation() as { state?: { from?: { pathname?: string } } }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      const user = await login(email, password)
      const from = loc.state?.from?.pathname
      if (from && from !== '/login') navigate(from, { replace: true })
      else navigate(roleHome(user.role), { replace: true })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="th-auth-page">
      <div className="th-aurora th-aurora--soft" aria-hidden />
      <Card className="th-auth-card">
        <div className="th-brand-inline th-brand-inline--lg">
          <span className="th-brand-mark" />
          <span>TeleHealthPro</span>
        </div>
        <h2>Welcome back</h2>
        <p className="th-sub">Use your clinical portal credentials.</p>
        <form onSubmit={onSubmit} className="th-form">
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {err ? <p className="th-error">{err}</p> : null}
          <Button type="submit" disabled={busy} className="th-btn-block">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="th-auth-footer">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </Card>
    </div>
  )
}
