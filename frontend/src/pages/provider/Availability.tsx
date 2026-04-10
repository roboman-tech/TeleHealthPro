import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { providersApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { DateScheduleInput } from '../../components/DateScheduleInput'
import { Button, Card, PageTitle } from '../../components/ui'
import { toDatetimeLocalValue } from '../../utils/datetimeLocal'

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function isExpired(iso: string) {
  return new Date(iso).getTime() < Date.now()
}

function durationHint(startVal: string, endVal: string): string | null {
  if (!startVal || !endVal) return null
  const a = new Date(startVal).getTime()
  const b = new Date(endVal).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  if (b <= a) return 'End must be after start.'
  const ms = b - a
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const d = Math.floor(ms / 86400000)
  if (d > 0) {
    const remH = h % 24
    return remH > 0 ? `${d}d ${remH}h` : `${d} day${d === 1 ? '' : 's'}`
  }
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h} hour${h === 1 ? '' : 's'}`
  return `${m} minute${m === 1 ? '' : 's'}`
}

/** Parse a datetime-local string back to a Date in local timezone. */
function parseDatetimeLocal(value: string): Date | null {
  if (!value) return null
  const [datePart, timePart] = value.split('T')
  if (!datePart || !timePart) return null
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const d = new Date()
  d.setFullYear(year, month - 1, day)
  d.setHours(hour, minute, 0, 0)
  return d
}

/** Build a datetime-local value: keep the date from `current` (or use tomorrow) and apply new hour/min. */
function applyQuickTime(current: string, hour: number, minute: number): string {
  const base = parseDatetimeLocal(current) ?? (() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow
  })()
  base.setHours(hour, minute, 0, 0)
  return toDatetimeLocalValue(base)
}

/** Recommended open-window times (clinic start). */
const OPEN_QUICK_TIMES = [
  { label: '07:00', h: 7, m: 0 },
  { label: '08:00', h: 8, m: 0 },
  { label: '09:00', h: 9, m: 0 },
  { label: '12:00', h: 12, m: 0 },
  { label: '14:00', h: 14, m: 0 },
]

/** Recommended close-window times (clinic end). */
const CLOSE_QUICK_TIMES = [
  { label: '12:00', h: 12, m: 0 },
  { label: '13:00', h: 13, m: 0 },
  { label: '17:00', h: 17, m: 0 },
  { label: '18:00', h: 18, m: 0 },
  { label: '20:00', h: 20, m: 0 },
]

function ClockIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function CalendarRangeIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v3M16 3v3M8 14h2M14 14h2M8 17.5h5" />
    </svg>
  )
}

function WindowPanel({
  id,
  label,
  sublabel,
  accentColor,
  value,
  onChange,
}: {
  id: string
  label: string
  sublabel: string
  accentColor: 'teal' | 'rose'
  value: string
  onChange: (v: string) => void
}) {
  const isTeal = accentColor === 'teal'
  const dot = isTeal ? '#2dd4bf' : '#fb4472'
  const headerBg = isTeal ? 'rgba(45,212,191,0.07)' : 'rgba(251,68,114,0.07)'
  const headerBorder = isTeal ? 'rgba(45,212,191,0.14)' : 'rgba(251,68,114,0.14)'
  const cardBg = isTeal ? 'rgba(45,212,191,0.025)' : 'rgba(251,68,114,0.025)'

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
        background: cardBg,
      }}
    >
      {/* Panel header */}
      <div
        style={{
          padding: '0.625rem 0.9rem',
          background: headerBg,
          borderBottom: `1px solid ${headerBorder}`,
          display: 'flex',
          alignItems: 'center',
          gap: '0.55rem',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dot,
            flexShrink: 0,
            boxShadow: `0 0 8px ${dot}80`,
          }}
        />
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: dot,
              lineHeight: 1.2,
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sublabel}</div>
        </div>
      </div>

      {/* Input area */}
      <div style={{ padding: '0.65rem 0.75rem 0.55rem' }}>
        <label htmlFor={id} className="sr-only">
          {label} date and time
        </label>
        <DateScheduleInput
          id={id}
          inputType="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />

        {/* Quick-time recommendation chips */}
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              opacity: 0.7,
              marginRight: 2,
              flexShrink: 0,
            }}
          >
            Suggested
          </span>
          {(isTeal ? OPEN_QUICK_TIMES : CLOSE_QUICK_TIMES).map(({ label: tlabel, h, m }) => {
            const chipVal = applyQuickTime(value, h, m)
            const active = value === chipVal
            return (
              <button
                key={tlabel}
                type="button"
                onClick={() => onChange(chipVal)}
                title={`Set to ${tlabel}`}
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  fontWeight: active ? 700 : 500,
                  padding: '0.18rem 0.5rem',
                  borderRadius: 6,
                  border: `1px solid ${active ? dot : 'var(--border)'}`,
                  background: active
                    ? isTeal ? 'rgba(45,212,191,0.18)' : 'rgba(251,68,114,0.18)'
                    : 'rgba(255,255,255,0.04)',
                  color: active ? dot : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                  letterSpacing: '0.02em',
                }}
              >
                {tlabel}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
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

  const hint = useMemo(() => durationHint(start, end), [start, end])
  const isError = hint === 'End must be after start.'
  const canSubmit = !!start && !!end && !isError

  if (!token) return null

  const activeSlots = slots?.filter((s) => !isExpired(s.end_at)) ?? []
  const pastSlots = slots?.filter((s) => isExpired(s.end_at)) ?? []

  return (
    <div className="th-page">
      <PageTitle
        kicker="Provider"
        title="Availability"
        subtitle="Publish consultation windows so patients can book appointments within your hours."
      />

      {/* ── Add a window card ─────────────────────────── */}
      <Card className="th-mb overflow-hidden p-0">
        {/* Card header */}
        <div
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'linear-gradient(135deg, rgba(45,212,191,0.065) 0%, rgba(56,189,248,0.04) 100%)',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.85rem',
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 11,
              flexShrink: 0,
              background: 'var(--accent-dim)',
              border: '1px solid rgba(45,212,191,0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
            }}
          >
            <CalendarRangeIcon />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              Schedule Consultation Window
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Each block is one continuous availability span — patients can only request visits within these hours.
            </p>
          </div>
        </div>

        {/* Card body */}
        <div style={{ padding: '1.25rem' }}>
          {/* START / END panels */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'stretch',
              gap: '0.75rem',
            }}
          >
            <WindowPanel
              id="avail-start"
              label="Window Opens"
              sublabel="Availability start time"
              accentColor="teal"
              value={start}
              onChange={setStart}
            />

            {/* Timeline connector */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                flexShrink: 0,
                width: 36,
                paddingTop: 32,
              }}
            >
              <div style={{ width: 2, height: 14, borderRadius: 1, background: 'rgba(45,212,191,0.35)' }} />
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-panel)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
                aria-hidden
              >
                →
              </div>
              <div style={{ width: 2, height: 14, borderRadius: 1, background: 'rgba(251,68,114,0.35)' }} />
            </div>

            <WindowPanel
              id="avail-end"
              label="Window Closes"
              sublabel="Availability end time"
              accentColor="rose"
              value={end}
              onChange={setEnd}
            />
          </div>

          {/* Duration / error bar */}
          {hint ? (
            isError ? (
              <div
                style={{
                  marginTop: 12,
                  padding: '0.6rem 0.9rem',
                  background: 'rgba(251,146,60,0.1)',
                  borderRadius: 10,
                  border: '1px solid rgba(251,146,60,0.22)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: '#fdba74',
                }}
              >
                <span aria-hidden style={{ fontSize: 15 }}>⚠</span>
                <span>{hint}</span>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 12,
                  padding: '0.6rem 0.9rem',
                  background: 'rgba(45,212,191,0.07)',
                  borderRadius: 10,
                  border: '1px solid rgba(45,212,191,0.16)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--text-muted)',
                }}
              >
                <span style={{ color: 'var(--accent)', flexShrink: 0 }}>
                  <ClockIcon />
                </span>
                <span>
                  Session duration:{' '}
                  <strong style={{ color: 'var(--accent)' }}>{hint}</strong>
                </span>
              </div>
            )
          ) : null}

          {/* Actions */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant="accent"
              type="button"
              onClick={() => createSlot.mutate()}
              disabled={createSlot.isPending || !canSubmit}
              style={{ minHeight: 42, paddingLeft: '1.35rem', paddingRight: '1.35rem' }}
            >
              {createSlot.isPending ? 'Saving…' : '+ Publish Window'}
            </Button>
            {(start || end) ? (
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  padding: '0.25rem 0',
                  fontFamily: 'var(--font)',
                }}
                onClick={() => {
                  setStart('')
                  setEnd('')
                }}
              >
                Clear times
              </button>
            ) : null}
          </div>

          {createSlot.isError ? (
            <p className="th-error" style={{ marginTop: 8 }}>
              {(createSlot.error as Error).message}
            </p>
          ) : null}
        </div>
      </Card>

      {/* ── Published schedule card ───────────────────── */}
      <Card className="overflow-hidden p-0">
        {/* Card header */}
        <div
          style={{
            borderBottom: '1px solid var(--border)',
            padding: '0.85rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>
              Published Schedule
            </h3>
            <p style={{ margin: '0.15rem 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {isLoading
                ? 'Loading…'
                : slots?.length
                  ? `${activeSlots.length} active · ${pastSlots.length} past`
                  : 'No windows published yet'}
            </p>
          </div>
          {activeSlots.length > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--accent)',
                background: 'var(--accent-dim)',
                border: '1px solid rgba(45,212,191,0.2)',
                borderRadius: 999,
                padding: '0.2rem 0.65rem',
              }}
            >
              {activeSlots.length} active
            </span>
          )}
        </div>

        {/* Slot list */}
        {isLoading ? (
          <div style={{ padding: '1.5rem 1.25rem' }}>
            <p className="th-muted" style={{ margin: 0 }}>Loading your schedule…</p>
          </div>
        ) : !slots?.length ? (
          <div style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: 'var(--bg-panel-strong)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              <CalendarRangeIcon />
            </div>
            <p className="th-muted" style={{ margin: 0, fontSize: 14 }}>
              No availability published — patients cannot book until you add windows above.
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: '0.5rem 0' }}>
            {slots.map((s) => {
              const expired = isExpired(s.end_at)
              const dur = durationHint(s.start_at, s.end_at)
              return (
                <li
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.8rem 1.25rem',
                    borderBottom: '1px solid var(--border)',
                    opacity: expired ? 0.55 : 1,
                  }}
                >
                  {/* Status strip */}
                  <div
                    style={{
                      width: 4,
                      alignSelf: 'stretch',
                      borderRadius: 4,
                      flexShrink: 0,
                      background: expired
                        ? 'rgba(255,255,255,0.12)'
                        : 'linear-gradient(180deg, var(--accent), #0891b2)',
                    }}
                  />

                  {/* Date/time details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>{fmtDay(s.start_at)}</span>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>·</span>
                      <span style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: 12 }}>
                        {fmtTime(s.start_at)}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>
                      <span style={{ color: '#fb4472', fontFamily: 'monospace', fontSize: 12 }}>
                        {fmtTime(s.end_at)}
                      </span>
                      {dur && dur !== 'End must be after start.' ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            background: 'var(--bg-panel-strong)',
                            border: '1px solid var(--border)',
                            borderRadius: 999,
                            padding: '0.1rem 0.5rem',
                          }}
                        >
                          {dur}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                      {expired ? 'Past window' : fmt(s.start_at) + ' → ' + fmt(s.end_at)}
                    </div>
                  </div>

                  {/* Status badge */}
                  {expired ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border)',
                        borderRadius: 999,
                        padding: '0.2rem 0.55rem',
                        flexShrink: 0,
                      }}
                    >
                      Expired
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--accent)',
                        background: 'var(--accent-dim)',
                        border: '1px solid rgba(45,212,191,0.2)',
                        borderRadius: 999,
                        padding: '0.2rem 0.55rem',
                        flexShrink: 0,
                      }}
                    >
                      Active
                    </span>
                  )}

                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => removeSlot.mutate(s.id)}
                    style={{ fontSize: 12, padding: '0.3rem 0.75rem', flexShrink: 0 }}
                  >
                    Remove
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
