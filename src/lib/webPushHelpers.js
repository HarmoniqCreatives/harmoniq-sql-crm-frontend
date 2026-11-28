/**
 * Pure helpers for Web Push display (safe to unit-test in Node).
 */

/**
 * @param {Record<string, string|undefined>} [data]
 * @returns {string}
 */
export function notificationPathFromData(data = {}) {
  const leadId = String(data.leadId || '').trim()
  if (leadId) return `/leads/${encodeURIComponent(leadId)}`
  const href = String(data.href || '').trim()
  if (href.startsWith('http')) {
    try {
      const url = new URL(href)
      return `${url.pathname}${url.search}`
    } catch {
      return '/'
    }
  }
  if (href.startsWith('/')) return href
  return '/'
}

/**
 * In-memory claim map helper (mirrors sessionStorage dedupe semantics).
 * @param {Record<string, number>} map
 * @param {string} notificationId
 * @param {number} now
 * @param {number} ttlMs
 * @returns {{ claimed: boolean, map: Record<string, number> }}
 */
export function claimShownId(map, notificationId, now = Date.now(), ttlMs = 5 * 60 * 1000) {
  const id = String(notificationId || '').trim()
  const next = { ...map }
  for (const [key, ts] of Object.entries(next)) {
    if (!ts || now - Number(ts) > ttlMs) {
      delete next[key]
    }
  }
  if (!id) {
    return { claimed: true, map: next }
  }
  if (next[id]) {
    return { claimed: false, map: next }
  }
  next[id] = now
  return { claimed: true, map: next }
}
