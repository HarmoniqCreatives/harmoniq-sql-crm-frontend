import axios from 'axios'
import { createAuthResponseInterceptor } from './authRefresh'

/**
 * Axios API client for Harmoniq Creative CRM.
 *
 * - `withCredentials` so httpOnly refresh cookies are sent on `/api/auth/*`
 * - Access JWT is attached from localStorage on each request
 * - On 401: refresh once (single-flight), retry original request; failure clears auth
 * - Prefer `readApiError` to surface server `{ error.message }` strings in the UI
 */

const ACCESS_KEY = 'hc_access_token'

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let authFailureHandler = null

/** Registers SPA handler invoked when refresh fails after a 401 (clears user). */
export function setAuthFailureHandler(handler) {
  authFailureHandler = typeof handler === 'function' ? handler : null
}

api.interceptors.response.use(
  (response) => response,
  createAuthResponseInterceptor({
    api,
    refreshSession: () => api.post('/auth/refresh', {}).then((response) => response.data),
    setAccessToken,
    clearAccessToken,
    onAuthFailure: () => {
      if (authFailureHandler) {
        authFailureHandler()
      }
    },
  }),
)

/** Persists or clears the short-lived access token (never store refresh tokens here). */
export function setAccessToken(token) {
  if (token) {
    localStorage.setItem(ACCESS_KEY, token)
  } else {
    localStorage.removeItem(ACCESS_KEY)
  }
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY) || ''
}

export function clearAccessToken() {
  localStorage.removeItem(ACCESS_KEY)
}

/**
 * Normalizes Axios/network failures into a user-visible message.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function readApiError(error) {
  const data = error?.response?.data
  const payload = data?.error
  if (payload?.message) {
    // errorHandler flattens AppError.details onto the error body (e.g. invalid: [...]).
    const invalid = payload.invalid || payload.details?.invalid
    if (Array.isArray(invalid) && invalid.length) {
      return `${payload.message} (${invalid.join(', ')})`
    }
    return payload.message
  }
  // Blob downloads (responseType: 'blob') surface JSON errors as Blob/string bodies.
  if (typeof data === 'string' && data.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(data)
      if (parsed?.error?.message) return parsed.error.message
    } catch {
      // fall through
    }
  }
  if (error?.message) {
    return error.message
  }
  return 'Something went wrong.'
}

export async function getHealth() {
  const response = await api.get('/health')
  return response.data
}

export async function registerCompany(body) {
  const response = await api.post('/auth/register', body)
  return response.data
}

export async function verifyEmail(token) {
  const response = await api.post('/auth/verify-email', { token })
  return response.data
}

export async function resendVerification(body) {
  const response = await api.post('/auth/resend-verification', body)
  return response.data
}

export async function listCompanies(email) {
  const response = await api.get('/auth/companies', { params: { email } })
  return response.data
}

export async function login(body) {
  const response = await api.post('/auth/login', body)
  return response.data
}

export async function refreshSession() {
  const response = await api.post('/auth/refresh', {})
  return response.data
}

export async function logout(body = {}) {
  const response = await api.post('/auth/logout', body)
  return response.data
}

export async function getMe() {
  const response = await api.get('/auth/me')
  return response.data
}

export async function forgotPassword(body) {
  const response = await api.post('/auth/forgot-password', body)
  return response.data
}

export async function resetPassword(body) {
  const response = await api.post('/auth/reset-password', body)
  return response.data
}

export async function listUsers(params) {
  const response = await api.get('/users', { params })
  return response.data
}

export async function getUser(id) {
  const response = await api.get(`/users/${id}`)
  return response.data
}

export async function createUser(body) {
  const response = await api.post('/users', body)
  return response.data
}

export async function updateUser(id, body) {
  const response = await api.patch(`/users/${id}`, body)
  return response.data
}

export async function activateUser(id) {
  const response = await api.post(`/users/${id}/activate`)
  return response.data
}

export async function deactivateUser(id) {
  const response = await api.post(`/users/${id}/deactivate`)
  return response.data
}

/**
 * Admin-initiated password reset. Returns a one-time `resetUrl` (no email).
 *
 * @param {string} id user id
 */
export async function createAdminPasswordReset(id) {
  const response = await api.post(`/users/${id}/password-reset`, {})
  return response.data
}

export async function listBranches() {
  const response = await api.get('/users/branches')
  return response.data
}

export async function listTeams(params) {
  const response = await api.get('/users/teams', { params })
  return response.data
}

export async function listRoles() {
  const response = await api.get('/roles')
  return response.data
}

export async function getRole(id) {
  const response = await api.get(`/roles/${id}`)
  return response.data
}

