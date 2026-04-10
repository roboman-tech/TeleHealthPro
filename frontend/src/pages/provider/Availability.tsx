import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { providersApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Button, Card, PageTitle } from '../../components/ui'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function ProviderAvailabilityPage() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const { data: slots, isLoading } = useQuery({
    queryKey: ['providers', 'my-availability', token],
    queryFn: () => providersApi.myAvailability(token!),
    enabled: !!token,
  })

  const createSlot = useMutation({
    mutationFn: () =>
      providersApi.createAvailability(token!, {
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers', 'my-availability'] })
      setStart('')
      setEnd('')
    },
  })

  const removeSlot = useMutation({
    mutationFn: (id: number) => providersApi.deleteAvailability(token!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers', 'my-availability'] })
    },
  })

  if (!token) return null

  return (
    <div className="th-page">
      <PageTitle
        kicker="Provider"
        title="Availability"
        subtitle="Publish times when you accept telehealth visits. Patients can only book inside these windows."
      />
      <Card className="th-mb">
        <h3>Add a window</h3>
        <p className="th-muted th-mb">
          Each row is one continuous block (e.g. clinic hours). Overlapping blocks are allowed.
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
        <Button
          onClick={() => createSlot.mutate()}
          disabled={createSlot.isPending || !start || !end}
        >
          {createSlot.isPending ? 'Saving…' : 'Add window'}
        </Button>
        {createSlot.isError ? <p className="th-error">{(createSlot.error as Error).message}</p> : null}
      </Card>
      <Card>
        <h3>Your published windows</h3>
        {isLoading ? <p className="th-muted">Loading…</p> : null}
        <ul className="th-availability-list">
          {slots?.map((s) => (
            <li key={s.id} className="th-availability-row">
              <span>
                {fmt(s.start_at)} → {fmt(s.end_at)}
              </span>
              <Button variant="ghost" type="button" onClick={() => removeSlot.mutate(s.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {!isLoading && !slots?.length ? (
          <p className="th-muted">
            No windows yet — patients cannot request appointments until you publish hours.
          </p>
        ) : null}
      </Card>
    </div>
  )
}
