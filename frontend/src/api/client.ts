import type {
  Appointment,
  AppointmentDocumentation,
  AuditLogsResponse,
  ClinicalMeResponse,
  ClinicalProviderFetchResponse,
  ClinicalPutResponse,
  ProviderPatientsListResponse,
  MetricsSummary,
  OpsSummary,
  PatientRecord,
  TelehealthMeetingInfo,
  TelehealthSession,
  TokenResponse,
  UnreadCountResponse,
  ProviderAvailability,
  User,
  UserNotification,
} from './types'

import { apiBase } from './base'

/** Only these need fetch `no-store` (stale credentialed GET confused session). Wider no-store breaks Chrome DevTools response preview. */
function needsNoStoreCache(path: string): boolean {
  if (path === '/auth/me') return true
  const [p] = path.split('?')
  return p === '/auth/token'
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown }
    const d = j.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d))
      return d.map((x: { msg?: string }) => x.msg || JSON.stringify(x)).join(', ')
    return res.statusText
  } catch {
    return res.statusText
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, ...init } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    cache: init.cache !== undefined ? init.cache : needsNoStoreCache(path) ? 'no-store' : 'default',
  })
  if (!res.ok) throw new Error(await parseError(res))
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: (token?: string | null) =>
    apiFetch<void>('/auth/logout', {
      method: 'POST',
      token: token ?? undefined,
    }),
  meCookie: () => apiFetch<User>('/auth/me'),
  tokenForWs: () => apiFetch<TokenResponse>('/auth/token'),
  register: (body: {
    email: string
    password: string
    full_name: string
    role: 'patient' | 'provider'
    date_of_birth?: string
    pronouns?: string
    note?: string
  }) =>
    apiFetch<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  me: (token: string) => apiFetch<User>('/auth/me', { token }),
}

export const providersApi = {
  list: () => apiFetch<User[]>('/providers'),
  myAvailability: (token: string) =>
    apiFetch<ProviderAvailability[]>('/providers/me/availability', { token }),
  availabilityFor: (providerId: number) =>
    apiFetch<ProviderAvailability[]>(`/providers/${providerId}/availability`),
  createAvailability: (token: string, body: { start_at: string; end_at: string }) =>
    apiFetch<ProviderAvailability>('/providers/me/availability', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    }),
  deleteAvailability: (token: string, slotId: number) =>
    apiFetch<void>(`/providers/me/availability/${slotId}`, { method: 'DELETE', token }),
}

