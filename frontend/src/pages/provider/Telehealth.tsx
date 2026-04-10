import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { telehealthApi } from '../../api/client'
import type { TelehealthSessionStatus } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Badge, Card } from '../../components/ui'
import { PageTitle } from '../../components/ui'

function sessionStatusTone(s: TelehealthSessionStatus): 'ok' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (s === 'live') return 'ok'
  if (s === 'ready') return 'warn'
  if (s === 'patient_joined' || s === 'provider_joined') return 'info'
  if (s === 'ended' || s === 'expired') return 'bad'
  return 'neutral'
}

export function ProviderTelehealth() {
  const { token } = useAuth()
  const { data: sessions } = useQuery({
    queryKey: ['telehealth', 'sessions', token],
    queryFn: () => telehealthApi.list(token!),
    enabled: !!token,
  })

  return (
    <div className="th-page">
      <PageTitle
        kicker="Provider"
        title="Telehealth"
        subtitle="Open the same video room and chat as your patients for each session."
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
              </div>
            </div>
          </Card>
        ))}
        {!sessions?.length ? (
          <Card>
            <p className="th-muted">
              No sessions yet. When you approve a visit in Appointments, a telehealth room is created and listed here. You
              can also open the room from Appointments with &quot;Start telehealth&quot; (that starts the visit and may
              take you to the meeting).
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
