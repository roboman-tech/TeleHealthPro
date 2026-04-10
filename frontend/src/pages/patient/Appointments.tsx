import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useMemo, useState } from 'react'
import { appointmentsApi, providersApi } from '../../api/client'
import type { AppointmentStatus } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { DateScheduleInput } from '../../components/DateScheduleInput'
import { Badge, Button, Card } from '../../components/ui'
import { PageTitle } from '../../components/ui'
import { toDatetimeLocalValue } from '../../utils/datetimeLocal'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function suggestFromWindow(
  startIso: string,
  endIso: string,
  setStart: (v: string) => void,
  setEnd: (v: string) => void,
) {
  const s = new Date(startIso)
  const e = new Date(endIso)
  const suggestedEnd = new Date(s.getTime() + 30 * 60 * 1000)
  const endDate = suggestedEnd > e ? e : suggestedEnd
  setStart(toDatetimeLocalValue(s))
  setEnd(toDatetimeLocalValue(endDate))
}

function patientRowHasActions(a: { status: AppointmentStatus }) {
  if (a.status === 'pending' || a.status === 'approved' || a.status === 'reschedule_requested') return true
  return (
    a.status !== 'cancelled' &&
    a.status !== 'completed' &&
    a.status !== 'rejected' &&
    a.status !== 'no_show'
  )
}

function patientShowsActionsCell(a: { status: AppointmentStatus }, token: string | null) {
  if (token && a.status === 'completed') return true
  return patientRowHasActions(a)
}

function statusTone(s: AppointmentStatus): 'ok' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (s === 'approved' || s === 'completed') return 'ok'
  if (s === 'in_progress') return 'info'
  if (s === 'pending') return 'warn'
  if (s === 'reschedule_requested') return 'warn'
  if (s === 'cancelled' || s === 'rejected' || s === 'no_show') return 'bad'
  return 'neutral'
}

function PatientVisitDocPanel({ appointmentId, token }: { appointmentId: number; token: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['appointments', 'documentation', token, appointmentId],
    queryFn: () => appointmentsApi.getDocumentation(token, appointmentId),
  })
  if (isLoading) return <p className="th-muted th-pad">Loading…</p>
  if (error) return <p className="th-error th-pad">{(error as Error).message}</p>
  if (!data) return null
  const has =
    data.follow_up_instructions?.trim() || data.patient_after_visit_summary?.trim()
  if (!has) {
    return (
      <p className="th-muted th-pad">
        Your care team has not added an after-visit summary or follow-up instructions yet.
      </p>
    )
  }
  return (
    <div className="th-patient-visit-doc">
      {data.patient_after_visit_summary?.trim() ? (
        <>
          <h4 className="th-meeting-docs-sub" style={{ marginTop: 0 }}>
            Summary
          </h4>
          <p className="th-meeting-docs-patient-block">{data.patient_after_visit_summary}</p>
        </>
      ) : null}
      {data.follow_up_instructions?.trim() ? (
        <>
          <h4 className="th-meeting-docs-sub" style={{ marginTop: '0.75rem' }}>
            Follow-up
          </h4>
          <p className="th-meeting-docs-patient-block">{data.follow_up_instructions}</p>
        </>
      ) : null}
    </div>
  )
}

