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

/**
 * Maps Meta effective_status (or empty) to a display label.
 * @param {string|null|undefined} value
 * @param {{ messages: Record<string, string>, isMeta?: boolean }} options
 */
export function formatCampaignStatus(value, { messages, isMeta = false } = {}) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) {
    return isMeta ? (messages.campaignStatusUnknown || 'Unknown') : '—'
  }
  if (raw === 'ACTIVE') return messages.campaignStatusActive || 'Active'
  if (raw === 'PAUSED') return messages.campaignStatusPaused || 'Paused'
  if (raw === 'COMPLETED') return messages.campaignStatusCompleted || 'Completed'
  if (['DELETED', 'ARCHIVED', 'CAMPAIGN_PAUSED', 'CAMPAIGN_GROUP_PAUSED', 'WITH_ISSUES', 'DISAPPROVED', 'IN_PROCESS'].includes(raw)) {
    return messages.campaignStatusInactive || 'Inactive'
  }
  // Unknown Graph values still surface as Inactive (non-active) with raw title via caller.
  return messages.campaignStatusInactive || 'Inactive'
}

/** @param {object|null|undefined} lead */
export function leadEntryMethod(lead) {
  return String(lead?.entryMethod || lead?.addedVia || 'manual')
}

/**
 * User-facing Added Via label.
 * @param {string|null|undefined} entryMethod
 * @param {Record<string, string>} messages
 */
export function formatAddedViaLabel(entryMethod, messages = {}) {
  const value = String(entryMethod || 'manual')
  if (value === 'excel_import') return messages.addedViaExcel || 'Excel Import'
  if (value === 'meta_import') return messages.addedViaMeta || 'Meta'
  if (value === 'api_import') return messages.addedViaApi || 'API Import'
  if (value === 'unknown') return messages.addedViaUnknown || 'Unknown'
  return messages.addedViaManual || 'Manual'
}

/**
 * Whether campaign status / Meta chrome should treat the lead as Meta-origin.
 * Prefer stored entryMethod; fall back to metaCreatedAt (not Lead Source alone).
 */
export function isMetaOriginLead(lead) {
  if (!lead) return false
  if (leadEntryMethod(lead) === 'meta_import') return true
  return Boolean(lead.metaCreatedAt)
}

/**
 * Prefer Meta generation time for Meta leads; CRM createdAt otherwise.
 * Never invent a Meta time from sync createdAt for Meta leads with a null metaCreatedAt.
 */
export function formatLeadGeneratedStamp(lead, formatStamp) {
  if (!lead) return '—'
  if (lead.metaCreatedAt) {
    return formatStamp(lead.metaCreatedAt)
  }
  const origin = leadEntryMethod(lead)
  if (origin === 'meta_import' || lead.source === 'facebook' || lead.source === 'instagram') {
    return '—'
  }
  return formatStamp(lead.createdAt)
}
