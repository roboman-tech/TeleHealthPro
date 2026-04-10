import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { appointmentsApi, clinicalApi, recordsApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Badge, Button, Card } from '../../components/ui'
import { PageTitle } from '../../components/ui'
import { minDelay } from '../../utils/minDelay'

function hasAnyValues(obj: unknown): obj is Record<string, unknown> {
  return !!obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj as Record<string, unknown>).length > 0
}

function prettyValue(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function ProviderPatients() {
  const { token } = useAuth()
  const { data: appts } = useQuery({
    queryKey: ['appointments', 'mine', token],
    queryFn: () => appointmentsApi.mine(token!),
    enabled: !!token,
  })

  const patientIds = useMemo(() => {
    const s = new Set<number>()
    appts?.forEach((a) => s.add(a.patient_id))
    return [...s]
  }, [appts])

  const [openId, setOpenId] = useState<number | null>(patientIds[0] ?? null)
  const [fhirId, setFhirId] = useState('')
  const [fhirPayload, setFhirPayload] = useState<Record<string, unknown> | null>(null)
  const [showFhirJson, setShowFhirJson] = useState(false)
  const [clinicalByPatientId, setClinicalByPatientId] = useState<
    Record<
      number,
      { medical_history: Record<string, unknown>; lab_results: Record<string, unknown>; updated_at: string | null }
    >
  >({})
  const [lastFetchedPatientId, setLastFetchedPatientId] = useState<number | null>(null)

  const { data: chart, isLoading: chartLoading } = useQuery({
    queryKey: ['records', openId, token],
    queryFn: () => recordsApi.getOptional(token!, openId!),
    enabled: !!token && openId != null,
  })

  const fetchFhirPatient = useMutation({
    mutationFn: () => minDelay(clinicalApi.byFhirPatientId(token!, fhirId.trim()), 700),
    onSuccess: (data) => {
      setFhirPayload(data.raw_fhir_bundle ?? null)
      setShowFhirJson(true)
      setLastFetchedPatientId(data.patient_user_id ?? null)
      if (data.patient_user_id && (data.history_text || data.labs_text)) {
        setClinicalByPatientId((prev) => ({
          ...prev,
          [data.patient_user_id]: {
            medical_history: { narrative: data.history_text ?? '' },
            lab_results: { narrative: data.labs_text ?? '' },
            updated_at: null,
          },
        }))
      }
    },
  })

  const fetchAllPatients = useMutation({
    mutationFn: () => minDelay(clinicalApi.myPatients(token!), 700),
  })

  const loadClinicalForOpenPatient = useMutation({
    mutationFn: () => minDelay(clinicalApi.patient(token!, openId!), 700),
    onSuccess: (data) => {
      setFhirPayload(data.raw_fhir_bundle ?? null)
      setShowFhirJson(true)
      setLastFetchedPatientId(data.patient_user_id ?? null)
      if (data.patient_user_id && (data.history_text || data.labs_text)) {
        setClinicalByPatientId((prev) => ({
          ...prev,
          [data.patient_user_id]: {
            medical_history: { narrative: data.history_text ?? '' },
            lab_results: { narrative: data.labs_text ?? '' },
            updated_at: null,
          },
        }))
      }
    },
  })

  const loadClinicalForPatient = useMutation({
    mutationFn: (patientUserId: number) => minDelay(clinicalApi.patient(token!, patientUserId), 700),
    onSuccess: (data) => {
      setFhirPayload(data.raw_fhir_bundle ?? null)
      setShowFhirJson(true)
      setLastFetchedPatientId(data.patient_user_id ?? null)
      if (data.patient_user_id && (data.history_text || data.labs_text)) {
        setClinicalByPatientId((prev) => ({
          ...prev,
          [data.patient_user_id]: {
            medical_history: { narrative: data.history_text ?? '' },
            lab_results: { narrative: data.labs_text ?? '' },
            updated_at: null,
          },
        }))
      }
      setOpenId(data.patient_user_id)
    },
  })

  return (
    <div className="th-page">
      <PageTitle
        kicker="Provider"
        title="Patient panel"
        subtitle="Review patient context and pull structured clinical notes through the FHIR workflow."
      />
      <Card className="th-mb">
        <h3>FHIR Patient Reader</h3>
        <p className="th-sub">
          Enter a FHIR Patient ID and fetch. Medical history and lab notes will populate in both the FHIR view and the patient panel.
        </p>
        <div className="th-form-row">
          <label>
            FHIR Patient ID
            <input value={fhirId} onChange={(e) => setFhirId(e.target.value)} placeholder="FHIR Patient ID" />
          </label>
          <Button onClick={() => fetchFhirPatient.mutate()} disabled={!token || fetchFhirPatient.isPending || !fhirId.trim()}>
            {fetchFhirPatient.isPending ? 'Syncing…' : 'Fetch Patient'}
          </Button>
          <Button onClick={() => fetchAllPatients.mutate()} disabled={!token || fetchAllPatients.isPending} variant="ghost">
            {fetchAllPatients.isPending ? 'Loading…' : 'Fetch All Patients'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setShowFhirJson((v) => !v)}
            disabled={!fhirPayload}
          >
            {showFhirJson ? 'Hide FHIR JSON' : 'Show FHIR JSON'}
          </Button>
        </div>
        {fetchFhirPatient.isError ? <p className="th-error">{(fetchFhirPatient.error as Error).message}</p> : null}
        {fetchAllPatients.isError ? <p className="th-error">{(fetchAllPatients.error as Error).message}</p> : null}
        {showFhirJson ? (
          <div className="th-fhir-frame">
            {fhirPayload ? (
              <pre className="th-json th-json--tall">{JSON.stringify(fhirPayload, null, 2)}</pre>
            ) : (
              <p className="th-muted">FHIR content will render here.</p>
            )}
          </div>
        ) : null}
      </Card>
      <div className="th-split">
        <Card className="th-side-list">
          <h3>Patients</h3>
          <ul className="th-list-nav">
            {patientIds.map((id) => {
              const name =
                appts?.find((a) => a.patient_id === id)?.patient_name ?? `Patient #${id}`
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={openId === id ? 'th-list-nav-active' : ''}
                    onClick={() => setOpenId(id)}
                  >
                    {name}
                  </button>
                </li>
              )
            })}
          </ul>
          {!patientIds.length ? <p className="th-muted">No patients yet — bookings will populate this list.</p> : null}
          {fetchAllPatients.data?.patients?.length ? (
            <>
              <h4 style={{ marginTop: '1rem' }}>Assigned patients</h4>
              <div style={{ display: 'grid', gap: '0.65rem' }}>
                {fetchAllPatients.data.patients.map((p) => {
                  const tone = p.has_clinical_data ? 'ok' : 'neutral'
                  const label = p.has_clinical_data ? 'FHIR linked' : 'No clinical data'
                  return (
                    <div
                      key={p.patient_user_id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: '0.5rem',
                        alignItems: 'center',
                        padding: '0.55rem 0.6rem',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        background: 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <strong>Patient #{p.patient_user_id}</strong>
                          <Badge tone={tone}>{label}</Badge>
                        </div>
                        <div className="th-meta" style={{ marginTop: '0.2rem' }}>
                          {p.fhir_patient_id ? `FHIR Patient ID: ${p.fhir_patient_id}` : 'FHIR Patient ID not yet mapped.'}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => loadClinicalForPatient.mutate(p.patient_user_id)}
                        disabled={!token || loadClinicalForPatient.isPending || !p.has_clinical_data}
                      >
                        {loadClinicalForPatient.isPending ? 'Loading…' : 'Load'}
                      </Button>
                    </div>
                  )
                })}
              </div>
              <p className="th-meta" style={{ marginTop: '0.65rem' }}>
                Clinical details are only shown after you click <strong>Load</strong>.
              </p>
            </>
          ) : null}
        </Card>
        <Card>
          {openId == null ? (
            <p className="th-muted">Select a patient.</p>
          ) : chartLoading ? (
            <p className="th-muted">Loading record…</p>
          ) : chart ? (
            <>
              <h3>Record for patient #{openId}</h3>
              <div className="th-form-row" style={{ marginBottom: '0.75rem' }}>
                <Button
                  onClick={() => loadClinicalForOpenPatient.mutate()}
                  disabled={!token || loadClinicalForOpenPatient.isPending || openId == null}
                >
                  {loadClinicalForOpenPatient.isPending ? 'Loading…' : 'Load clinical data'}
                </Button>
                <span className="th-meta">
                  Clinical data is only visible after explicit fetch (FHIR-style workflow).
                </span>
              </div>
              <div className="th-clinical-grid">
                <div>
                  <h4>Demographics</h4>
                  {hasAnyValues(chart.demographics) ? (
                    <ul className="th-plain-list">
                      {Object.entries(chart.demographics).map(([k, v]) => (
                        <li key={k}>
                          <strong>{k}</strong>: {prettyValue(v)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="th-muted">No demographics on file yet.</p>
                  )}
                </div>
                <div>
                  <h4>History</h4>
                  {clinicalByPatientId[openId]?.medical_history ? (
                    <p style={{ whiteSpace: 'pre-wrap' }}>
                      {typeof clinicalByPatientId[openId].medical_history.narrative === 'string'
                        ? clinicalByPatientId[openId].medical_history.narrative
                        : prettyValue(clinicalByPatientId[openId].medical_history)}
                    </p>
                  ) : (
                    <p className="th-muted">
                      Not loaded yet. Use the FHIR Patient Reader above and click Fetch Patient.
                    </p>
                  )}
                </div>
                <div>
                  <h4>Labs</h4>
                  {clinicalByPatientId[openId]?.lab_results ? (
                    <p style={{ whiteSpace: 'pre-wrap' }}>
                      {typeof clinicalByPatientId[openId].lab_results.narrative === 'string'
                        ? clinicalByPatientId[openId].lab_results.narrative
                        : prettyValue(clinicalByPatientId[openId].lab_results)}
                    </p>
                  ) : (
                    <p className="th-muted">
                      Not loaded yet. Use the FHIR Patient Reader above and click Fetch Patient.
                    </p>
                  )}
                </div>
              </div>
              {clinicalByPatientId[openId]?.updated_at ? (
                <p className="th-muted">Clinical data updated at: {clinicalByPatientId[openId].updated_at}</p>
              ) : lastFetchedPatientId && lastFetchedPatientId !== openId ? (
                <p className="th-muted">
                  (You last fetched clinical data for patient #{lastFetchedPatientId}. Open that patient to view it.)
                </p>
              ) : null}
            </>
          ) : (
            <p className="th-muted">No chart on file for this patient yet.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
