/**
 * Small lead UI helpers (legacy parity with Faloniq `helpers.js`).
 */

// Exists so registration and lead forms send the same lowercase email.
export function normalizeEmail(value) {
  return String(value).trim().toLowerCase()
}

// Exists so a basic email shape is checked before the request is sent.
export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

// Exists so the follow-up date field can use today as its earliest day.
export function todayDateValue() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// Exists so a follow-up day typed as yyyy-mm-dd can be rejected when it is before today.
export function isPastDateValue(value) {
  if (!value) {
    return false
  }
  return value < todayDateValue()
}
