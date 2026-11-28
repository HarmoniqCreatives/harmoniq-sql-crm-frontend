/**
 * Restores the SPA session on boot.
 *
 * Order: access token → GET /auth/me; on missing/invalid token, try httpOnly
 * refresh cookie once → store new access token → GET /auth/me. Failures clear
 * the access token and return null (signed-out). Refresh is attempted at most
 * once per call to avoid loops.
 *
 * @param {{
 *   getAccessToken: () => string,
 *   setAccessToken: (token: string) => void,
 *   clearAccessToken: () => void,
 *   getMe: () => Promise<{ data: { user: object } }>,
 *   refreshSession: () => Promise<{ data: { accessToken: string } }>,
 * }} deps
 * @returns {Promise<object|null>} restored user, or null when unsigned
 */
export async function bootAuthSession(deps) {
  const {
    getAccessToken,
    setAccessToken,
    clearAccessToken,
    getMe,
    refreshSession,
  } = deps

  const token = getAccessToken()
  if (token) {
    try {
      const payload = await getMe()
      return payload?.data?.user ?? null
    } catch {
      // Fall through to cookie refresh (expired/invalid access token).
    }
  }

  try {
    const refreshed = await refreshSession()
    const accessToken = refreshed?.data?.accessToken
    if (!accessToken) {
      clearAccessToken()
      return null
    }
    setAccessToken(accessToken)
    const payload = await getMe()
    return payload?.data?.user ?? null
  } catch {
    clearAccessToken()
    return null
  }
}
