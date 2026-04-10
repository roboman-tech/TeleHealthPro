import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { websocketOrigin } from '../api/base'
import { useAuth } from '../auth/AuthContext'

function notificationsWsUrl(token: string): string {
  const { host, secure } = websocketOrigin()
  const proto = secure ? 'wss:' : 'ws:'
  return `${proto}//${host}/ws/notifications?token=${encodeURIComponent(token)}`
}

interface ToastPayload {
  id: string
  type?: string
  title?: string
  body?: string
  appointment_id?: number
  session_id?: number
  notification_id?: number
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const qc = useQueryClient()
  const [toasts, setToasts] = useState<ToastPayload[]>([])

  useEffect(() => {
    if (!token) return
    const ws = new WebSocket(notificationsWsUrl(token))
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as Omit<ToastPayload, 'id'>
        const id = crypto.randomUUID()
        setToasts((t) => [...t, { ...data, id }])
        if (
          typeof data.type === 'string' &&
          (data.type.startsWith('appointment.') || data.type.startsWith('telehealth.'))
        ) {
          qc.invalidateQueries({ queryKey: ['appointments', 'mine'] })
          qc.invalidateQueries({ queryKey: ['telehealth', 'sessions'] })
          qc.invalidateQueries({ queryKey: ['notifications'] })
        }
        window.setTimeout(() => {
          setToasts((t) => t.filter((x) => x.id !== id))
        }, 10000)
      } catch {
        /* ignore malformed */
      }
    }
    let loggedBackendDown = false
    ws.onerror = () => {
      if (import.meta.env.DEV && !loggedBackendDown) {
        loggedBackendDown = true
        console.warn(
          '[TeleHealthPro] Notifications WebSocket failed (API unreachable). From backend/: uvicorn app.main:app --reload --host 127.0.0.1 --port 8000',
        )
      }
    }
    return () => {
      ws.close()
    }
  }, [token, qc])

  return (
    <>
      {children}
      <div className="th-toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="th-toast" role="status">
            <div className="th-toast-inner">
              {t.type ? <span className="th-toast-type">{t.type}</span> : null}
              <strong>{t.title ?? 'Notification'}</strong>
              {t.body ? <p>{t.body}</p> : null}
            </div>
            <button
              type="button"
              className="th-toast-x"
              onClick={() => setToasts((x) => x.filter((i) => i.id !== t.id))}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
