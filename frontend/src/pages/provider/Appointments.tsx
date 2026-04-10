import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { appointmentsApi, telehealthApi } from '../../api/client'
import type { Appointment, AppointmentStatus, TelehealthSession } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Badge, Button } from '../../components/ui'
import { PageTitle } from '../../components/ui'
import { toDatetimeLocalValue } from '../../utils/datetimeLocal'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function appointmentStatusTone(s: AppointmentStatus): 'ok' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (s === 'approved' || s === 'completed') return 'ok'
  if (s === 'in_progress') return 'info'
  if (s === 'pending') return 'warn'
  if (s === 'reschedule_requested') return 'warn'
  if (s === 'cancelled' || s === 'rejected') return 'bad'
  return 'neutral'
}

function ProviderRescheduleEditor({ a, token }: { a: Appointment; token: string }) {
  const qc = useQueryClient()
  const [start, setStart] = useState(() => toDatetimeLocalValue(new Date(a.start_at)))
  const [end, setEnd] = useState(() => toDatetimeLocalValue(new Date(a.end_at)))
  const patch = useMutation({
    mutationFn: (body: { status?: string; start_at?: string; end_at?: string }) =>
      appointmentsApi.patch(token, a.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', 'mine'] })
      qc.invalidateQueries({ queryKey: ['telehealth', 'sessions'] })
    },
  })
  return (
    <div className="th-provider-reschedule-panel">
      <p className="th-muted" style={{ marginTop: 0 }}>
        Adjust the slot if needed, then approve or save the proposed time while you coordinate with the patient.
      </p>
      <div className="th-form-row">
        <label>
          Start
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          End
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="th-form-row">
        <Button
          variant="accent"
          type="button"
          disabled={patch.isPending || !start || !end}
          onClick={() =>
            patch.mutate({
              status: 'approved',
              start_at: new Date(start).toISOString(),
              end_at: new Date(end).toISOString(),
            })
          }
        >
          Approve with this time
        </Button>
        <Button
          variant="ghost"
          type="button"
          disabled={patch.isPending || !start || !end}
          onClick={() =>
            patch.mutate({
              start_at: new Date(start).toISOString(),
              end_at: new Date(end).toISOString(),
            })
          }
        >
          Save time only
        </Button>
      </div>
      {patch.isError ? <p className="th-error">{(patch.error as Error).message}</p> : null}
    </div>
  )
}

function sessionIsTerminal(s: TelehealthSession) {
  return s.status === 'ended' || s.status === 'expired'
}

/** One telehealth session per appointment; do not offer “Start” if a room already exists. */
function canStartTelehealth(a: Appointment, sess: TelehealthSession | undefined) {
  if (sess != null) return false
  return (
    a.status === 'pending' || a.status === 'approved' || a.status === 'in_progress'
  )
}

/** Only offer the meeting page when the visit is still an active booking (not completed / reschedule / terminal). */
function canOpenSessionPage(a: Appointment, sess: TelehealthSession | undefined) {
  if (!sess) return false
  return a.status === 'pending' || a.status === 'approved' || a.status === 'in_progress'
}

/** Ended visits: link to meeting page for chat log / context (not an active join). */
function canViewSessionHistory(a: Appointment, sess: TelehealthSession | undefined) {
  if (!sess) return false
  return (
    a.status === 'completed' ||
    a.status === 'cancelled' ||
    a.status === 'rejected' ||
    a.status === 'no_show'
  )
}

/** Provider may cancel like a patient: removes the visit from the active schedule (row stays for history). */
function canProviderCancelVisit(a: Appointment) {
  return (
    a.status === 'pending' ||
    a.status === 'approved' ||
    a.status === 'in_progress' ||
    a.status === 'reschedule_requested'
  )
}

function providerRowHasActions(a: Appointment, sess: TelehealthSession | undefined) {
  if (a.status === 'pending' || a.status === 'reschedule_requested') return true
  if (a.status === 'approved' || a.status === 'in_progress') return true
  return (
    canStartTelehealth(a, sess) ||
    canOpenSessionPage(a, sess) ||
    canViewSessionHistory(a, sess)
  )
}

