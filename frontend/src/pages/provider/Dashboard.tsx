import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { appointmentsApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Card } from '../../components/ui'
import { PageTitle } from '../../components/ui'

export function ProviderDashboard() {
  const { token } = useAuth()
  const { data: appts } = useQuery({
    queryKey: ['appointments', 'mine', token],
    queryFn: () => appointmentsApi.mine(token!),
    enabled: !!token,
  })
  const pending = appts?.filter((a) => a.status === 'pending').length ?? 0
  const scheduled =
    appts?.filter((a) => a.status === 'pending' || a.status === 'approved').length ?? 0
  const completed = appts?.filter((a) => a.status === 'completed').length ?? 0
  const canceled =
    appts?.filter((a) => a.status === 'cancelled' || a.status === 'rejected').length ?? 0
  const total = appts?.length ?? 0

  return (
    <div className="th-page">
      <PageTitle
        kicker="Provider"
        title="Clinical workspace"
        subtitle="Triage bookings, open charts, and launch telehealth sessions."
      />
      <p className="th-muted th-mb th-stat-summary">
        Calendar totals: <strong>{total}</strong> appointment{total === 1 ? '' : 's'} (scheduled + completed +
        canceled).
      </p>
      <div className="th-metrics">
        <Card>
          <span className="th-stat-label">Pending approvals</span>
          <strong className="th-stat-val">{pending}</strong>
        </Card>
        <Card>
          <span className="th-stat-label">Scheduled</span>
          <strong className="th-stat-val">{scheduled}</strong>
          <span className="th-stat-hint">Pending + approved</span>
        </Card>
        <Card>
          <span className="th-stat-label">Completed</span>
          <strong className="th-stat-val">{completed}</strong>
        </Card>
        <Card>
          <span className="th-stat-label">Canceled</span>
          <strong className="th-stat-val">{canceled}</strong>
          <span className="th-stat-hint">Cancelled + rejected</span>
        </Card>
      </div>
      <div className="th-stat-row">
        <Card>
          <span className="th-stat-label">Go to</span>
          <div className="th-shortcuts">
            <Link to="/provider/appointments">Appointments</Link>
            <Link to="/provider/patients">Patient charts</Link>
            <Link to="/provider/fhir">FHIR explorer</Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
