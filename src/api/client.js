import axios from 'axios'

/**
 * Axios API client for Harmoniq Creative CRM.
 *
 * - `withCredentials` so httpOnly refresh cookies are sent on `/api/auth/*`
 * - Access JWT is attached from localStorage on each request
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
  if (error?.response?.data?.error?.message) {
    return error.response.data.error.message
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

export async function listLeads(params) {
  const response = await api.get('/leads', { params })
  return response.data
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
