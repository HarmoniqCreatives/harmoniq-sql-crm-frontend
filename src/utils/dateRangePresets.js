/**
 * Lead list date presets in a company IANA timezone (DST-aware via Intl).
 */

export const DATE_PRESETS = {
  all: '',
  today: 'today',
  yesterday: 'yesterday',
  last30: 'last30',
  thisMonth: 'thisMonth',
  custom: 'custom',
}

/**
 * @param {Date} date
 * @param {string} timeZone
 * @returns {string} YYYY-MM-DD
 */
export function calendarDateInZone(date, timeZone) {
  const zone = timeZone || 'UTC'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * @param {string} yyyyMmDd
 * @param {number} deltaDays
 * @returns {string}
 */
export function shiftYmd(yyyyMmDd, deltaDays) {
  const [year, month, day] = yyyyMmDd.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + deltaDays)
  const y = utc.getUTCFullYear()
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utc.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * @param {string} preset
 * @param {string} timeZone
 * @returns {{ startDate: string, endDate: string }|null}
 */
export function rangeForPreset(preset, timeZone) {
  if (!preset || preset === DATE_PRESETS.all || preset === DATE_PRESETS.custom) {
    return null
  }
  const today = calendarDateInZone(new Date(), timeZone)
  if (preset === DATE_PRESETS.today) {
    return { startDate: today, endDate: today }
  }
  if (preset === DATE_PRESETS.yesterday) {
    const yesterday = shiftYmd(today, -1)
    return { startDate: yesterday, endDate: yesterday }
  }
  if (preset === DATE_PRESETS.last30) {
    return { startDate: shiftYmd(today, -29), endDate: today }
  }
  if (preset === DATE_PRESETS.thisMonth) {
    const startDate = `${today.slice(0, 8)}01`
    return { startDate, endDate: today }
  }
  return null
}

/**
 * @param {string} value DD-MM-YYYY or YYYY-MM-DD
 * @returns {string} YYYY-MM-DD or ''
 */
export function parseFlexibleDate(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return isValidYmd(text) ? text : ''
  }
  const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!match) return ''
  const ymd = `${match[3]}-${match[2]}-${match[1]}`
  return isValidYmd(ymd) ? ymd : ''
}

/**
 * @param {string} yyyyMmDd
 * @returns {string} DD-MM-YYYY
 */
export function formatDisplayDate(yyyyMmDd) {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return ''
  const [y, m, d] = yyyyMmDd.split('-')
  return `${d}-${m}-${y}`
}

function isValidYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    date.getUTCFullYear() === y
    && date.getUTCMonth() === m - 1
    && date.getUTCDate() === d
  )
}
