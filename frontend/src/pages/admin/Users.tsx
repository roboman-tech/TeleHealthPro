import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Badge, Button, Card } from '../../components/ui'
import { PageTitle } from '../../components/ui'

export function AdminUsers() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const { data: users } = useQuery({
    queryKey: ['admin', 'users', token],
    queryFn: () => adminApi.users(token!),
    enabled: !!token,
  })

  const approve = useMutation({
    mutationFn: (id: number) => adminApi.approveProvider(token!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  const patch = useMutation({
    mutationFn: (u: { id: number; is_active?: boolean; is_provider_approved?: boolean; provider_readiness?: string | null }) =>
      adminApi.updateUser(token!, u.id, {
        is_active: u.is_active,
        is_provider_approved: u.is_provider_approved,
        provider_readiness: u.provider_readiness,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  return (
    <div className="th-page">
      <PageTitle kicker="Administration" title="Users" subtitle="Govern access and onboard clinicians." />
      <div className="th-table-wrap">
        <table className="th-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td>
                  <Badge tone="info">{u.role}</Badge>
                </td>
                <td>
                  {u.is_active ? <Badge tone="ok">active</Badge> : <Badge tone="bad">disabled</Badge>}
                  {u.role === 'provider' ? (
                    u.is_provider_approved ? (
                      <Badge tone="ok">approved</Badge>
                    ) : (
                      <Badge tone="warn">pending</Badge>
                    )
                  ) : null}
                  {u.role === 'provider' && u.provider_readiness ? (
                    <Badge tone={u.provider_readiness === 'bookable' ? 'ok' : 'info'}>{u.provider_readiness}</Badge>
                  ) : null}
                </td>
                <td className="th-actions-cell">
                  <div className="th-actions">
                    {u.role === 'provider' && !u.is_provider_approved ? (
                      <Button variant="accent" onClick={() => approve.mutate(u.id)}>
                        Approve provider
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={() => patch.mutate({ id: u.id, is_active: !u.is_active })}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users?.length ? <p className="th-muted th-pad">No users.</p> : null}
      </div>
      <Card className="th-mt">
        <p className="th-muted">
          Django Admin remains optional — this React surface calls the same FastAPI RBAC endpoints.
        </p>
      </Card>
    </div>
  )
}
