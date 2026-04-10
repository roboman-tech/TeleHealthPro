import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { appointmentsApi, clinicalApi } from '../../api/client'
import type { Appointment } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { minDelay } from '../../utils/minDelay'
import { StatusBadge } from '../../components/provider-workspace/StatusBadge'
import { ClinicalEmptyState } from '../../components/provider-workspace/ClinicalEmptyState'
import { MedicalHistorySectionsView } from '../../components/provider-workspace/MedicalHistorySectionsView'
import { ProviderPatientHeader } from '../../components/provider-workspace/ProviderPatientHeader'
import type { ProviderClinicalData, ProviderScheduleRow, ScheduleFilter } from '../../components/provider-workspace/types'
import { buildPatientSidebarEntries, statusLabel, toScheduleRows } from '../../components/provider-workspace/types'

/** Persisted in React Query so clinical data survives route changes (e.g. Patients ↔ Appointments). */
const clinicalFetchedKeyRoot = ['clinical', 'provider', 'fetched'] as const

type ProviderClinicalCacheEntry = {
  clinical: ProviderClinicalData
  loadedAt: string
}

type TabKey =
  | 'overview'
  | 'history'
  | 'labs'
  | 'medications'
  | 'allergies'
  | 'encounters'
  | 'documents'
  | 'raw'

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfToday(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

function isToday(iso: string): boolean {
  const t = new Date(iso).getTime()
  return t >= startOfToday().getTime() && t <= endOfToday().getTime()
}

function fmtRange(startAt: string, endAt: string): string {
  const s = new Date(startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const e = new Date(endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${s}–${e}`
}

function metricsFor(rows: ProviderScheduleRow[]) {
  const total = rows.length
  const waiting = rows.filter((r) => r.status === 'pending' || r.status === 'approved').length
  const completed = rows.filter((r) => r.status === 'completed').length
  const next = rows
    .filter((r) => new Date(r.startAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0]
  return { total, waiting, completed, next }
}

function tabButton(active: boolean): string {
  return active
    ? 'border-teal-300/25 bg-teal-400/10 text-teal-100'
    : 'border-white/10 bg-white/[0.02] text-slate-200 hover:bg-white/[0.05]'
}

export function ProviderWorkspace() {
  const { token, user } = useAuth()
  const nav = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ScheduleFilter>('today')
  const [sidebarMode, setSidebarMode] = useState<'schedule' | 'patients'>('patients')
  const [selectedApptId, setSelectedApptId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [showRaw, setShowRaw] = useState(false)

  const apptsQ = useQuery({
    queryKey: ['appointments', 'mine', token],
    queryFn: () => appointmentsApi.mine(token!),
    enabled: !!token,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

  const rosterQ = useQuery({
    queryKey: ['clinical', 'my-patients', token],
    queryFn: () => clinicalApi.myPatients(token!),
    enabled: !!token,
  })

  const rows = useMemo(() => toScheduleRows(apptsQ.data as Appointment[] | undefined), [apptsQ.data])
  const todayRows = useMemo(() => rows.filter((r) => isToday(r.startAt)), [rows])
  const m = useMemo(() => metricsFor(todayRows), [todayRows])

  const hasClinicalForPatient = useMemo(() => {
    const set = new Set<number>()
    rosterQ.data?.patients.forEach((p) => {
      if (p.has_clinical_data) set.add(p.patient_user_id)
    })
    return set
  }, [rosterQ.data])

  const visibleRows = useMemo(() => {
    const base = filter === 'today' ? todayRows : rows
    const q = search.trim().toLowerCase()
    const filtered = q
      ? base.filter((r) => r.patientName.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q))
      : base
    if (filter === 'waiting') return filtered.filter((r) => r.status === 'pending' || r.status === 'approved')
    if (filter === 'completed') return filtered.filter((r) => r.status === 'completed')
    if (filter === 'upcoming') return filtered.filter((r) => r.status === 'approved' || r.status === 'pending')
    return filtered
  }, [rows, todayRows, filter, search])

  const selectedRow: ProviderScheduleRow | null = useMemo(() => {
    if (selectedApptId == null) return null
    return rows.find((r) => r.appointmentId === selectedApptId) ?? null
  }, [rows, selectedApptId])

  const selectedPatientId = selectedRow?.patientId ?? null
  const { data: clinicalCacheEntry } = useQuery<ProviderClinicalCacheEntry>({
    queryKey: [...clinicalFetchedKeyRoot, selectedPatientId ?? '__none__'],
    queryFn: async () => {
      throw new Error('Clinical load is explicit-only')
    },
    enabled: false,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
  })

  const patientList = useMemo(() => {
    const built = buildPatientSidebarEntries(rows)
    const q = search.trim().toLowerCase()
    return q ? built.filter((p) => p.name.toLowerCase().includes(q)) : built
  }, [rows, search])

  const loadClinical = useMutation({
    mutationFn: async (patientId: number) => minDelay(clinicalApi.patient(token!, patientId), 700),
    onSuccess: (data) => {
      const mapped: ProviderClinicalData = {
        patientUserId: data.patient_user_id,
        fhirPatientId: data.fhir_patient_id,
        historyText: data.history_text,
        labsText: data.labs_text,
        rawFhirBundle: data.raw_fhir_bundle,
      }
      const entry: ProviderClinicalCacheEntry = {
        clinical: mapped,
        loadedAt: new Date().toLocaleString(),
      }
      queryClient.setQueryData([...clinicalFetchedKeyRoot, data.patient_user_id], entry)
      setShowRaw(false)
    },
  })

  const selectedClinical = clinicalCacheEntry?.clinical ?? null
  const clinicalLastLoadedAt = clinicalCacheEntry?.loadedAt ?? null

  return (
    <div className="h-[calc(100vh-1px)] w-full min-h-0">
      <div className="grid h-full min-h-0 grid-cols-[360px_minmax(0,1fr)_380px] gap-4 p-4">
        {/* Left sidebar */}
        <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="shrink-0 border-b border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400/15 text-teal-100">
                {user?.full_name?.slice(0, 1).toUpperCase() ?? 'P'}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-50">{user?.full_name || user?.email}</div>
                <div className="text-xs text-slate-300">Provider • {new Date().toLocaleDateString()}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
                <div className="text-[11px] text-slate-400">Today</div>
                <div className="text-lg font-semibold text-slate-50">{m.total}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
                <div className="text-[11px] text-slate-400">Waiting</div>
                <div className="text-lg font-semibold text-slate-50">{m.waiting}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
                <div className="text-[11px] text-slate-400">Completed</div>
                <div className="text-lg font-semibold text-slate-50">{m.completed}</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                {sidebarMode === 'patients' ? 'Assigned Patients' : "Today’s Schedule"}
              </div>
              <div className="flex gap-1 rounded-full border border-white/10 bg-white/[0.02] p-1">
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    sidebarMode === 'patients' ? 'bg-teal-400/15 text-teal-100' : 'text-slate-200 hover:bg-white/[0.05]'
                  }`}
                  onClick={() => setSidebarMode('patients')}
                >
                  Patients
                </button>
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    sidebarMode === 'schedule' ? 'bg-teal-400/15 text-teal-100' : 'text-slate-200 hover:bg-white/[0.05]'
                  }`}
                  onClick={() => setSidebarMode('schedule')}
                >
                  Schedule
                </button>
              </div>
            </div>

            {sidebarMode === 'schedule' ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {(['today', 'upcoming', 'waiting', 'completed'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${tabButton(filter === k)}`}
                  >
                    {k === 'today' ? 'Today' : k === 'upcoming' ? 'Upcoming' : k === 'waiting' ? 'Waiting' : 'Completed'}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-3">
              <input
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
                placeholder="Search patients"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="th-clinical-sidebar-scroll min-h-0 flex-1 px-2 pb-2">
            {apptsQ.isPending ? (
              <div className="p-4 text-sm text-slate-300">Loading…</div>
            ) : sidebarMode === 'patients' ? (
              !patientList.length ? (
                <div className="p-4 text-sm text-slate-300">No connected patients yet.</div>
              ) : (
                <ul className="space-y-2 p-2">
                  {patientList.map((p) => {
                    const selected = selectedRow?.patientId === p.patientId
                    const hasClinical = hasClinicalForPatient.has(p.patientId)
                    const row = p.displayRow
                    const scheduleLine =
                      p.scheduleKind === 'next' && row
                        ? `Next visit: ${fmtRange(row.startAt, row.endAt)}`
                        : p.scheduleKind === 'last' && row
                          ? `Last visit: ${fmtRange(row.startAt, row.endAt)}`
                          : 'No visits on file'
                    return (
                      <li key={p.patientId}>
                        <button
                          type="button"
                          onClick={() => {
                            if (p.displayRow) setSelectedApptId(p.displayRow.appointmentId)
                            setActiveTab('overview')
                            setShowRaw(false)
                          }}
                          className={`w-full rounded-2xl border p-3 text-left transition ${
                            selected
                              ? 'border-teal-300/25 bg-teal-400/10'
                              : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-50">{p.name}</div>
                              <div className="mt-0.5 text-xs text-slate-300">
                                {scheduleLine}
                                {p.total > 1 ? ` • ${p.total} visits` : ''}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              {row ? <StatusBadge status={row.status} /> : null}
                              {hasClinical ? (
                                <span className="rounded-full border border-teal-300/20 bg-teal-400/10 px-2 py-0.5 text-[11px] font-semibold text-teal-100">
                                  Clinical available
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )
            ) : !visibleRows.length ? (
              <div className="p-4 text-sm text-slate-300">No appointments found for this view.</div>
            ) : (
              <ul className="space-y-2 p-2">
                {visibleRows
                  .slice()
                  .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
                  .map((r) => {
                    const selected = r.appointmentId === selectedApptId
                    const hasClinical = hasClinicalForPatient.has(r.patientId)
                    return (
                      <li key={r.appointmentId}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedApptId(r.appointmentId)
                            setActiveTab('overview')
                            setShowRaw(false)
                          }}
                          className={`w-full rounded-2xl border p-3 text-left transition ${
                            selected
                              ? 'border-teal-300/25 bg-teal-400/10'
                              : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-50">{r.patientName}</div>
                              <div className="mt-0.5 text-xs text-slate-300">
                                {fmtRange(r.startAt, r.endAt)} • {r.reason}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <StatusBadge status={r.status} />
                              {hasClinical ? (
                                <span className="rounded-full border border-teal-300/20 bg-teal-400/10 px-2 py-0.5 text-[11px] font-semibold text-teal-100">
                                  Clinical available
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
              </ul>
            )}
          </div>
        </aside>

        {/* Center panel */}
        <main className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="h-full overflow-auto px-6">
            {!selectedRow ? (
              <div className="py-8">
                <ClinicalEmptyState
                  title="Select a patient from the schedule"
                  body="Select a patient from Today’s Schedule to view appointment details."
                />
              </div>
            ) : (
              <>
                <ProviderPatientHeader
                  selected={selectedRow}
                  clinicalLoaded={!!selectedClinical}
                  fhirPatientId={selectedClinical?.fhirPatientId ?? null}
                  clinicalLastLoadedAt={clinicalLastLoadedAt}
                  loadingClinical={loadClinical.isPending}
                  onLoadClinical={() => loadClinical.mutate(selectedRow.patientId)}
                  onRefresh={() => selectedClinical && loadClinical.mutate(selectedRow.patientId)}
                  onStartTelehealth={() => nav('/provider/telehealth')}
                  onAddNote={() => setActiveTab('documents')}
                />

                <div className="mb-4 flex flex-wrap gap-2">
                  {(
                    [
                      ['overview', 'Overview'],
                      ['history', 'History'],
                      ['labs', 'Labs'],
                      ['medications', 'Medications'],
                      ['allergies', 'Allergies'],
                      ['encounters', 'Encounters'],
                      ['documents', 'Documents'],
                      ['raw', 'Raw FHIR'],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} onClick={() => setActiveTab(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${tabButton(activeTab === k)}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {!selectedClinical && activeTab !== 'raw' ? (
                  <div className="pb-8">
                    <ClinicalEmptyState
                      title="Clinical data is not loaded yet"
                      body="Clinical data is only shown after explicit fetch. Load the clinical record to view history and labs."
                      action={
                        <button
                          className="rounded-lg bg-teal-400/15 px-3 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-400/20"
                          onClick={() => loadClinical.mutate(selectedRow.patientId)}
                        >
                          Load Clinical Data
                        </button>
                      }
                    />
                  </div>
                ) : (
                  <div className="pb-8">
                    {activeTab === 'overview' ? (
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Visit Overview</div>
                          <div className="mt-3 grid gap-2 text-sm">
                            <div className="flex justify-between gap-3 text-slate-300">
                              <span>Reason</span>
                              <span className="text-right text-slate-50">{selectedRow.reason}</span>
                            </div>
                            <div className="flex justify-between gap-3 text-slate-300">
                              <span>Status</span>
                              <span className="text-right text-slate-50">{statusLabel(selectedRow.status)}</span>
                            </div>
                            <div className="flex justify-between gap-3 text-slate-300">
                              <span>Time</span>
                              <span className="text-right text-slate-50">{fmtRange(selectedRow.startAt, selectedRow.endAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-l-4 border-l-teal-400/40 border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.015] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-200/80">
                                Chart preview
                              </div>
                              <div className="mt-1 text-sm font-semibold text-slate-100">Clinical summary</div>
                            </div>
                            <span className="rounded-md border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                              Read-only
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-slate-400">
                            Past medical history is grouped into Allergies, Conditions, Medications, Surgeries, and
                            Relevant history when the chart uses those headers (same narrative as the History tab).
                          </p>
                          <div className="mt-4 space-y-4">
                            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-200/90">
                                Past medical history
                              </div>
                              <div className="mt-3">
                                <MedicalHistorySectionsView
                                  compact
                                  historyText={selectedClinical?.historyText}
                                  emptyMessage="No documented conditions, allergies, or surgical history in this record."
                                />
                              </div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/90">
                                Laboratory &amp; diagnostics
                              </div>
                              <div className="mt-2 text-sm leading-relaxed text-slate-100 whitespace-pre-wrap break-words">
                                {selectedClinical?.labsText?.trim()
                                  ? selectedClinical.labsText
                                  : 'No structured lab narrative on file for this patient.'}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 lg:col-span-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Alerts / Care Flags</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {!selectedClinical?.historyText?.trim() ? <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-200">No history on file</span> : null}
                            {!selectedClinical?.labsText?.trim() ? <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-200">No labs available</span> : null}
                            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-200">Review pending</span>
                          </div>
                        </div>
                      </div>
                    ) : activeTab === 'history' ? (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Medical History</div>
                        <p className="mt-2 text-sm text-slate-300">
                          Read-only chart. Sections appear when the patient record uses headers such as{' '}
                          <span className="text-slate-200">Allergies</span>,{' '}
                          <span className="text-slate-200">Conditions</span>, etc., each on its own line or as{' '}
                          <span className="text-slate-200">Allergies:</span> before text.
                        </p>
                        <div className="mt-4">
                          <MedicalHistorySectionsView
                            historyText={selectedClinical?.historyText}
                            emptyMessage="No medical history on file."
                          />
                        </div>
                      </div>
                    ) : activeTab === 'labs' ? (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Lab Results</div>
                        <p className="mt-2 text-sm text-slate-300">Rendered as clinical narrative (FHIR Observation.valueString).</p>
                        <div className="mt-4 whitespace-pre-wrap text-sm text-slate-50">
                          {selectedClinical?.labsText?.trim() ? selectedClinical.labsText : 'No lab results available.'}
                        </div>
                      </div>
                    ) : activeTab === 'raw' ? (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Raw FHIR</div>
                            <p className="mt-1 text-sm text-slate-300">Bundle JSON from the local FHIR emulator.</p>
                          </div>
                          <button
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.06]"
                            onClick={() => setShowRaw((v) => !v)}
                            disabled={!selectedClinical?.rawFhirBundle}
                          >
                            {showRaw ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        {showRaw ? (
                          <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-slate-100">
                            {JSON.stringify(selectedClinical?.rawFhirBundle ?? {}, null, 2)}
                          </pre>
                        ) : (
                          <div className="mt-4 text-sm text-slate-300">Hidden by default.</div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Coming soon</div>
                        <p className="mt-2 text-sm text-slate-300">This section is ready for future clinical expansion.</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* Right panel */}
        <aside className="flex h-full flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Quick Actions</div>
            <div className="mt-3 grid gap-2">
              <button
                className="rounded-lg bg-teal-400/15 px-3 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-400/20 disabled:opacity-50"
                disabled={!selectedRow || loadClinical.isPending}
                onClick={() => selectedRow && loadClinical.mutate(selectedRow.patientId)}
              >
                {loadClinical.isPending ? 'Loading…' : 'Load Clinical Data'}
              </button>
              <button
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.06] disabled:opacity-50"
                disabled={!selectedRow}
                onClick={() => selectedRow && selectedClinical && loadClinical.mutate(selectedRow.patientId)}
              >
                Refresh Record
              </button>
              <button
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.06]"
                onClick={() => nav('/provider/telehealth')}
              >
                Start Telehealth
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Appointment Details</div>
            {!selectedRow ? (
              <p className="mt-3 text-sm text-slate-300">Select a patient from the schedule.</p>
            ) : (
              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex justify-between gap-3 text-slate-300">
                  <span>Patient</span>
                  <span className="text-right text-slate-50">{selectedRow.patientName}</span>
                </div>
                <div className="flex justify-between gap-3 text-slate-300">
                  <span>Time</span>
                  <span className="text-right text-slate-50">{fmtRange(selectedRow.startAt, selectedRow.endAt)}</span>
                </div>
                <div className="flex justify-between gap-3 text-slate-300">
                  <span>Status</span>
                  <span className="text-right text-slate-50">{selectedRow.status}</span>
                </div>
                <div className="flex justify-between gap-3 text-slate-300">
                  <span>Reason</span>
                  <span className="text-right text-slate-50">{selectedRow.reason}</span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">Alerts / Tasks</div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-200">Review pending</span>
              {!selectedRow ? (
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-200">Select a patient</span>
              ) : !selectedClinical ? (
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-200">Clinical not loaded</span>
              ) : (
                <>
                  {selectedClinical.historyText?.trim() ? null : (
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-200">History missing</span>
                  )}
                  {selectedClinical.labsText?.trim() ? (
                    <span className="rounded-full border border-teal-300/20 bg-teal-400/10 px-3 py-1 text-teal-100">Labs available</span>
                  ) : (
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-200">Labs missing</span>
                  )}
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