export function ProviderAppointments() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all')
  const { data: appts } = useQuery({
    queryKey: ['appointments', 'mine', token],
    queryFn: () => appointmentsApi.mine(token!),
    enabled: !!token,
  })
  const { data: sessions } = useQuery({
    queryKey: ['telehealth', 'sessions', token],
    queryFn: () => telehealthApi.list(token!),
    enabled: !!token,
  })
  const sessionByAppointment = useMemo(() => {
    const m = new Map<number, TelehealthSession>()
    sessions?.forEach((s) => m.set(s.appointment_id, s))
    return m
  }, [sessions])

  const filtered = useMemo(() => {
    if (!appts) return []
    if (statusFilter === 'all') return appts
    return appts.filter((a) => a.status === statusFilter)
  }, [appts, statusFilter])

  const patch = useMutation({
    mutationFn: (arg: { id: number; status?: string; start_at?: string; end_at?: string }) => {
      const { id, ...body } = arg
      return appointmentsApi.patch(token!, id, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', 'mine'] })
      qc.invalidateQueries({ queryKey: ['telehealth', 'sessions'] })
    },
  })

  const startSession = useMutation({
    mutationFn: (appointmentId: number) => telehealthApi.createForAppointment(token!, appointmentId),
    onSuccess: (sess) => {
      qc.invalidateQueries({ queryKey: ['telehealth', 'sessions'] })
      qc.invalidateQueries({ queryKey: ['appointments', 'mine'] })
      navigate(`/meeting?session=${sess.id}`)
    },
  })

  return (
    <div className="th-page">
      <PageTitle
        kicker="Provider"
        title="Appointments"
        subtitle="Session history opens the telehealth room log when a room exists; for completed visits without a room, that control is shown disabled."
      />
      <div className="th-form-row th-mb">
        <label>
          Filter by status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | AppointmentStatus)}
          >
            <option value="all">All</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="in_progress">in_progress</option>
            <option value="completed">completed</option>
            <option value="cancelled">cancelled</option>
            <option value="rejected">rejected</option>
            <option value="reschedule_requested">reschedule_requested</option>
            <option value="no_show">no_show</option>
          </select>
        </label>
      </div>
      <div className="th-table-wrap">
        <table className="th-table">
          <thead>
            <tr>
              <th>Schedule</th>
              <th>Patient</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const sess = sessionByAppointment.get(a.id)
              return (
                <Fragment key={a.id}>
                  <tr>
                    <td>
                      {fmt(a.start_at)} — {fmt(a.end_at)}
                    </td>
                    <td>{a.patient_name ?? `Patient #${a.patient_id}`}</td>
                    <td>
                      <Badge tone={appointmentStatusTone(a.status)}>{a.status}</Badge>
                    </td>
                    <td className="th-actions-cell">
                      <div className="th-actions">
                      {providerRowHasActions(a, sess) ? (
                        <>
                          {a.status === 'pending' || a.status === 'reschedule_requested' ? (
                            <>
                              {a.status === 'pending' ? (
                                <Button variant="accent" onClick={() => patch.mutate({ id: a.id, status: 'approved' })}>
                                  Approve
                                </Button>
                              ) : (
                                <Button variant="accent" onClick={() => patch.mutate({ id: a.id, status: 'approved' })}>
                                  Approve (keep time)
                                </Button>
                              )}
                              <Button variant="ghost" onClick={() => patch.mutate({ id: a.id, status: 'rejected' })}>
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {a.status === 'approved' ||
                          a.status === 'in_progress' ||
                          a.status === 'reschedule_requested' ? (
                            <Button variant="ghost" onClick={() => patch.mutate({ id: a.id, status: 'completed' })}>
                              Mark complete
                            </Button>
                          ) : null}
                          {a.status === 'pending' ||
                          a.status === 'approved' ||
                          a.status === 'in_progress' ? (
                            <Button variant="ghost" onClick={() => patch.mutate({ id: a.id, status: 'no_show' })}>
                              No-show
                            </Button>
                          ) : null}
                          {canStartTelehealth(a, sess) ? (
                            <Button
                              variant="primary"
                              onClick={() => startSession.mutate(a.id)}
                              disabled={startSession.isPending}
                            >
                              Start telehealth
                            </Button>
                          ) : null}
                          {canOpenSessionPage(a, sess) ? (
                            <Button
                              variant="accent"
                              onClick={() => navigate(`/meeting?session=${sess!.id}`)}
                            >
                              {sess && sessionIsTerminal(sess) ? 'View session' : 'Open meeting'}
                            </Button>
                          ) : null}
                          {canViewSessionHistory(a, sess) ? (
                            <Button
                              variant="ghost"
                              onClick={() => navigate(`/meeting?session=${sess!.id}`)}
                            >
                              Session history
                            </Button>
                          ) : null}
                          {canProviderCancelVisit(a) ? (
                            <Button
                              variant="ghost"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Cancel this visit? The slot will show as cancelled; the record is kept for history.',
                                  )
                                ) {
                                  patch.mutate({ id: a.id, status: 'cancelled' })
                                }
                              }}
                            >
                              Cancel visit
                            </Button>
                          ) : null}
                        </>
                      ) : a.status === 'completed' ? (
                        <Button
                          variant="ghost"
                          disabled
                          title="No telehealth room was created for this visit (for example, it was marked complete without starting a room)."
                          aria-label="Session history unavailable: no telehealth room for this visit"
                        >
                          Session history
                        </Button>
                      ) : (
                        <span className="th-actions-none" aria-label="No actions for this visit">
                          —
                        </span>
                      )}
                      </div>
                    </td>
                  </tr>
                  {a.status === 'reschedule_requested' && token ? (
                    <tr className="th-table-doc-row">
                      <td colSpan={4}>
                        <ProviderRescheduleEditor
                          key={`${a.id}-${a.start_at}-${a.end_at}`}
                          a={a}
                          token={token}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {!appts?.length ? <p className="th-muted th-pad">No appointments.</p> : null}
        {appts?.length && !filtered.length ? (
          <p className="th-muted th-pad">No appointments match this filter.</p>
        ) : null}
      </div>
      {patch.isError ? <p className="th-error th-pad">{(patch.error as Error).message}</p> : null}
      {startSession.isError ? (
        <p className="th-error th-pad">{(startSession.error as Error).message}</p>
      ) : null}
    </div>
  )
}
