import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  clearAccessToken,
  getAccessToken,
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
  setAccessToken,
  setAuthFailureHandler,
} from '../api/client'
import {
  deactivateWebPushOnLogout,
  syncWebPushTokenIfPermitted,
} from '../lib/webPush'
import { bootAuthSession } from './sessionBoot'

const AuthContext = createContext(null)

/**
 * Provides signed-in user state for the SPA shell.
 *
 * Boot sequence: access token → GET /auth/me; if token missing or /me fails, try
 * refresh cookie once → store access token → GET /auth/me; clear on failure.
 * Mid-session 401s use the Axios interceptor (single-flight refresh + retry);
 * failed refresh clears auth via setAuthFailureHandler.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setAuthFailureHandler(() => {
      clearAccessToken()
      setUser(null)
    })
    return () => {
      setAuthFailureHandler(null)
    }
  }, [])

  useEffect(() => {
    let active = true
    async function boot() {
      // Restore via access token and/or httpOnly refresh cookie (see bootAuthSession).
      const restored = await bootAuthSession({
        getAccessToken,
        setAccessToken,
        clearAccessToken,
        getMe,
        refreshSession,
      })
      if (!active) {
        return
      }
      if (restored) {
        setUser(restored)
        void syncWebPushTokenIfPermitted()
      } else {
        setUser(null)
      }
      setLoading(false)
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
      void syncWebPushTokenIfPermitted()
      return payload.data
    },
    async signOut() {
      try {
        await deactivateWebPushOnLogout()
      } catch {
        // Best-effort device deactivation.
      }
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
