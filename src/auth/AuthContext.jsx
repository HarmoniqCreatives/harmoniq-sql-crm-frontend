import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  clearAccessToken,
  getAccessToken,
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
  setAccessToken,
} from '../api/client'

const AuthContext = createContext(null)

/**
 * Provides signed-in user state for the SPA shell.
 *
 * Boot sequence: read access token → GET /auth/me → on failure try refresh cookie
 * → clear tokens if both fail. `signIn` stores the access token locally; refresh
 * tokens prefer the httpOnly cookie set by the API.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function boot() {
      const token = getAccessToken()
      if (!token) {
        if (active) {
          setLoading(false)
        }
        return
      }
      try {
        const payload = await getMe()
        if (active) {
          setUser(payload.data.user)
        }
      } catch {
        try {
          const refreshed = await refreshSession()
          setAccessToken(refreshed.data.accessToken)
          const payload = await getMe()
          if (active) {
            setUser(payload.data.user)
          }
        } catch {
          clearAccessToken()
          if (active) {
            setUser(null)
          }
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    boot()
    return () => {
      active = false
    }
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    /**
     * @param {{ email: string, password: string, companyId?: string }} credentials
     */
    async signIn(credentials) {
      const payload = await loginRequest(credentials)
      setAccessToken(payload.data.accessToken)
      setUser(payload.data.user)
      return payload.data
    },
    async signOut() {
      try {
        await logoutRequest({})
      } catch {
        // Ignore network errors during logout.
      }
      clearAccessToken()
      setUser(null)
    },
    setUser,
  }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * @returns {{ user: object|null, loading: boolean, signIn: Function, signOut: Function }}
 */
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return value
}