export const recordsApi = {
  mine: async (token: string): Promise<PatientRecord | null> => {
    const res = await fetch(`${apiBase()}/records/me`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(await parseError(res))
    return res.json() as Promise<PatientRecord>
  },
  createMine: (token: string, body: Partial<PatientRecord>) =>
    apiFetch<PatientRecord>('/records/me', {
      method: 'POST',
      token,
      body: JSON.stringify({
        demographics: body.demographics ?? {},
        medical_history: body.medical_history ?? {},
        lab_results: body.lab_results ?? {},
      }),
    }),
  get: (token: string, patientId: number) =>
    apiFetch<PatientRecord>(`/records/${patientId}`, { token }),
  getOptional: async (token: string, patientId: number): Promise<PatientRecord | null> => {
    const res = await fetch(`${apiBase()}/records/${patientId}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(await parseError(res))
    return res.json() as Promise<PatientRecord>
  },
  patch: (token: string, patientId: number, body: Partial<PatientRecord>) =>
    apiFetch<PatientRecord>(`/records/${patientId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    }),
}

export const appointmentsApi = {
  mine: (token: string) => apiFetch<Appointment[]>('/appointments/mine', { token }),
  book: (
    token: string,
    body: { provider_id: number; start_at: string; end_at: string; notes?: string | null },
  ) =>
    apiFetch<Appointment>('/appointments', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    }),
  patch: (
    token: string,
    id: number,
    body: { status?: string; notes?: string | null; start_at?: string; end_at?: string },
  ) =>
    apiFetch<Appointment>(`/appointments/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    }),
  getDocumentation: (token: string, appointmentId: number) =>
    apiFetch<AppointmentDocumentation>(`/appointments/${appointmentId}/documentation`, { token }),
  patchDocumentation: (
    token: string,
    appointmentId: number,
    body: Partial<AppointmentDocumentation>,
  ) =>
    apiFetch<AppointmentDocumentation>(`/appointments/${appointmentId}/documentation`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    }),
}

export const telehealthApi = {
  list: (token: string) => apiFetch<TelehealthSession[]>('/telehealth/sessions', { token }),
  get: (token: string, sessionId: number) =>
    apiFetch<TelehealthSession>(`/telehealth/sessions/${sessionId}`, { token }),
  meetingInfo: (token: string, sessionId: number) =>
    apiFetch<TelehealthMeetingInfo>(`/telehealth/sessions/${sessionId}/meeting`, { token }),
  resolve: (token: string, t: string) =>
    apiFetch<TelehealthSession>(`/telehealth/sessions/resolve?t=${encodeURIComponent(t)}`, {
      token,
    }),
  createForAppointment: (token: string, appointmentId: number) =>
    apiFetch<TelehealthSession>(`/telehealth/sessions/${appointmentId}`, {
      method: 'POST',
      token,
    }),
  logActivity: (token: string, sessionId: number, event: Record<string, unknown>) =>
    apiFetch<TelehealthSession>(`/telehealth/sessions/${sessionId}/activity`, {
      method: 'POST',
      token,
      body: JSON.stringify(event),
    }),
  endSession: (token: string, sessionId: number) =>
    apiFetch<TelehealthSession>(`/telehealth/sessions/${sessionId}/end`, {
      method: 'POST',
      token,
    }),
}

export const adminApi = {
  metrics: (token: string) => apiFetch<MetricsSummary>('/admin/metrics/summary', { token }),
  opsSummary: (token: string) => apiFetch<OpsSummary>('/admin/ops/summary', { token }),
  users: (token: string) => apiFetch<User[]>('/admin/users', { token }),
  updateUser: (
    token: string,
    userId: number,
    body: { is_active?: boolean; is_provider_approved?: boolean; provider_readiness?: string | null },
  ) =>
    apiFetch<User>(`/admin/users/${userId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    }),
  approveProvider: (token: string, userId: number) =>
    apiFetch<{ ok: boolean }>(`/admin/providers/${userId}/approve`, {
      method: 'POST',
      token,
    }),
  logs: (token: string) => apiFetch<AuditLogsResponse>('/admin/logs', { token }),
}

export const fhirApi = {
  patient: (token: string, fhirPatientId: string) =>
    apiFetch<Record<string, unknown>>(`/integrations/fhir/Patient/${fhirPatientId}`, { token }),
}

export const clinicalApi = {
  my: (token: string) => apiFetch<ClinicalMeResponse>('/clinical/me', { token }),
  saveMine: (
    token: string,
    body: { medical_history: Record<string, unknown>; lab_results: Record<string, unknown>; fhir_patient_id?: string },
  ) =>
    apiFetch<ClinicalPutResponse>('/clinical/me', {
      method: 'PUT',
      token,
      body: JSON.stringify(body),
    }),
  byFhirPatientId: (token: string, fhirPatientId: string) =>
    apiFetch<ClinicalProviderFetchResponse>(`/clinical/by-fhir/${encodeURIComponent(fhirPatientId)}`, { token }),
  patient: (token: string, patientUserId: number) =>
    apiFetch<ClinicalProviderFetchResponse>(`/clinical/patient/${patientUserId}`, { token }),
  byAppointment: (token: string, appointmentId: number) =>
    apiFetch<ClinicalProviderFetchResponse>(`/clinical/by-appointment/${appointmentId}`, { token }),
  myPatients: (token: string) => apiFetch<ProviderPatientsListResponse>('/clinical/my-patients', { token }),
}

export const notificationsApi = {
  list: (token: string, opts?: { unread_only?: boolean; limit?: number }) => {
    const q = new URLSearchParams()
    if (opts?.unread_only) q.set('unread_only', 'true')
    if (opts?.limit != null) q.set('limit', String(opts.limit))
    const suffix = q.toString() ? `?${q}` : ''
    return apiFetch<UserNotification[]>(`/notifications${suffix}`, { token })
  },
  unreadCount: (token: string) =>
    apiFetch<UnreadCountResponse>('/notifications/unread-count', { token }),
  markRead: (token: string, id: number) =>
    apiFetch<void>(`/notifications/${id}/read`, { method: 'PATCH', token }),
  markAllRead: (token: string) =>
    apiFetch<void>('/notifications/read-all', { method: 'POST', token }),
}
