import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card } from '../components/ui'

export function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'patient' | 'provider'>('patient')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await register({
        email,
        password,
        full_name: fullName,
        role,
        date_of_birth: role === 'patient' ? dateOfBirth : undefined,
        pronouns: role === 'patient' ? pronouns : undefined,
        note: role === 'patient' ? note : undefined,
      })
      navigate('/login', { replace: true })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Registration failed')
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
        <h2>Create your profile</h2>
        <p className="th-sub">Providers require admin approval before sign-in.</p>
        <form onSubmit={onSubmit} className="th-form">
          <label>
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          {role === 'patient' ? (
            <>
              <label>
                Date of birth
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  required
                />
              </label>
              <label>
                Pronouns
                <input
                  value={pronouns}
                  onChange={(e) => setPronouns(e.target.value)}
                  placeholder="e.g. she/her, he/him, they/them"
                  required
                />
              </label>
              <label>
                Note (optional)
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
              </label>
            </>
          ) : null}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password (min 8 characters)
            <input
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="th-label-row">
            I am a
            <select value={role} onChange={(e) => setRole(e.target.value as 'patient' | 'provider')}>
              <option value="patient">Patient</option>
              <option value="provider">Provider (doctor / nurse)</option>
            </select>
          </label>
          {err ? <p className="th-error">{err}</p> : null}
          <Button type="submit" disabled={busy} className="th-btn-block">
            {busy ? 'Creating…' : 'Register'}
          </Button>
        </form>
        <p className="th-auth-footer">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </Card>
    </div>
  )
}
