import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet } from 'react-router-dom'
import { notificationsApi } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from './ui'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `th-navlink ${isActive ? 'th-navlink--active' : ''}`.trim()

export function AppShell({
  nav,
  kicker,
}: {
  nav: {
    to: string
    label: string
    icon: string
    end?: boolean
    badge?: 'unread-notifications'
  }[]
  kicker: string
}) {
  const { user, logout, token } = useAuth()
  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread', token],
    queryFn: () => notificationsApi.unreadCount(token!),
    enabled: !!token && nav.some((n) => n.badge === 'unread-notifications'),
    staleTime: 30_000,
  })
  return (
    <div className="th-shell">
      <aside className="th-sidebar">
        <div className="th-brand">
          <span className="th-brand-mark" aria-hidden />
          <div>
            <strong>TeleHealthPro</strong>
            <span className="th-brand-sub">{kicker}</span>
          </div>
        </div>
        <nav className="th-side-nav">
          {nav.map((n) => {
            const showBadge =
              n.badge === 'unread-notifications' && unread && unread.count > 0 ? unread.count : null
            return (
              <NavLink key={n.to} to={n.to} className={linkClass} end={Boolean(n.end)}>
                <span className="th-nav-ico" aria-hidden>
                  {n.icon}
                </span>
                <span className="th-nav-label-wrap">
                  {n.label}
                  {showBadge != null ? (
                    <span className="th-nav-badge" aria-label={`${showBadge} unread`}>
                      {showBadge > 99 ? '99+' : showBadge}
                    </span>
                  ) : null}
                </span>
              </NavLink>
            )
          })}
        </nav>
        <div className="th-side-foot">
          <div className="th-user-chip">
            <span className="th-user-avatar" aria-hidden>
              {user?.full_name?.charAt(0) ?? '?'}
            </span>
            <div>
              <div className="th-user-name">{user?.full_name}</div>
              <div className="th-user-email">{user?.email}</div>
            </div>
          </div>
          <Button variant="ghost" className="th-logout" onClick={() => logout()}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="th-main">
        <Outlet />
      </main>
    </div>
  )
}
