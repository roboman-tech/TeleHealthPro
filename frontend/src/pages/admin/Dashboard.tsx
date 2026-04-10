import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { adminApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Card } from '../../components/ui'
import { PageTitle } from '../../components/ui'

export function AdminDashboard() {
  const { token } = useAuth()
  const { data: m } = useQuery({
    queryKey: ['admin', 'metrics', token],
    queryFn: () => adminApi.metrics(token!),
    enabled: !!token,
  })
  const { data: ops } = useQuery({
    queryKey: ['admin', 'ops', token],
    queryFn: () => adminApi.opsSummary(token!),
    enabled: !!token,
  })

  return (
    <div className="th-page">
      <PageTitle
        kicker="Administration"
        title="Operations overview"
        subtitle="Population health signals sourced live from PostgreSQL."
      />
      <div className="th-metrics">
        <Card glow>
          <span className="th-stat-label">Patients</span>
          <strong className="th-stat-val">{m?.active_patients ?? '—'}</strong>
        </Card>
        <Card glow>
          <span className="th-stat-label">Approved providers</span>
          <strong className="th-stat-val">{m?.active_providers ?? '—'}</strong>
        </Card>
        <Card glow>
          <span className="th-stat-label">Appointments (all time)</span>
          <strong className="th-stat-val">{m?.appointments_total ?? '—'}</strong>
        </Card>
        <Card glow>
          <span className="th-stat-label">This week</span>
          <strong className="th-stat-val">{m?.appointments_this_week ?? '—'}</strong>
        </Card>
        <Card glow>
          <span className="th-stat-label">Telehealth sessions</span>
          <strong className="th-stat-val">{m?.telehealth_sessions_total ?? '—'}</strong>
        </Card>
      </div>
      <Card>
        <h3>Admin workflows</h3>
        <div className="th-shortcuts">
          <Link to="/admin/users">User directory & approvals</Link>
          <Link to="/admin/logs">Audit & logs</Link>
        </div>
      </Card>
      <Card className="th-mt">
        <h3>Operational alerts</h3>
        <div className="th-metrics">
          <Card>
            <span className="th-stat-label">Stuck in progress</span>
            <strong className="th-stat-val">{ops?.stuck_appointments_in_progress ?? '—'}</strong>
          </Card>
          <Card>
            <span className="th-stat-label">Ready sessions too long</span>
            <strong className="th-stat-val">{ops?.stuck_sessions_ready ?? '—'}</strong>
          </Card>
          <Card>
            <span className="th-stat-label">Failed notification pushes</span>
            <strong className="th-stat-val">{ops?.failed_notification_pushes ?? '—'}</strong>
          </Card>
          <Card>
            <span className="th-stat-label">Providers not bookable</span>
            <strong className="th-stat-val">{ops?.providers_not_bookable ?? '—'}</strong>
          </Card>
        </div>
      </Card>
    </div>
  )
}
