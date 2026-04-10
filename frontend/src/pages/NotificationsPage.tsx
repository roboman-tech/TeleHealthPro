import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { notificationsApi } from '../api/client'
import type { UserNotification } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Badge, Button, Card, PageTitle } from '../components/ui'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function typeTone(t: string): 'ok' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (t.includes('approved') || t.includes('completed')) return 'ok'
  if (t.includes('booked')) return 'info'
  if (t.startsWith('telehealth')) return 'info'
  return 'neutral'
}

function NotificationActions({
  n,
  token,
  role,
}: {
  n: UserNotification
  token: string
  role: string
}) {
  const qc = useQueryClient()
  const markOne = useMutation({
    mutationFn: () => notificationsApi.markRead(token, n.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
  const apptPath =
    role === 'patient'
      ? '/patient/appointments'
      : role === 'provider'
        ? '/provider/appointments'
        : '/admin'
  const meetingPath = n.session_id ? `/meeting?session=${n.session_id}` : null
  return (
    <div className="th-notification-actions">
      {n.appointment_id ? (
        <Link to={apptPath} className="th-link-quiet">
          Appointments
        </Link>
      ) : null}
      {meetingPath && (role === 'patient' || role === 'provider') ? (
        <Link to={meetingPath} className="th-link-quiet">
          Meeting
        </Link>
      ) : null}
      {!n.read_at ? (
        <Button variant="ghost" type="button" disabled={markOne.isPending} onClick={() => markOne.mutate()}>
          Mark read
        </Button>
      ) : null}
    </div>
  )
}

export function NotificationsPage() {
  const { token, user } = useAuth()
  const qc = useQueryClient()
  const [unreadOnly, setUnreadOnly] = useState(false)

  const { data: items, isLoading } = useQuery({
    queryKey: ['notifications', 'list', token, unreadOnly],
    queryFn: () => notificationsApi.list(token!, { unread_only: unreadOnly, limit: 100 }),
    enabled: !!token,
  })

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(token!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  if (!token || !user) return null

  return (
    <div className="th-page">
      <PageTitle
        kicker="Inbox"
        title="Notifications"
        subtitle="Appointment and telehealth alerts are saved here when you are offline or dismiss toasts."
      />
      <Card className="th-mb th-notification-toolbar">
        <label className="th-notification-filter">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          Unread only
        </label>
        <Button variant="ghost" type="button" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
          Mark all read
        </Button>
      </Card>
      {isLoading ? <p className="th-muted">Loading…</p> : null}
      <ul className="th-notification-list">
        {items?.map((n) => (
          <li
            key={n.id}
            className={`th-notification-item ${n.read_at ? 'th-notification-item--read' : ''}`}
          >
            <div className="th-notification-head">
              <Badge tone={typeTone(n.type)}>{n.type}</Badge>
              <span className="th-muted th-notification-time">{fmt(n.created_at)}</span>
            </div>
            <strong className="th-notification-title">{n.title}</strong>
            {n.body ? <p className="th-notification-body">{n.body}</p> : null}
            <NotificationActions n={n} token={token} role={user.role} />
          </li>
        ))}
      </ul>
      {!isLoading && !items?.length ? <p className="th-muted">No notifications yet.</p> : null}
    </div>
  )
}