export async function createRole(body) {
  const response = await api.post('/roles', body)
  return response.data
}

export async function updateRole(id, body) {
  const response = await api.patch(`/roles/${id}`, body)
  return response.data
}

export async function deleteRole(id) {
  const response = await api.delete(`/roles/${id}`)
  return response.data
}

export async function listInvitations() {
  const response = await api.get('/invitations')
  return response.data
}

export async function createInvitation(body) {
  const response = await api.post('/invitations', body)
  return response.data
}

/**
 * Updates a pending invitation (name, email, role, branch/team) without rotating the token.
 *
 * @param {string} id
 * @param {object} body
 */
export async function updateInvitation(id, body) {
  const response = await api.patch(`/invitations/${id}`, body)
  return response.data
}

export async function resendInvitation(id) {
  const response = await api.post(`/invitations/${id}/resend`)
  return response.data
}

export async function revokeInvitation(id) {
  const response = await api.post(`/invitations/${id}/revoke`)
  return response.data
}

/**
 * Issues a copyable invite link. Backend must not send email on this call.
 *
 * @param {string} id invitation id
 */
export async function issueInvitationLink(id) {
  const response = await api.post(`/invitations/${id}/link`, {})
  return response.data
}

export async function previewInvitation(token) {
  const response = await api.get('/invitations/accept', { params: { token } })
  return response.data
}

export async function acceptInvitation(body) {
  const response = await api.post('/invitations/accept', body)
  return response.data
}

/**
 * Public dial-country catalog for registration (DB-backed, not hardcoded).
 */
export async function listDialCountries() {
  const response = await api.get('/public/dial-countries')
  return response.data
}

/** @param {{ kind: string, includeInactive?: boolean }} params */
export async function listCatalog(params) {
  const response = await api.get('/catalog', { params })
  return response.data
}

export async function createCatalogItem(body) {
  const response = await api.post('/catalog', body)
  return response.data
}

export async function updateCatalogItem(id, body) {
  const response = await api.patch(`/catalog/${id}`, body)
  return response.data
}

export async function deleteCatalogItem(id) {
  const response = await api.delete(`/catalog/${id}`)
  return response.data
}

export async function getCompany() {
  const response = await api.get('/company')
  return response.data
}

export async function updateCompany(body) {
  const response = await api.patch('/company', body)
  return response.data
}

export async function setEmailReportsEnabled(enabled) {
  const response = await api.patch('/company/email-reports/enabled', { enabled })
  return response.data
}

export async function createEmailReport(body) {
  const response = await api.post('/company/email-reports', body)
  return response.data
}

export async function updateEmailReport(id, body) {
  const response = await api.patch(`/company/email-reports/${id}`, body)
  return response.data
}

export async function deleteEmailReport(id) {
  const response = await api.delete(`/company/email-reports/${id}`)
  return response.data
}

export async function listLeads(params) {
  const response = await api.get('/leads', { params })
  return response.data
}

export async function listLeadPageTypes() {
  const response = await api.get('/leads/page-types')
  return response.data
}

/**
 * Downloads a lead report file (csv|xlsx) with the given filters.
 * @param {Record<string, string>} params
 */
export async function exportLeads(params) {
  const response = await api.get('/leads/export', {
    params,
    responseType: 'blob',
  })
  return response
}

export async function getLead(id) {
  const response = await api.get(`/leads/${id}`)
  return response.data
}

export async function createLead(body) {
  const response = await api.post('/leads', body)
  return response.data
}

export async function updateLead(id, body) {
  const response = await api.patch(`/leads/${id}`, body)
  return response.data
}

export async function assignLead(id, body) {
  const response = await api.patch(`/leads/${id}/assignment`, body)
  return response.data
}

export async function deleteLead(id) {
  const response = await api.delete(`/leads/${id}`)
  return response.data
}

/**
 * Recycle Bin list (soft-deleted records).
 * @param {{ entity: string, page?: number, limit?: number, kind?: string }} params
 */
export async function listRecycleBin(params) {
  const response = await api.get('/recycle-bin', { params })
  return response.data
}

/**
 * Restore a soft-deleted record.
 * @param {string} entity leads|roles|catalog|meta_profiles|email_reports
 * @param {string} id
 */
export async function restoreRecycleBinItem(entity, id) {
  const response = await api.post(`/recycle-bin/${entity}/${id}/restore`)
  return response.data
}

export async function bulkAssignLeads(body) {
  const response = await api.post('/leads/bulk/assign', body)
  return response.data
}

export async function bulkTransferLeads(body) {
  const response = await api.post('/leads/bulk/transfer', body)
  return response.data
}

