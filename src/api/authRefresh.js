/**
 * Shared access-token refresh coordination for Axios 401 handling.
 * Exactly one in-flight refresh; callers await the same promise.
 */

let refreshPromise = null

/** @returns {boolean} */
export function isRefreshInFlight() {
  return Boolean(refreshPromise)
}

/** Exists so unit tests start from a clean refresh lock. */
export function resetAuthRefreshState() {
  refreshPromise = null
}

/**
 * True when a 401 must not trigger refresh (login/refresh loops).
 * @param {string} [url]
 */
export function shouldSkipAuthRefresh(url) {
  const path = String(url || '')
  return path.includes('/auth/login')
    || path.includes('/auth/refresh')
    || path.includes('/auth/register')
    || path.includes('/auth/forgot-password')
    || path.includes('/auth/reset-password')
    || path.includes('/auth/verify-email')
    || path.includes('/auth/resend-verification')
    || path.includes('/auth/companies')
}

/**
 * Runs refreshSession once; concurrent callers share the same promise.
 * @param {() => Promise<{ data: { accessToken: string } }>} refreshSession
 */
export function runSingleFlightRefresh(refreshSession) {
  if (!refreshPromise) {
    refreshPromise = Promise.resolve()
      .then(() => refreshSession())
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

/**
 * Builds an Axios response error interceptor for 401 → refresh once → retry.
 *
 * @param {object} deps
 * @param {import('axios').AxiosInstance} deps.api
 * @param {() => Promise<{ data: { accessToken: string } }>} deps.refreshSession
 * @param {(token: string) => void} deps.setAccessToken
 * @param {() => void} deps.clearAccessToken
 * @param {() => void} deps.onAuthFailure clears SPA auth (no forced logout on 403/5xx)
 */
export function createAuthResponseInterceptor(deps) {
  const {
    api,
    refreshSession,
    setAccessToken,
    clearAccessToken,
    onAuthFailure,
  } = deps

  return async function authResponseErrorInterceptor(error) {
    const status = error && error.response ? error.response.status : null
    const original = error && error.config ? error.config : null

    if (!error.response) {
      return Promise.reject(error)
    }
    if (status === 403) {
      return Promise.reject(error)
    }
    if (status !== 401 || !original) {
      return Promise.reject(error)
    }
    if (original._authRetry) {
      return Promise.reject(error)
    }
    if (shouldSkipAuthRefresh(original.url)) {
      return Promise.reject(error)
    }

    original._authRetry = true
    try {
      const refreshed = await runSingleFlightRefresh(refreshSession)
      const accessToken = refreshed && refreshed.data ? refreshed.data.accessToken : ''
      if (!accessToken) {
        throw new Error('Refresh did not return an access token')
      }
      setAccessToken(accessToken)
      original.headers = original.headers || {}
      original.headers.Authorization = `Bearer ${accessToken}`
      return api(original)
    } catch (refreshError) {
      clearAccessToken()
      if (typeof onAuthFailure === 'function') {
        onAuthFailure()
      }
      return Promise.reject(refreshError)
    }
  }
}