export function PatientAppointments() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all')
  const [providerId, setProviderId] = useState<number | ''>('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [notes, setNotes] = useState('')
  const [rescheduleDraft, setRescheduleDraft] = useState<{
    id: number
    start: string
    end: string
  } | null>(null)
  const [reviseDraft, setReviseDraft] = useState<{
    id: number
    start: string
    end: string
  } | null>(null)
  const [afterVisitOpenId, setAfterVisitOpenId] = useState<number | null>(null)

  const { data: appts } = useQuery({
    queryKey: ['appointments', 'mine', token],
    queryFn: () => appointmentsApi.mine(token!),
    enabled: !!token,
  })
  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.list(),
  })
  const slotsQuery = useQuery({
    queryKey: ['providers', 'availability', providerId],
    queryFn: () => providersApi.availabilityFor(Number(providerId)),
    enabled: providerId !== '',
  })
  const providerSlots = slotsQuery.data
  const slotsPending = slotsQuery.isPending
  const slotsError = slotsQuery.isError
  const slotsErrMsg = slotsError ? (slotsQuery.error as Error).message : null

  const hasPublishedHours = (providerSlots?.length ?? 0) > 0
  const canRequestAppointment =
    Boolean(token) &&
    providerId !== '' &&
    Boolean(start) &&
    Boolean(end) &&
    !slotsPending &&
    !slotsError &&
    hasPublishedHours

  const book = useMutation({
    mutationFn: () =>
      appointmentsApi.book(token!, {
        provider_id: Number(providerId),
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
        notes: notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', 'mine'] })
      setNotes('')
    },
  })

  const cancel = useMutation({
    mutationFn: (id: number) => appointmentsApi.patch(token!, id, { status: 'cancelled' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', 'mine'] })
      qc.invalidateQueries({ queryKey: ['telehealth', 'sessions'] })
    },
  })

  const requestReschedule = useMutation({
    mutationFn: (arg: { id: number; start_at?: string; end_at?: string }) => {
      const body: { status: string; start_at?: string; end_at?: string } = {
        status: 'reschedule_requested',
      }
      if (arg.start_at && arg.end_at) {
        body.start_at = arg.start_at
        body.end_at = arg.end_at
      }
      return appointmentsApi.patch(token!, arg.id, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', 'mine'] })
      qc.invalidateQueries({ queryKey: ['telehealth', 'sessions'] })
    },
  })

  const reviseTimes = useMutation({
    mutationFn: (arg: { id: number; start_at: string; end_at: string }) =>
      appointmentsApi.patch(token!, arg.id, { start_at: arg.start_at, end_at: arg.end_at }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', 'mine'] })
      qc.invalidateQueries({ queryKey: ['telehealth', 'sessions'] })
    },
  })

  const filtered = useMemo(() => {
    if (!appts) return []
    if (statusFilter === 'all') return appts
    return appts.filter((a) => a.status === statusFilter)
  }, [appts, statusFilter])

  return (
    <div className="th-page">
      <PageTitle
        kicker="Patient"
        title="Appointments"
        subtitle="Book inside a provider’s published hours when they set them; otherwise suggest a time."
      />
      <Card className="th-mb">
        <h3>Book a visit</h3>
        <div className="th-form-row">
          <label>
            Provider
            <select
              value={providerId === '' ? '' : String(providerId)}
              onChange={(e) => setProviderId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select…</option>
              {providers?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} — {p.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start
            <DateScheduleInput
              inputType="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              wrapClassName="mt-2"
            />
          </label>
          <label>
            End
            <DateScheduleInput
              inputType="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              wrapClassName="mt-2"
            />
          </label>
        </div>
        {providerId !== '' ? (
          <div className="th-patient-availability-hint th-mb">
            {slotsPending ? (
              <p className="th-muted">Loading this provider&apos;s published hours…</p>
            ) : slotsError ? (
              <p className="th-error">
                Could not load availability{slotsErrMsg ? `: ${slotsErrMsg}` : ''}. Try another provider or refresh.
              </p>
            ) : hasPublishedHours ? (
              <>
                <p className="th-meeting-docs-sub" style={{ marginTop: 0 }}>
                  Published hours — your requested visit must fall entirely inside one of these windows. Use
                  &quot;30 min from start&quot; or pick start/end manually.
                </p>
                <ul className="th-availability-pills">
                  {providerSlots!.map((s) => (
                    <li key={s.id} className="th-availability-pill">
                      <span>
                        {fmt(s.start_at)} → {fmt(s.end_at)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => suggestFromWindow(s.start_at, s.end_at, setStart, setEnd)}
                      >
                        30 min from start
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="th-muted">
                This provider has not published hours yet — booking is unavailable until they publish availability in
                their dashboard.
              </p>
            )}
          </div>
        ) : null}
        <label>
          Notes (optional)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>
        <Button onClick={() => book.mutate()} disabled={book.isPending || !canRequestAppointment}>
          {book.isPending ? 'Booking…' : 'Request appointment'}
        </Button>
        {!canRequestAppointment && !book.isPending && providerId !== '' ? (
          <p className="th-muted th-small th-mt" style={{ marginTop: '0.5rem' }}>
            {!token
              ? 'Sign in again to book.'
              : slotsPending
                ? 'Wait for published hours to load.'
                : slotsError
                  ? 'Fix the availability error above to continue.'
                  : !hasPublishedHours
                    ? 'The provider must publish at least one availability window before you can request a visit.'
                    : !start || !end
                      ? 'Choose both start and end times (inside a published window).'
                      : null}
          </p>
        ) : null}
        {book.isError ? <p className="th-error">{(book.error as Error).message}</p> : null}
      </Card>

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
              <th>When</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <Fragment key={a.id}>
                <tr>
                  <td>
                    {fmt(a.start_at)} → {fmt(a.end_at)}
                  </td>
                  <td>{a.provider_name ?? `Provider #${a.provider_id}`}</td>
                  <td>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </td>
                  <td className="th-actions-cell">
                    <div className="th-actions">
                    {patientShowsActionsCell(a, token) ? (
                      <>
                        {a.status === 'completed' && token ? (
                          <Button variant="ghost" type="button" onClick={() => setAfterVisitOpenId(a.id)}>
                            After-visit info
                          </Button>
                        ) : null}
                        {a.status === 'pending' || a.status === 'approved' ? (
                          <>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setRescheduleDraft(null)
                                requestReschedule.mutate({ id: a.id })
                              }}
                              disabled={requestReschedule.isPending || reviseTimes.isPending}
                            >
                              Request reschedule
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                setRescheduleDraft({
                                  id: a.id,
                                  start: '',
                                  end: '',
                                })
                              }
                              disabled={requestReschedule.isPending}
                            >
                              Suggest new time…
                            </Button>
                          </>
                        ) : null}
                        {a.status === 'reschedule_requested' ? (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setReviseDraft({
                                id: a.id,
                                start: toDatetimeLocalValue(new Date(a.start_at)),
                                end: toDatetimeLocalValue(new Date(a.end_at)),
                              })
                            }
                            disabled={reviseTimes.isPending}
                          >
                            Update suggested times
                          </Button>
                        ) : null}
                        {a.status !== 'cancelled' &&
                        a.status !== 'completed' &&
                        a.status !== 'rejected' &&
                        a.status !== 'no_show' ? (
                          <Button variant="ghost" onClick={() => cancel.mutate(a.id)}>
                            Cancel
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <span className="th-actions-none" aria-label="No actions for this visit">
                        —
                      </span>
                    )}
                    </div>
                  </td>
                </tr>
                {rescheduleDraft?.id === a.id ? (
                  <tr className="th-table-doc-row">
                    <td colSpan={4}>
                      <div className="th-reschedule-draft">
                        <p className="th-muted" style={{ marginTop: 0 }}>
                          Optional suggested start and end (must fall inside the provider&apos;s published hours
                          when they use them).
                        </p>
                        <div className="th-form-row">
                          <label>
                            Start
                            <DateScheduleInput
                              inputType="datetime-local"
                              value={rescheduleDraft.start}
                              onChange={(e) =>
                                setRescheduleDraft((d) => (d ? { ...d, start: e.target.value } : d))
                              }
                              wrapClassName="mt-2"
                            />
                          </label>
                          <label>
                            End
                            <DateScheduleInput
                              inputType="datetime-local"
                              value={rescheduleDraft.end}
                              onChange={(e) =>
                                setRescheduleDraft((d) => (d ? { ...d, end: e.target.value } : d))
                              }
                              wrapClassName="mt-2"
                            />
                          </label>
                        </div>
                        <div className="th-form-row">
                          <Button
                            variant="accent"
                            type="button"
                            disabled={
                              requestReschedule.isPending || !rescheduleDraft.start || !rescheduleDraft.end
                            }
                            onClick={() => {
                              requestReschedule.mutate(
                                {
                                  id: a.id,
                                  start_at: new Date(rescheduleDraft.start).toISOString(),
                                  end_at: new Date(rescheduleDraft.end).toISOString(),
                                },
                                { onSuccess: () => setRescheduleDraft(null) },
                              )
                            }}
                          >
                            Send reschedule with these times
                          </Button>
                          <Button variant="ghost" type="button" onClick={() => setRescheduleDraft(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {reviseDraft?.id === a.id ? (
                  <tr className="th-table-doc-row">
                    <td colSpan={4}>
                      <div className="th-reschedule-draft">
                        <p className="th-muted" style={{ marginTop: 0 }}>
                          Adjust your suggested visit window. The provider will see the update.
                        </p>
                        <div className="th-form-row">
                          <label>
                            Start
                            <DateScheduleInput
                              inputType="datetime-local"
                              value={reviseDraft.start}
                              onChange={(e) =>
                                setReviseDraft((d) => (d ? { ...d, start: e.target.value } : d))
                              }
                              wrapClassName="mt-2"
                            />
                          </label>
                          <label>
                            End
                            <DateScheduleInput
                              inputType="datetime-local"
                              value={reviseDraft.end}
                              onChange={(e) =>
                                setReviseDraft((d) => (d ? { ...d, end: e.target.value } : d))
                              }
                              wrapClassName="mt-2"
                            />
                          </label>
                        </div>
                        <div className="th-form-row">
                          <Button
                            variant="accent"
                            type="button"
                            disabled={reviseTimes.isPending || !reviseDraft.start || !reviseDraft.end}
                            onClick={() => {
                              reviseTimes.mutate(
                                {
                                  id: a.id,
                                  start_at: new Date(reviseDraft.start).toISOString(),
                                  end_at: new Date(reviseDraft.end).toISOString(),
                                },
                                { onSuccess: () => setReviseDraft(null) },
                              )
                            }}
                          >
                            Save new suggestion
                          </Button>
                          <Button variant="ghost" type="button" onClick={() => setReviseDraft(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {a.status === 'completed' && token ? (
                  <tr className="th-table-doc-row">
                    <td colSpan={4}>
                      <details
                        className="th-patient-doc-details"
                        open={afterVisitOpenId === a.id}
                        onToggle={(e) => {
                          const open = e.currentTarget.open
                          setAfterVisitOpenId(open ? a.id : null)
                        }}
                      >
                        <summary>After-visit information</summary>
                        <PatientVisitDocPanel appointmentId={a.id} token={token} />
                      </details>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!appts?.length ? <p className="th-muted th-pad">No appointments yet.</p> : null}
        {appts?.length && !filtered.length ? (
          <p className="th-muted th-pad">No appointments match this filter.</p>
        ) : null}
      </div>
      {requestReschedule.isError ? (
        <p className="th-error th-pad">{(requestReschedule.error as Error).message}</p>
      ) : null}
      {reviseTimes.isError ? (
        <p className="th-error th-pad">{(reviseTimes.error as Error).message}</p>
      ) : null}
    </div>
  )
}
