import type { Appointment, AppointmentStatus } from '../../api/types'

export type ScheduleFilter = 'today' | 'upcoming' | 'waiting' | 'completed'

export type ProviderScheduleRow = {
  appointmentId: number
  patientId: number
  patientName: string
  startAt: string
  endAt: string
  status: AppointmentStatus
  reason: string
}

export type ProviderClinicalData = {
  patientUserId: number
  fhirPatientId: string | null
  historyText: string | null
  labsText: string | null
  rawFhirBundle: Record<string, unknown> | null
}

export function statusLabel(s: AppointmentStatus): string {
  switch (s) {
    case 'pending':
      return 'Pending'
    case 'approved':
      return 'Approved'
    case 'in_progress':
      return 'In session'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    case 'rejected':
      return 'Rejected'
    case 'reschedule_requested':
      return 'Reschedule'
    case 'no_show':
      return 'No-show'
    default:
      return s
  }
}

export function statusTone(s: AppointmentStatus): 'ok' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (s === 'approved' || s === 'completed') return 'ok'
  if (s === 'in_progress') return 'info'
  if (s === 'pending' || s === 'reschedule_requested') return 'warn'
  if (s === 'cancelled' || s === 'rejected' || s === 'no_show') return 'bad'
  return 'neutral'
}

export function toScheduleRows(appts: Appointment[] | undefined): ProviderScheduleRow[] {
  if (!appts) return []
  return appts.map((a) => ({
    appointmentId: a.id,
    patientId: a.patient_id,
    patientName: a.patient_name ?? `Patient #${a.patient_id}`,
    startAt: a.start_at,
    endAt: a.end_at,
    status: a.status,
    reason: a.notes?.trim() ? a.notes.trim() : 'Telehealth visit',
  }))
}

/** Statuses that can represent an actionable future visit in the sidebar. */
const FUTURE_VISIT_STATUSES: AppointmentStatus[] = ['pending', 'approved', 'in_progress', 'reschedule_requested']

export type PatientSidebarEntry = {
  patientId: number
  name: string
  /** Row used for time + status badge; null if no appointments (should not happen if derived from rows). */
  displayRow: ProviderScheduleRow | null
  /** Whether `displayRow` is the next upcoming visit or the most recent (past) visit. */
  scheduleKind: 'next' | 'last' | 'none'
  total: number
}

/**
 * One row per patient for the sidebar. Picks the next *future* active visit when present;
 * otherwise the most recent visit (so completed/cancelled labels stay accurate when new visits are booked).
 */
export function buildPatientSidebarEntries(rows: ProviderScheduleRow[]): PatientSidebarEntry[] {
  const byPatient = new Map<number, ProviderScheduleRow[]>()
  for (const r of rows) {
    const list = byPatient.get(r.patientId) ?? []
    list.push(r)
    byPatient.set(r.patientId, list)
  }
  const now = Date.now()
  const out: PatientSidebarEntry[] = []
  for (const [patientId, appts] of byPatient) {
    const name = appts[0]?.patientName ?? `Patient #${patientId}`
    const sortedAsc = [...appts].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    const futureActive = sortedAsc.filter(
      (r) => new Date(r.startAt).getTime() >= now && FUTURE_VISIT_STATUSES.includes(r.status),
    )
    if (futureActive.length) {
      out.push({
        patientId,
        name,
        displayRow: futureActive[0],
        scheduleKind: 'next',
        total: appts.length,
      })
      continue
    }
    const sortedDesc = [...appts].sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    if (sortedDesc.length) {
      out.push({
        patientId,
        name,
        displayRow: sortedDesc[0],
        scheduleKind: 'last',
        total: appts.length,
      })
    } else {
      out.push({ patientId, name, displayRow: null, scheduleKind: 'none', total: 0 })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

