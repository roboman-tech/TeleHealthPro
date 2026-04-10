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
      <Card className="th-mb overflow-hidden border-white/10 bg-white/[0.03] p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="th-notification-toolbar flex-wrap items-stretch gap-4 px-4 py-3.5 sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <button
              type="button"
              role="switch"
              aria-checked={unreadOnly}
              aria-label="Filter to unread notifications only"
              onClick={() => setUnreadOnly((v) => !v)}
              className={`relative h-9 w-14 shrink-0 cursor-pointer rounded-full border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1428] ${
                unreadOnly
                  ? 'border-teal-400/35 bg-teal-500/25 shadow-[0_0_20px_rgba(45,212,191,0.12)]'
                  : 'border-white/12 bg-black/30 hover:border-white/20 hover:bg-white/[0.05]'
              }`}
            >
              <span
                className={`pointer-events-none absolute top-1 left-1 h-7 w-7 rounded-full bg-gradient-to-b from-white to-slate-200 shadow-md ring-1 ring-black/15 transition-transform duration-200 ease-out ${
                  unreadOnly ? 'translate-x-5' : 'translate-x-0'
                }`}
                aria-hidden
              />
            </button>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100">Unread only</div>
              <p className="mt-0.5 text-xs leading-snug text-slate-500">
                {unreadOnly
                  ? 'Showing messages you have not marked as read.'
                  : 'Include read messages in the list below.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center border-t border-white/10 pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0">
            <Button variant="ghost" type="button" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
              Mark all read
            </Button>
          </div>
        </div>
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
