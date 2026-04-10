/**
 * REST + WS base URL for the FastAPI backend.
 *
 * In dev, when VITE_API_URL is unset, returns '' so requests hit the Vite dev server
 * and are proxied to the API — same site as the SPA, so session cookies (SameSite=Lax) work.
 * Direct http://localhost → http://127.0.0.1 API calls are cross-site and omit those cookies.
 */
export function apiBase(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined
  if (raw !== undefined && String(raw).trim() !== '') {
    return String(raw).replace(/\/$/, '')
  }
  if (import.meta.env.DEV) return ''
  return 'http://localhost:8000'
}

/** Host + TLS for WebSocket URLs (matches apiBase() same-origin dev behavior). */
export function websocketOrigin(): { host: string; secure: boolean } {
  const base = apiBase()
  if (!base) {
    if (typeof window === 'undefined') {
      return { host: 'localhost:5173', secure: false }
    }
    return { host: window.location.host, secure: window.location.protocol === 'https:' }
  }
  const u = new URL(base)
  return { host: u.host, secure: u.protocol === 'https:' }
}
