/**
 * Resolves a safe post-login path from ProtectedRoute `state.from`.
 * Only relative app paths are accepted (open-redirect safe).
 *
 * @param {unknown} from
 * @returns {string}
 */
export function resolveLoginReturnPath(from) {
  if (!from) {
    return '/'
  }
  if (typeof from === 'string') {
    return isSafeAppPath(from) ? from : '/'
  }
  if (typeof from === 'object' && from !== null && typeof from.pathname === 'string') {
    const path = `${from.pathname}${from.search || ''}${from.hash || ''}`
    return isSafeAppPath(path) ? path : '/'
  }
  return '/'
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isSafeAppPath(path) {
  if (!path || typeof path !== 'string') {
    return false
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    return false
  }
  if (path === '/login' || path.startsWith('/login?') || path.startsWith('/login#')) {
    return false
  }
  if (
    path.startsWith('/register')
    || path.startsWith('/verify-email')
    || path.startsWith('/forgot-password')
    || path.startsWith('/reset-password')
    || path.startsWith('/accept-invitation')
  ) {
    return false
  }
  return true
}
