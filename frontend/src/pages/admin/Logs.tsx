import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Card } from '../../components/ui'
import { PageTitle } from '../../components/ui'

export function AdminLogs() {
  const { token } = useAuth()
  const { data } = useQuery({
    queryKey: ['admin', 'logs', token],
    queryFn: () => adminApi.logs(token!),
    enabled: !!token,
  })

  return (
    <div className="th-page">
      <PageTitle
        kicker="Administration"
        title="Audit & logs"
        subtitle="HIPAA-aligned logging pipeline — backend placeholder until SIEM wiring."
      />
      <Card>
        <p>{data?.message}</p>
        <pre className="th-json">{JSON.stringify(data?.entries ?? [], null, 2)}</pre>
      </Card>
    </div>
  )
}
