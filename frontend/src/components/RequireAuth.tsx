import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { UserRole } from '../api/types'

export function RequireAuth({ roles }: { roles?: UserRole[] }) {
  const { user, loading } = useAuth()
  const loc = useLocation()

  if (loading) {
    return (
      <div className="th-loading">
        <div className="th-spinner" />
        <p>Loading…</p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: loc }} replace />
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
