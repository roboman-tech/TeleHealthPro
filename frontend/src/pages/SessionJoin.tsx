import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { telehealthApi } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card } from '../components/ui'

export function SessionJoin() {
  const [params] = useSearchParams()
  const t = params.get('t')
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  const { data: session, error } = useQuery({
    queryKey: ['telehealth', 'resolve', token, t],
    queryFn: () => telehealthApi.resolve(token!, t!),
    enabled: !!token && !!t,
    retry: false,
  })

  const log = useMutation({
    mutationFn: () =>
      session
        ? telehealthApi.logActivity(token!, session.id, { action: 'session_ready' })
        : Promise.reject(),
  })

  if (!t) {
    return (
      <div className="th-auth-page">
        <Card>
          <p>Missing session token. Ask your provider for a new link.</p>
          <Link to="/">Home</Link>
        </Card>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="th-auth-page">
        <Card>
          <h2>Sign in to continue</h2>
          <p className="th-sub">Your telehealth link is valid after authentication.</p>
          <Link to="/login" state={{ from: { pathname: `/session?t=${encodeURIComponent(t)}` } }}>
            <Button>Go to sign in</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="th-page th-page--narrow">
      <Card glow className="th-join-card">
        <h1>Virtual visit</h1>
        <p className="th-sub">
          Signed in as <strong>{user?.full_name}</strong>
        </p>
        {error ? (
          <p className="th-error">{(error as Error).message}</p>
        ) : session ? (
          <>
            <p className="th-join-ready">Session #{session.id} is ready.</p>
            <p className="th-sub th-mt">
              Video uses Jitsi Meet (browser may ask for camera and microphone). Text chat runs inside this app so you
              can coordinate with your provider in the same visit.
            </p>
            <div className="th-join-actions">
              <Button variant="primary" className="th-link-btn--lg" onClick={() => navigate(`/meeting?session=${session.id}`)}>
                Join video & chat room
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(session.secure_join_url).then(() => {
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 2000)
                  })
                }}
              >
                {copied ? 'Invite link copied' : 'Copy invite link'}
              </Button>
              <Button variant="ghost" onClick={() => log.mutate()} disabled={log.isPending}>
                Emit audit heartbeat
              </Button>
            </div>
            <details className="th-details">
              <summary>Technical details</summary>
              <pre className="th-json">{JSON.stringify(session, null, 2)}</pre>
            </details>
          </>
        ) : (
          <p className="th-muted">Resolving session…</p>
        )}
      </Card>
    </div>
  )
}
