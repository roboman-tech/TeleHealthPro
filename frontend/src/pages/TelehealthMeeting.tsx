import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { websocketOrigin } from '../api/base'
import { appointmentsApi, telehealthApi } from '../api/client'
import type { TelehealthSessionStatus } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Badge, Button } from '../components/ui'

function sessionStatusTone(s: TelehealthSessionStatus): 'ok' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (s === 'live') return 'ok'
  if (s === 'ready') return 'warn'
  if (s === 'patient_joined' || s === 'provider_joined') return 'info'
  if (s === 'ended' || s === 'expired') return 'bad'
  return 'neutral'
}

type ChatPayload = {
  type: string
  from_user_id: number
  from_name: string
  text: string
  at: string
}

function wsUrlForChat(sessionId: number, token: string): string {
  const { host, secure } = websocketOrigin()
  const proto = secure ? 'wss:' : 'ws:'
  return `${proto}//${host}/ws/telehealth/${sessionId}/chat?token=${encodeURIComponent(token)}`
}

const VISIT_DOCS_VISIBLE_KEY = 'telehealthpro_meeting_visit_docs_visible'

function readVisitDocsVisiblePreference(): boolean {
  try {
    const v = sessionStorage.getItem(VISIT_DOCS_VISIBLE_KEY)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

function persistVisitDocsVisiblePreference(visible: boolean) {
  try {
    sessionStorage.setItem(VISIT_DOCS_VISIBLE_KEY, visible ? '1' : '0')
  } catch {
    /* private mode / quota */
  }
}

export function TelehealthMeeting() {
  const [params] = useSearchParams()
  const sessionId = Number(params.get('session'))
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatPayload[]>([])
  const [pastScheduledEnd, setPastScheduledEnd] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const validId = Number.isFinite(sessionId) && sessionId > 0

  const { data, error, isLoading } = useQuery({
    queryKey: ['telehealth', 'meeting-page', token, sessionId],
    queryFn: async () => {
      const [session, meeting] = await Promise.all([
        telehealthApi.get(token!, sessionId),
        telehealthApi.meetingInfo(token!, sessionId),
      ])
      return { session, meeting }
    },
    enabled: !!token && validId,
    retry: false,
  })

  const appointmentIdForDoc = data?.session?.appointment_id

  const { data: documentation } = useQuery({
    queryKey: ['appointments', 'documentation', token, appointmentIdForDoc],
    queryFn: () => appointmentsApi.getDocumentation(token!, appointmentIdForDoc!),
    enabled:
      !!token &&
      validId &&
      appointmentIdForDoc != null &&
      appointmentIdForDoc > 0,
  })

  const canEditDocumentation = user?.role === 'provider' || user?.role === 'admin'

  const [visitDocsVisible, setVisitDocsVisible] = useState(readVisitDocsVisiblePreference)
  const toggleVisitDocsVisible = useCallback(() => {
    setVisitDocsVisible((v) => {
      const next = !v
      persistVisitDocsVisiblePreference(next)
      return next
    })
  }, [])

  const [docDraft, setDocDraft] = useState({
    visit_notes: '',
    diagnosis_summary: '',
    care_plan: '',
    follow_up_instructions: '',
    internal_provider_note: '',
    patient_after_visit_summary: '',
  })

  useEffect(() => {
    if (!documentation || !canEditDocumentation) return
    setDocDraft({
      visit_notes: documentation.visit_notes ?? '',
      diagnosis_summary: documentation.diagnosis_summary ?? '',
      care_plan: documentation.care_plan ?? '',
      follow_up_instructions: documentation.follow_up_instructions ?? '',
      internal_provider_note: documentation.internal_provider_note ?? '',
      patient_after_visit_summary: documentation.patient_after_visit_summary ?? '',
    })
  }, [documentation, canEditDocumentation])

  useEffect(() => {
    if (!data?.session || !token || !validId) return
    let cancelled = false
    void telehealthApi.logActivity(token, sessionId, { action: 'entered_meeting_room' }).then(() => {
      if (!cancelled) qc.invalidateQueries({ queryKey: ['telehealth'] })
    })
    return () => {
      cancelled = true
    }
  }, [data?.session?.id, token, validId, sessionId, qc])

  const appointmentEndMs = useMemo(() => {
    const iso = data?.meeting?.appointment_end_at
    if (!iso) return 0
    const t = new Date(iso).getTime()
    return Number.isFinite(t) ? t : 0
  }, [data?.meeting?.appointment_end_at])

  useEffect(() => {
    if (!appointmentEndMs) return
    const tick = () => setPastScheduledEnd(Date.now() > appointmentEndMs)
    tick()
    const id = window.setInterval(tick, 15_000)
    return () => window.clearInterval(id)
  }, [appointmentEndMs])

  const jitsiSrc = useMemo(() => {
    if (!data?.meeting || !user) return ''
    const { jitsi_base_url, room_name } = data.meeting
    const base = jitsi_base_url.replace(/\/$/, '')
    const name = encodeURIComponent(user.full_name || user.email || 'Guest')
    return `${base}/${encodeURIComponent(room_name)}#userInfo.displayName=${name}&config.prejoinPageEnabled=false`
  }, [data?.meeting, user])

  const chatAllowed = Boolean(data?.meeting && data.meeting.can_join_video)

  useEffect(() => {
    if (!token || !validId || !chatAllowed) return
    const url = wsUrlForChat(sessionId, token)
    const ws = new WebSocket(url)
    wsRef.current = ws
    let intentionalClose = false
    ws.onclose = (ev) => {
      if (intentionalClose) return
      const text =
        ev.code === 4409
          ? 'Chat blocked: this visit is outside the allowed time window.'
          : ev.code === 4410
            ? 'Chat closed: this visit session has ended.'
            : ev.code === 4401
              ? 'Chat disconnected: your session expired. Please refresh and sign in again.'
              : ev.code === 4403
                ? 'Chat blocked: you do not have access to this session.'
                : `Chat disconnected (code ${ev.code || 0}).`

      setChatMessages((prev) => [
        ...prev,
        {
          type: 'system',
          from_user_id: -1,
          from_name: 'System',
          text,
          at: new Date().toISOString(),
        },
      ])
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as ChatPayload
        if (msg.type === 'chat' && typeof msg.text === 'string') {
          setChatMessages((prev) => [...prev, msg])
        }
      } catch {
        /* ignore */
      }
    }
    return () => {
      intentionalClose = true
      ws.close()
      wsRef.current = null
    }
  }, [sessionId, token, validId, chatAllowed])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const sendChat = useCallback(() => {
    const text = chatInput.trim()
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ text }))
    setChatInput('')
  }, [chatInput])

  const leaveTo =
    user?.role === 'provider'
      ? '/provider/telehealth'
      : user?.role === 'admin'
        ? '/admin'
        : '/patient/telehealth'

  const endSession = useMutation({
    mutationFn: () => telehealthApi.endSession(token!, sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['telehealth', 'meeting-page'] })
      qc.invalidateQueries({ queryKey: ['telehealth'] })
    },
  })

  const markAppointmentComplete = useMutation({
    mutationFn: (appointmentId: number) =>
      appointmentsApi.patch(token!, appointmentId, { status: 'completed' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', 'mine'] })
      qc.invalidateQueries({ queryKey: ['telehealth'] })
    },
  })

  const completeAndClose = useMutation({
    mutationFn: async (appointmentId: number) => {
      await telehealthApi.endSession(token!, sessionId)
      await appointmentsApi.patch(token!, appointmentId, { status: 'completed' })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments', 'mine'] })
      qc.invalidateQueries({ queryKey: ['telehealth'] })
      navigate('/provider/appointments')
    },
  })

  const saveDocumentation = useMutation({
    mutationFn: (appointmentId: number) =>
      appointmentsApi.patchDocumentation(token!, appointmentId, {
        visit_notes: docDraft.visit_notes.trim() || null,
        diagnosis_summary: docDraft.diagnosis_summary.trim() || null,
        care_plan: docDraft.care_plan.trim() || null,
        follow_up_instructions: docDraft.follow_up_instructions.trim() || null,
        internal_provider_note: docDraft.internal_provider_note.trim() || null,
        patient_after_visit_summary: docDraft.patient_after_visit_summary.trim() || null,
      }),
    onSuccess: (_d, appointmentId) => {
      qc.invalidateQueries({ queryKey: ['appointments', 'documentation', token, appointmentId] })
    },
  })

  const canJoinVideo = Boolean(data?.meeting?.can_join_video)
  const isProvider = user?.role === 'provider'

  const patientFacingDoc =
    documentation &&
    (documentation.follow_up_instructions?.trim() ||
      documentation.patient_after_visit_summary?.trim())

  if (!validId) {
    return (
      <div className="th-meeting-error">
        <p>Invalid session. Open a visit from Telehealth or your appointment list.</p>
        <Link to="/">Home</Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="th-meeting-loading">
        <div className="th-spinner" />
        <p>Loading meeting…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="th-meeting-error">
        <p className="th-error">{(error as Error)?.message ?? 'Could not load meeting.'}</p>
        <Button variant="ghost" onClick={() => navigate(leaveTo)}>
          Back
        </Button>
      </div>
    )
  }

  return (
    <div className="th-meeting">
      {pastScheduledEnd && canJoinVideo ? (
        <div className="th-meeting-alarm" role="status">
          <strong>Scheduled end time has passed.</strong> The visit can continue; nothing is auto-completed. Use{' '}
          <strong>Mark complete</strong> or <strong>Complete &amp; close</strong> when you are done.
        </div>
      ) : null}
      {!canJoinVideo ? (
        <div className="th-meeting-alarm" role="status">
          This telehealth session has ended. Video and chat are closed. Return to your dashboard or review the
          appointment record.
        </div>
      ) : null}
      <header className="th-meeting-header">
        <div>
          <span className="th-meeting-badge">Session #{data.session.id}</span>
          <span className="th-muted"> · Appointment #{data.session.appointment_id}</span>
          <span className="th-meeting-header-status">
            {' '}
            · Session:{' '}
            <Badge tone={sessionStatusTone(data.meeting.session_status)}>{data.meeting.session_status}</Badge>
          </span>
        </div>
        <div className="th-meeting-header-actions">
          <span className="th-muted">Video via Jitsi · Chat is in-app</span>
          {isProvider && canJoinVideo ? (
            <>
              <Button
                variant="ghost"
                onClick={() => endSession.mutate()}
                disabled={endSession.isPending}
              >
                End session
              </Button>
              <Button
                variant="ghost"
                onClick={() => markAppointmentComplete.mutate(data.session.appointment_id)}
                disabled={markAppointmentComplete.isPending}
              >
                Mark complete
              </Button>
              <Button
                variant="primary"
                onClick={() => completeAndClose.mutate(data.session.appointment_id)}
                disabled={completeAndClose.isPending}
              >
                Complete &amp; close
              </Button>
            </>
          ) : null}
          <Button variant="ghost" onClick={() => navigate(leaveTo)}>
            Leave meeting
          </Button>
        </div>
      </header>
      <div className="th-meeting-body">
        <div className="th-meeting-video">
          {jitsiSrc && canJoinVideo ? (
            <iframe
              title="Jitsi Meet"
              src={jitsiSrc}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="th-meeting-iframe"
            />
          ) : null}
        </div>
        <aside className="th-meeting-chat">
          <h2 className="th-meeting-chat-title">Chat</h2>
          <div className="th-meeting-chat-log">
            {chatMessages.map((m, i) => (
              <div key={`${m.at}-${i}`} className="th-meeting-chat-msg">
                <strong>{m.from_name}</strong>
                <span className="th-meeting-chat-time">
                  {new Date(m.at).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                </span>
                <p>{m.text}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="th-meeting-chat-compose">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), sendChat())}
              placeholder="Message the room…"
              className="th-meeting-chat-input"
              maxLength={2000}
            />
            <Button
              variant="primary"
              onClick={sendChat}
              disabled={!chatInput.trim() || !canJoinVideo}
            >
              Send
            </Button>
          </div>
        </aside>
      </div>

      {canEditDocumentation && data.session.appointment_id ? (
        <section
          id="visit-doc-panel"
          className={`th-meeting-docs${visitDocsVisible ? '' : ' th-meeting-docs--collapsed'}`}
          {...(visitDocsVisible
            ? { 'aria-labelledby': 'visit-doc-heading' as const }
            : { 'aria-label': 'Visit documentation' })}
        >
          <div className="th-meeting-docs-toggle-row">
            <Button
              variant="ghost"
              type="button"
              onClick={toggleVisitDocsVisible}
              aria-expanded={visitDocsVisible}
              {...(visitDocsVisible ? { 'aria-controls': 'visit-doc-panel-body' as const } : {})}
            >
              {visitDocsVisible ? 'Hide visit documentation' : 'Show visit documentation'}
            </Button>
          </div>
          {visitDocsVisible ? (
            <div id="visit-doc-panel-body">
              <h2 id="visit-doc-heading">Visit documentation</h2>
              <p className="th-meeting-docs-sub">
                Linked to this appointment. Patients only see <strong>Follow-up</strong> and{' '}
                <strong>After-visit summary</strong>.
              </p>
              <div className="th-meeting-docs-grid">
                <label>
                  Visit notes
                  <textarea
                    value={docDraft.visit_notes}
                    onChange={(e) => setDocDraft((d) => ({ ...d, visit_notes: e.target.value }))}
                    rows={4}
                  />
                </label>
                <label>
                  Diagnosis summary
                  <textarea
                    value={docDraft.diagnosis_summary}
                    onChange={(e) => setDocDraft((d) => ({ ...d, diagnosis_summary: e.target.value }))}
                    rows={4}
                  />
                </label>
                <label>
                  Care plan
                  <textarea
                    value={docDraft.care_plan}
                    onChange={(e) => setDocDraft((d) => ({ ...d, care_plan: e.target.value }))}
                    rows={4}
                  />
                </label>
                <label>
                  Follow-up instructions (patient-visible)
                  <textarea
                    value={docDraft.follow_up_instructions}
                    onChange={(e) => setDocDraft((d) => ({ ...d, follow_up_instructions: e.target.value }))}
                    rows={4}
                  />
                </label>
                <label>
                  Internal note (provider only)
                  <textarea
                    value={docDraft.internal_provider_note}
                    onChange={(e) => setDocDraft((d) => ({ ...d, internal_provider_note: e.target.value }))}
                    rows={3}
                  />
                </label>
                <label>
                  After-visit summary (patient-visible)
                  <textarea
                    value={docDraft.patient_after_visit_summary}
                    onChange={(e) =>
                      setDocDraft((d) => ({ ...d, patient_after_visit_summary: e.target.value }))
                    }
                    rows={4}
                  />
                </label>
              </div>
              <div className="th-meeting-docs-actions">
                <Button
                  variant="primary"
                  onClick={() => saveDocumentation.mutate(data.session.appointment_id)}
                  disabled={saveDocumentation.isPending}
                >
                  Save documentation
                </Button>
                {saveDocumentation.isError ? (
                  <span className="th-error">{(saveDocumentation.error as Error).message}</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!canEditDocumentation && patientFacingDoc ? (
        <section className="th-meeting-docs" aria-labelledby="patient-avs-heading">
          <h2 id="patient-avs-heading">After your visit</h2>
          {documentation!.patient_after_visit_summary?.trim() ? (
            <>
              <h3 className="th-meeting-docs-sub" style={{ marginBottom: '0.35rem' }}>
                Summary
              </h3>
              <p className="th-meeting-docs-patient-block">
                {documentation!.patient_after_visit_summary}
              </p>
            </>
          ) : null}
          {documentation!.follow_up_instructions?.trim() ? (
            <>
              <h3 className="th-meeting-docs-sub" style={{ margin: '1rem 0 0.35rem' }}>
                Follow-up
              </h3>
              <p className="th-meeting-docs-patient-block">
                {documentation!.follow_up_instructions}
              </p>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
