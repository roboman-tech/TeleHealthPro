export type UserRole = 'patient' | 'provider' | 'admin'

export type ProviderReadiness =
  | 'registered'
  | 'profile_completed'
  | 'credentials_reviewed'
  | 'approved'
  | 'bookable'

export interface User {
  id: number
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  is_provider_approved: boolean
  provider_readiness?: ProviderReadiness | null
}

export interface ProviderAvailability {
  id: number
  provider_id: number
  start_at: string
  end_at: string
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface PatientRecord {
  id: number
  patient_id: number
  demographics: Record<string, unknown>
  // Clinical data is sourced from the SQLite clinical store + FHIR workflow (not this record object).
  medical_history: Record<string, unknown>
  lab_results: Record<string, unknown>
  fhir_resource_refs: Record<string, unknown> | null
}

export interface ClinicalMeResponse {
  fhir_patient_id: string | null
  history_text: string | null
  labs_text: string | null
  raw_fhir_bundle: Record<string, unknown> | null
}

export interface ClinicalPutResponse {
  ok: boolean
  fhir_patient_id: string
  history_text: string
  labs_text: string
  raw_fhir_bundle: Record<string, unknown>
}

export interface ClinicalProviderFetchResponse {
  patient_user_id: number
  fhir_patient_id: string | null
  history_text: string | null
  labs_text: string | null
  raw_fhir_bundle: Record<string, unknown> | null
}

export interface ProviderPatientsListResponse {
  patients: Array<{
    patient_user_id: number
    fhir_patient_id: string | null
    has_clinical_data: boolean
  }>
}

export type AppointmentStatus =
  | 'pending'
  | 'approved'
  | 'in_progress'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'reschedule_requested'
  | 'no_show'

export interface Appointment {
  id: number
  patient_id: number
  provider_id: number
  start_at: string
  end_at: string
  status: AppointmentStatus
  notes: string | null
  patient_name?: string | null
  provider_name?: string | null
}

/** Provider/admin: all fields. Patient: only follow-up + patient_after_visit_summary populated. */
export interface AppointmentDocumentation {
  visit_notes: string | null
  diagnosis_summary: string | null
  care_plan: string | null
  follow_up_instructions: string | null
  internal_provider_note: string | null
  patient_after_visit_summary: string | null
}

export type TelehealthSessionStatus =
  | 'ready'
  | 'patient_joined'
  | 'provider_joined'
  | 'live'
  | 'ended'
  | 'expired'

export interface TelehealthSession {
  id: number
  appointment_id: number
  provider_id: number
  status: TelehealthSessionStatus
  ended_at: string | null
  secure_join_url: string
  session_metadata: Record<string, unknown>
  activity_log: Array<Record<string, unknown>>
  created_at: string
}

export interface TelehealthMeetingInfo {
  jitsi_base_url: string
  room_name: string
  appointment_start_at: string
  appointment_end_at: string
  session_status: TelehealthSessionStatus
  ended_at: string | null
  can_join_video: boolean
}

export interface MetricsSummary {
  active_patients: number
  active_providers: number
  appointments_total: number
  appointments_this_week: number
  telehealth_sessions_total: number
}

export interface OpsSummary {
  stuck_appointments_in_progress: number
  stuck_sessions_ready: number
  failed_notification_pushes: number
  providers_not_bookable: number
}

export interface AuditLogsResponse {
  message: string
  entries: unknown[]
}

export interface UserNotification {
  id: number
  type: string
  title: string
  body: string | null
  appointment_id: number | null
  session_id: number | null
  read_at: string | null
  created_at: string
}

export interface UnreadCountResponse {
  count: number
}
