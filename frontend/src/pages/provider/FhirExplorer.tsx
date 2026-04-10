import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { fhirApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Button, Card } from '../../components/ui'
import { PageTitle } from '../../components/ui'

export function FhirExplorer() {
  const { token } = useAuth()
  const [fhirId, setFhirId] = useState('')
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useMutation({
    mutationFn: () => fhirApi.patient(token!, fhirId.trim()),
    onSuccess: (data) => {
      setPayload(data)
      setErr(null)
    },
    onError: (e: Error) => {
      setPayload(null)
      setErr(e.message)
    },
  })

  const canFetch = !!fhirId.trim() && !load.isPending

  return (
    <div className="th-page">
      <PageTitle
        kicker="Provider"
        title="FHIR Patient reader"
        subtitle="Patient bundles are served from an external FHIR server."
      />
      <Card className="overflow-hidden border-white/10 p-0">
        <div className="border-b border-white/10 bg-gradient-to-r from-violet-500/10 via-transparent to-teal-500/10 px-5 py-4">
          <div className="flex flex-wrap items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 text-lg text-violet-100 ring-1 ring-violet-400/25"
              aria-hidden
            >
              ⎘
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-semibold text-slate-50">Fetch Patient resource</h3>
              <p className="mt-1 text-sm text-slate-400">
                Enter the FHIR Patient id (for example <span className="text-slate-300">pat-…</span> from the clinical
                index). Results return as a Bundle for review.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <label htmlFor="fhir-patient-id-input" className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              FHIR Patient ID
            </span>
            <div className="th-fhir-fetch-bar">
              <input
                id="fhir-patient-id-input"
                value={fhirId}
                onChange={(e) => setFhirId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canFetch) load.mutate()
                }}
                placeholder="e.g. pat-a1b2c3d4e5f6"
                className="th-fhir-fetch-bar__input"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                variant="accent"
                type="button"
                disabled={!canFetch}
                onClick={() => load.mutate()}
                className="th-fhir-fetch-bar__btn text-sm font-semibold hover:brightness-[1.03]"
              >
                {load.isPending ? (
                  <span className="inline-flex items-center justify-center gap-2 py-0.5">
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/20 border-t-slate-900"
                      aria-hidden
                    />
                    Fetching…
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center gap-2 py-0.5">
                    <span aria-hidden className="text-base leading-none opacity-90">
                      ↓
                    </span>
                    Fetch Patient
                  </span>
                )}
              </Button>
            </div>
          </label>

          {err ? (
            <p className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p>
          ) : null}

          <div className="mt-6">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Response</div>
            {payload ? (
              <pre className="th-json th-json--tall">{JSON.stringify(payload, null, 2)}</pre>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">
                Raw FHIR JSON will appear here after a successful fetch.
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
