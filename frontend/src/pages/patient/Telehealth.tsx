import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { telehealthApi } from '../../api/client'
import type { TelehealthSessionStatus } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Badge, Button, Card } from '../../components/ui'
import { PageTitle } from '../../components/ui'

function sessionStatusTone(s: TelehealthSessionStatus): 'ok' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (s === 'live') return 'ok'
  if (s === 'ready') return 'warn'
  if (s === 'patient_joined' || s === 'provider_joined') return 'info'
  if (s === 'ended' || s === 'expired') return 'bad'
  return 'neutral'
}

export function PatientTelehealth() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const { data: sessions } = useQuery({
    queryKey: ['telehealth', 'sessions', token],
    queryFn: () => telehealthApi.list(token!),
    enabled: !!token,
  })

  const logJoin = useMutation({
    mutationFn: (sessionId: number) =>
      telehealthApi.logActivity(token!, sessionId, { action: 'patient_join_clicked' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telehealth', 'sessions'] }),
  })

  return (
    <div className="th-page">
      <PageTitle
        kicker="Patient"
        title="Telehealth"
        subtitle="Join visits from encrypted links issued by your care team."
      />
      <div className="th-stack">
        {sessions?.map((s) => (
          <Card key={s.id} className="th-session-card">
            <div className="th-session-row">
              <div>
                <strong>Session #{s.id}</strong>
                <p className="th-muted">
                  Appointment #{s.appointment_id} ·{' '}
                  <Badge tone={sessionStatusTone(s.status)}>{s.status}</Badge>
                </p>
              </div>
              <div className="th-session-actions">
                <Link to={`/meeting?session=${s.id}`} className="th-link-btn">
                  Open video & chat
                </Link>
                <a href={s.secure_join_url} target="_blank" rel="noreferrer" className="th-link-btn">
                  Open invite link
                </a>
                <Button variant="ghost" onClick={() => logJoin.mutate(s.id)}>
                  Log join (audit)
                </Button>
              </div>
            </div>
            <details className="th-details">
              <summary>Activity log</summary>
              <pre className="th-json">{JSON.stringify(s.activity_log, null, 2)}</pre>
            </details>
          </Card>
        ))}
        {!sessions?.length ? (
          <Card>
            <p className="th-muted">
              No telehealth sessions yet. When your provider approves your visit, a telehealth room appears here.
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
