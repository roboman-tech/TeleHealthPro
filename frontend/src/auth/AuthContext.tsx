import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch, authApi } from '../api/client'
import type { TokenResponse, User } from '../api/types'

/**
 * JWT fallback when HttpOnly session cookies are missing (dev proxy, localhost vs 127.0.0.1, etc.).
 * Both stores: sessionStorage survives same-tab refresh; localStorage matches across tabs and some edge cases.
 */
const BEARER_STORAGE_KEY = 'telehealthpro_bearer_bootstrap'

function readStoredBearer(): string | null {
  try {
    const a = sessionStorage.getItem(BEARER_STORAGE_KEY)
    if (a) return a
    return localStorage.getItem(BEARER_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistStoredBearer(token: string) {
  try {
    sessionStorage.setItem(BEARER_STORAGE_KEY, token)
  } catch {
    /* private mode */
  }
  try {
    localStorage.setItem(BEARER_STORAGE_KEY, token)
  } catch {
    /* private mode */
  }
}

function clearStoredBearer() {
  try {
    sessionStorage.removeItem(BEARER_STORAGE_KEY)
  } catch {
    /* private mode */
  }
  try {
    localStorage.removeItem(BEARER_STORAGE_KEY)
  } catch {
    /* private mode */
  }
}

function isUnauthenticatedMessage(msg: string): boolean {
  return /not authenticated|invalid session|invalid token|invalid subject|user not found or inactive/i.test(
    msg,
  )
}

interface AuthState {
  /** JWT used only for WebSocket auth (fetched from cookie session). */
  token: string | null
  user: User | null
  loading: boolean
  error: string | null
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<User>
  register: (p: {
    email: string
    password: string
    full_name: string
    role: 'patient' | 'provider'
    date_of_birth?: string
    pronouns?: string
    note?: string
  }) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const clearSession = useCallback(() => {
    clearStoredBearer()
    setToken(null)
    setUser(null)
    queryClient.removeQueries({ queryKey: ['clinical', 'provider', 'fetched'] })
  }, [queryClient])

  const refreshUser = useCallback(async () => {
    try {
      const u = await apiFetch<User>('/auth/me', { token: token ?? undefined })
      setUser(u)
    } catch (e) {
      try {
        const stored = readStoredBearer()
        if (stored) {
          const u = await apiFetch<User>('/auth/me', { token: stored })
          setUser(u)
          setToken(stored)
          return
        }
      } catch {
        /* fall through */
      }
      if (e instanceof Error && isUnauthenticatedMessage(e.message)) {
        clearSession()
      }
    }
  }, [token, clearSession])

  useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        let u: User
        let bearerForToken: string | null = null
        try {
          u = await apiFetch<User>('/auth/me')
        } catch {
          const stored = readStoredBearer()
          if (!stored) throw new Error('NO_STORED_BEARER')
          u = await apiFetch<User>('/auth/me', { token: stored })
          bearerForToken = stored
        }
        if (!alive) return
        setUser(u)
        try {
          const t = await apiFetch<TokenResponse>('/auth/token', {
            token: bearerForToken ?? undefined,
          })
          if (alive) {
            setToken(t.access_token)
            persistStoredBearer(t.access_token)
          }
        } catch {
          if (alive && bearerForToken) {
            setToken(bearerForToken)
            persistStoredBearer(bearerForToken)
          }
        }
      } catch (e) {
        if (!alive) return
        const msg = e instanceof Error ? e.message : ''
        if (msg === 'NO_STORED_BEARER' || isUnauthenticatedMessage(msg)) {
          clearSession()
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [clearSession])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    const t = await authApi.login(email, password)
    persistStoredBearer(t.access_token)
    setToken(t.access_token)
    try {
      const u = await authApi.meCookie()
      setUser(u)
      return u
    } catch {
      const u = await apiFetch<User>('/auth/me', { token: t.access_token })
      setUser(u)
      return u
    }
  }, [])

  const register = useCallback(
    async (p: {
      email: string
      password: string
      full_name: string
      role: 'patient' | 'provider'
    }) => {
      setError(null)
      await authApi.register(p)
    },
    [],
  )

  const logout = useCallback(() => {
    void authApi.logout(token).finally(() => clearSession())
  }, [clearSession, token])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      error,
      login,
      register,
      logout,
      refreshUser,
    }),
    [token, user, loading, error, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
