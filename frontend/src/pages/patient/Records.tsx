import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { clinicalApi, recordsApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Button, Card } from '../../components/ui'
import { PageTitle } from '../../components/ui'
import { minDelay } from '../../utils/minDelay'

export function PatientRecords() {
  const { token, user } = useAuth()
  const qc = useQueryClient()
  const clinicalDirtyRef = useRef(false)

  const { data: rec, isLoading } = useQuery({
    queryKey: ['records', 'me', token],
    queryFn: () => recordsApi.mine(token!),
    enabled: !!token,
    retry: false,
  })
  const [demographics, setDemographics] = useState({ pronouns: '', date_of_birth: '', note: '' })
  const [historyText, setHistoryText] = useState('')
  const [labsText, setLabsText] = useState('')
  const [fhirPatientId, setFhirPatientId] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const clinical = useQuery({
    queryKey: ['clinical', 'me', token],
    queryFn: () => minDelay(clinicalApi.my(token!), 600),
    enabled: !!token,
  })

  const create = useMutation({
    mutationFn: () =>
      recordsApi.createMine(token!, {
        demographics: { ...demographics },
        medical_history: {},
        lab_results: {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['records', 'me'] }),
  })

  const save = useMutation({
    mutationFn: (next: { pronouns: string; date_of_birth: string; note: string }) => {
      if (!user) throw new Error('Not signed in')
      return recordsApi.patch(token!, user.id, { demographics: { ...next } })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['records', 'me'] }),
  })

  const saveSections = useMutation({
    mutationFn: (next: { medical_history: Record<string, unknown>; lab_results: Record<string, unknown> }) => {
      if (!user) throw new Error('Not signed in')
      return minDelay(
        clinicalApi.saveMine(token!, { ...next, fhir_patient_id: fhirPatientId.trim() || undefined }),
        700,
      )
    },
    onSuccess: () => {
      clinicalDirtyRef.current = false
      qc.invalidateQueries({ queryKey: ['clinical', 'me'] })
    },
  })

  useEffect(() => {
    if (!clinical.data || clinical.isLoading) return
    if (clinicalDirtyRef.current) return
    setHistoryText(clinical.data.history_text ?? '')
    setLabsText(clinical.data.labs_text ?? '')
  }, [clinical.data, clinical.isLoading])

  if (isLoading) {
    return (
      <div className="th-page">
        <PageTitle kicker="Patient" title="Medical record" subtitle="Loading…" />
        <p className="th-muted">Fetching your chart…</p>
      </div>
    )
  }
  if (!rec) {
    return (
      <div className="th-page">
        <PageTitle kicker="Patient" title="Medical record" subtitle="Create your profile to begin." />
        <Card>
          <p className="th-sub">No record found yet.</p>
          <label>
            Pronouns (optional)
            <input
              value={demographics.pronouns}
              onChange={(e) => setDemographics({ ...demographics, pronouns: e.target.value })}
            />
          </label>
          <label>
            Date of birth (optional)
            <input
              type="date"
              value={demographics.date_of_birth}
              onChange={(e) => setDemographics({ ...demographics, date_of_birth: e.target.value })}
            />
          </label>
          <label>
            Note (optional)
            <textarea value={demographics.note} onChange={(e) => setDemographics({ ...demographics, note: e.target.value })} rows={2} />
          </label>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Create record'}
          </Button>
        </Card>
      </div>
    )
  }

  const currentDemo = rec.demographics as Record<string, unknown>
  const demoPronouns = typeof currentDemo.pronouns === 'string' ? currentDemo.pronouns : ''
  const demoDob = typeof currentDemo.date_of_birth === 'string' ? currentDemo.date_of_birth : ''
  const demoNote = typeof currentDemo.note === 'string' ? currentDemo.note : ''

  const onSaveClinical = () => {
    if (!user) return
    saveSections.mutate({
      medical_history: { narrative: historyText },
      lab_results: { narrative: labsText },
    })
  }

  return (
    <div className="th-page">
      <PageTitle
        kicker="Patient"
        title="Health record"
        subtitle="Type in everyday language below. Use the large boxes for medical history and lab results, then save once."
      />

      <div className="th-stack" style={{ maxWidth: '52rem', margin: '0 auto' }}>
        <Card>
          <h3>Medical history</h3>
          <p className="th-sub" style={{ marginTop: 0 }}>
            Include allergies, ongoing conditions, medicines you take, past surgeries, and anything else your doctor
            should know. Short phrases or bullet lines are fine.
          </p>
          {clinical.isPending ? <p className="th-muted">Loading your saved text…</p> : null}
          <textarea
            className="th-patient-narrative"
            value={historyText}
            onChange={(e) => {
              clinicalDirtyRef.current = true
              setHistoryText(e.target.value)
            }}
            placeholder={`Use these headings so your provider sees neat sections (each on its own line):\n\nAllergies\nPenicillin (rash)\n\nConditions\nHigh blood pressure\n\nMedications\nAmlodipine 5 mg daily\n\nSurgeries\nAppendix removed (2018)\n\nRelevant history\nAnything else your doctor should know.`}
            spellCheck
            aria-label="Medical history"
          />
        </Card>

        <Card>
          <h3>Lab results</h3>
          <p className="th-sub" style={{ marginTop: 0 }}>
            Paste or type results from a lab portal, or write them in your own words (for example: “Cholesterol test
            March 2024 — total 180”). One result per line helps your provider scan quickly.
          </p>
          <textarea
            className="th-patient-narrative"
            value={labsText}
            onChange={(e) => {
              clinicalDirtyRef.current = true
              setLabsText(e.target.value)
            }}
            placeholder={`Examples:\nA1c: 6.1% (June 2024)\nBlood pressure at home: usually near 128/80\nCOVID vaccine: bivalent 2023`}
            spellCheck
            aria-label="Lab results and test values"
          />
        </Card>

        <Card>
          <div className="th-clinical-card-title">
            <h3 style={{ margin: 0 }}>Save to your chart</h3>
          </div>
          <p className="th-sub" style={{ marginTop: 0 }}>
            This sends your text to your secure clinical record so your care team can read it before or during visits.
          </p>
          <div className="th-form-row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <Button variant="accent" onClick={onSaveClinical} disabled={saveSections.isPending}>
              {saveSections.isPending ? 'Saving to your chart…' : 'Save medical history & labs'}
            </Button>
            {saveSections.isSuccess ? (
              <span className="th-muted" style={{ alignSelf: 'center' }}>
                Saved successfully.
              </span>
            ) : null}
          </div>
          {saveSections.isError ? <p className="th-error">{(saveSections.error as Error).message}</p> : null}
        </Card>

        <Card>
          <h3>Patient profile</h3>
          <p className="th-sub">Optional details your care team may use for scheduling and documentation.</p>
          <label>
            Pronouns
            <input value={demographics.pronouns || demoPronouns} onChange={(e) => setDemographics({ ...demographics, pronouns: e.target.value })} />
          </label>
          <label>
            Date of birth
            <input
              type="date"
              value={demographics.date_of_birth || demoDob}
              onChange={(e) => setDemographics({ ...demographics, date_of_birth: e.target.value })}
            />
          </label>
          <label>
            Note
            <textarea value={demographics.note || demoNote} onChange={(e) => setDemographics({ ...demographics, note: e.target.value })} rows={2} />
          </label>
          <Button
            onClick={() =>
              save.mutate({
                pronouns: demographics.pronouns || demoPronouns,
                date_of_birth: demographics.date_of_birth || demoDob,
                note: demographics.note || demoNote,
              })
            }
            disabled={save.isPending}
          >
            {save.isPending ? 'Saving…' : 'Save profile'}
          </Button>
          {save.isError ? <p className="th-error">{(save.error as Error).message}</p> : null}
        </Card>

        <Card>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="th-link-btn"
            style={{ padding: 0, marginBottom: '0.5rem', border: 'none', background: 'none', cursor: 'pointer' }}
          >
            {showAdvanced ? '▼' : '▶'} Advanced: FHIR patient ID (optional)
          </button>
          {showAdvanced ? (
            <>
              <p className="th-sub">
                Only fill this in if your clinic gave you a specific ID. Most patients can leave this blank.
              </p>
              <label>
                FHIR Patient ID
                <input
                  value={fhirPatientId}
                  onChange={(e) => setFhirPatientId(e.target.value)}
                  placeholder="Optional — from your clinic only"
                />
              </label>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
