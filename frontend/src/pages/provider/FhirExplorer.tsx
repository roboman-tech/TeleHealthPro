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

  return (
    <div className="th-page">
      <PageTitle
        kicker="Provider"
        title="FHIR Patient reader"
        subtitle="Proxied through your FastAPI backend — configure FHIR_BASE_URL on the server."
      />
      <Card>
        <div className="th-form-row">
          <label>
            FHIR Patient id
            <input
              value={fhirId}
              onChange={(e) => setFhirId(e.target.value)}
              placeholder="e.g. example patient id from HAPI"
            />
          </label>
          <Button onClick={() => load.mutate()} disabled={load.isPending || !fhirId.trim()}>
            {load.isPending ? 'Fetching…' : 'Fetch Patient'}
          </Button>
        </div>
        {err ? <p className="th-error">{err}</p> : null}
        {payload ? (
          <pre className="th-json th-json--tall">{JSON.stringify(payload, null, 2)}</pre>
        ) : (
          <p className="th-muted">Raw FHIR JSON will render here for interoperability review.</p>
        )}
      </Card>
    </div>
  )
}
