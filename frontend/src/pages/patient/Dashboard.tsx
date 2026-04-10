import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { appointmentsApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Card, PageTitle } from '../../components/ui'

export function PatientDashboard() {
  const { token } = useAuth()
  const { data: appts } = useQuery({
    queryKey: ['appointments', 'mine', token],
    queryFn: () => appointmentsApi.mine(token!),
    enabled: !!token,
  })
  const now = Date.now()
  const upcoming =
    appts?.filter((a) => {
      // Upcoming = not finished/cancelled AND ends in the future
      if (a.status === 'completed' || a.status === 'cancelled' || a.status === 'rejected') return false
      return new Date(a.end_at).getTime() >= now
    }) ?? []
  const pending = upcoming.filter((a) => a.status === 'pending').length

  return (
    <div className="th-page">
      <PageTitle
        kicker="Patient"
        title="Your care hub"
        subtitle="Records, visits, and telehealth in one calm surface."
      />
      <div className="th-stat-row">
        <Card>
          <span className="th-stat-label">Upcoming visits</span>
          <strong className="th-stat-val">{upcoming.length}</strong>
        </Card>
        <Card>
          <span className="th-stat-label">Awaiting confirmation</span>
          <strong className="th-stat-val">{pending}</strong>
        </Card>
        <Card>
          <span className="th-stat-label">Shortcuts</span>
          <div className="th-shortcuts">
            <Link to="/patient/appointments">Book a visit</Link>
            <Link to="/patient/records">View records</Link>
            <Link to="/patient/telehealth">Telehealth</Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