export async function bulkDeleteLeads(body) {
  const response = await api.post('/leads/bulk/delete', body)
  return response.data
}

/** Download the Excel lead-import template (.xlsx blob). */
export async function downloadLeadImportTemplate() {
  return api.get('/leads/import/template', {
    responseType: 'blob',
    timeout: 60000,
  })
}

/**
 * Upload an .xlsx file and create an import session.
 * @param {File} file
 * @param {{ sheetIndex?: number, headerRow?: number }} [options]
 */
export async function createLeadImportSession(file, options = {}) {
  const form = new FormData()
  form.append('file', file)
  if (options.sheetIndex !== undefined && options.sheetIndex !== null && options.sheetIndex !== '') {
    form.append('sheetIndex', String(options.sheetIndex))
  }
  if (options.headerRow !== undefined && options.headerRow !== null && options.headerRow !== '') {
    form.append('headerRow', String(options.headerRow))
  }
  const response = await api.post('/leads/import/sessions', form, {
    timeout: 120000,
  })
  return response.data
}

/**
 * Validate / re-validate an import session with column mapping and value mappings.
 * @param {string} sessionId
 * @param {{ mapping: Record<string, string|null>, valueMappings?: object }} body
 */
export async function validateLeadImportSession(sessionId, body) {
  const response = await api.post(`/leads/import/sessions/${sessionId}/validate`, body, {
    timeout: 120000,
  })
  return response.data
}

/**
 * Confirm import with Manual Review decisions and confirmToken.
 * @param {string} sessionId
 * @param {{ confirmToken?: string, decisions?: object[] }} body
 */
export async function confirmLeadImportSession(sessionId, body) {
  const response = await api.post(`/leads/import/sessions/${sessionId}/confirm`, body, {
    timeout: 180000,
  })
  return response.data
}

/** Fetch an import session (company-scoped). */
export async function getLeadImportSession(sessionId) {
  const response = await api.get(`/leads/import/sessions/${sessionId}`)
  return response.data
}

/** Download row-level import error report (.xlsx blob). */
export async function downloadLeadImportErrors(sessionId) {
  return api.get(`/leads/import/sessions/${sessionId}/errors.xlsx`, {
    responseType: 'blob',
    timeout: 60000,
  })
}

/** @param {{ page?: number, limit?: number, unreadOnly?: boolean }} [params] */
export async function listNotifications(params) {
  const response = await api.get('/notifications', { params })
  return response.data
}

export async function getNotificationsUnreadCount() {
  const response = await api.get('/notifications/unread-count')
  return response.data
}

/** @param {string} id */
export async function markNotificationRead(id) {
  const response = await api.post(`/notifications/${id}/read`)
  return response.data
}

export async function markAllNotificationsRead() {
  const response = await api.post('/notifications/read-all')
  return response.data
}

/** @param {{ token: string, platform: 'android'|'ios'|'web', deviceId?: string, appVersion?: string }} body */
export async function registerNotificationDevice(body) {
  const response = await api.post('/notifications/devices', body)
  return response.data
}

/** @param {{ token?: string, deviceId?: string }} [body] */
export async function deactivateNotificationDevice(body = {}) {
  const response = await api.post('/notifications/devices/deactivate', body)
  return response.data
}

/**
 * SSE via fetch (Bearer auth). EventSource cannot send Authorization headers.
 *
 * @param {{ onEvent: (event: object) => void, onError?: () => void, signal?: AbortSignal }} options
 * @returns {() => void} abort / cleanup
 */
export function subscribeNotificationStream({ onEvent, onError, signal }) {
  const token = getAccessToken()
  if (!token) {
    onError?.()
    return () => {}
  }

  const controller = new AbortController()
  let aborted = false

  if (signal) {
    if (signal.aborted) {
      return () => {}
    }
    signal.addEventListener('abort', () => {
      aborted = true
      controller.abort()
    })
  }

  async function consumeStream() {
    try {
      const response = await fetch('/api/notifications/stream', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        throw new Error('Notification stream unavailable')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (!aborted) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''
        for (const chunk of chunks) {
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) {
              continue
            }
            try {
              const event = JSON.parse(line.slice(6))
              if (event?.type && event.type !== 'connected') {
                onEvent(event)
              }
            } catch {
              // Ignore malformed SSE payloads.
            }
          }
        }
      }
      if (!aborted) {
        onError?.()
      }
    } catch (error) {
      if (!aborted && error?.name !== 'AbortError') {
        onError?.()
      }
    }
  }

  consumeStream()

  return () => {
    aborted = true
    controller.abort()
  }
}
