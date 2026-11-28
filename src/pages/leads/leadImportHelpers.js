/**
 * Pure helpers for Excel lead import wizard (frontend).
 * Business rules remain on the backend; these only shape UI state.
 */

export const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024

export const IMPORT_DECISIONS = {
  skip: 'skip',
  updateExisting: 'update_existing',
  restoreExisting: 'restore_existing',
  importAsNew: 'import_as_new',
}

/** @param {File|null|undefined} file */
export function validateImportFile(file) {
  if (!file) {
    return { ok: false, reason: 'missing' }
  }
  const name = String(file.name || '').toLowerCase()
  if (!name.endsWith('.xlsx')) {
    return { ok: false, reason: 'type' }
  }
  if (Number(file.size || 0) > IMPORT_MAX_FILE_BYTES) {
    return { ok: false, reason: 'size' }
  }
  return { ok: true }
}

function isSkippedField(field) {
  return !field || field === 'ignore' || field === 'skip'
}

/**
 * @param {Record<string, string|null|undefined>} mapping header → field
 * @returns {boolean}
 */
export function mappingHasRequiredFields(mapping) {
  const fields = new Set(
    Object.values(mapping || {}).filter((field) => !isSkippedField(field)),
  )
  return fields.has('name') && fields.has('phone') && fields.has('status')
}

/**
 * Mapping summary for the pre-validate step.
 * @param {string[]} headers
 * @param {Record<string, string|null|undefined>} mapping
 * @param {string[]} requiredFields
 * @param {Record<string, string>} fieldLabels
 */
export function buildMappingSummary(headers, mapping, requiredFields = ['name', 'phone', 'status'], fieldLabels = {}) {
  const mapped = []
  const skipped = []
  const unmatched = []
  const used = new Set()
  for (const header of headers || []) {
    const field = mapping?.[header]
    if (isSkippedField(field)) {
      skipped.push(header)
      unmatched.push(header)
      continue
    }
    used.add(field)
    mapped.push({
      header,
      field,
      label: fieldLabels[field] || field,
      required: requiredFields.includes(field),
    })
  }
  const missingRequired = requiredFields.filter((field) => !used.has(field))
  return {
    mapped,
    skipped,
    unmatched,
    missingRequired,
    mappedCount: mapped.length,
    skippedCount: skipped.length,
  }
}

/**
 * Prefer backend errorsByReason; fall back to grouping row.errors / reviewIssues.
 * @param {object|null|undefined} summary
 * @param {object[]} rows
 */
export function groupInvalidByReason(summary, rows = []) {
  if (Array.isArray(summary?.errorsByReason) && summary.errorsByReason.length) {
    return summary.errorsByReason
  }
  const groups = new Map()
  for (const row of rows || []) {
    const messages = [...(row?.errors || []), ...(row?.reviewIssues || [])]
    if (!messages.length) continue
    if (row.duplicate?.requiresDecision && !(row?.reviewIssues || []).length) continue
    for (const message of messages) {
      if (!groups.has(message)) {
        groups.set(message, { reason: message, count: 0, samples: [] })
      }
      const group = groups.get(message)
      group.count += 1
      if (group.samples.length < 5) {
        group.samples.push({ excelRowNumber: row.excelRowNumber })
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count)
}

export function emptyValueMappings() {
  return {
    status: {},
    source: {},
    assignedAgent: {},
    tags: {},
  }
}

/**
 * Client-only mapping memory key (company + header fingerprint).
 * @param {string} companyId
 * @param {string} fingerprint
 */
export function importMappingMemoryKey(companyId, fingerprint) {
  return `hc-lead-import-map:${companyId}:${fingerprint}`
}

/**
 * @param {string|undefined|null} companyId
 * @param {string|undefined|null} fingerprint
 * @returns {{ fieldMapping?: object, valueMappings?: object, parseOptions?: object }|null}
 */
export function loadImportMappingMemory(companyId, fingerprint) {
  if (!companyId || !fingerprint || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(importMappingMemoryKey(companyId, fingerprint))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      fieldMapping: parsed.fieldMapping && typeof parsed.fieldMapping === 'object'
        ? parsed.fieldMapping
        : null,
      valueMappings: parsed.valueMappings && typeof parsed.valueMappings === 'object'
        ? parsed.valueMappings
        : null,
      parseOptions: parsed.parseOptions || null,
    }
  } catch {
    return null
  }
}

/**
 * @param {string|undefined|null} companyId
 * @param {string|undefined|null} fingerprint
 * @param {{ fieldMapping?: object, valueMappings?: object, parseOptions?: object }} payload
 */
export function saveImportMappingMemory(companyId, fingerprint, payload) {
  if (!companyId || !fingerprint || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      importMappingMemoryKey(companyId, fingerprint),
      JSON.stringify({
        fieldMapping: payload.fieldMapping || {},
        valueMappings: payload.valueMappings || emptyValueMappings(),
        parseOptions: payload.parseOptions || null,
        savedAt: new Date().toISOString(),
      }),
    )
  } catch {
    // Quota / private mode — memory is optional.
  }
}

/**
 * Merge remembered field mapping onto current suggested mapping (headers must match).
 * @param {string[]} headers
 * @param {Record<string, string|null>} suggested
 * @param {Record<string, string|null>|null|undefined} remembered
 * @param {string[]} fields
 */
export function applyRememberedFieldMapping(headers, suggested, remembered, fields = []) {
  const next = { ...(suggested || {}) }
  if (!remembered || typeof remembered !== 'object') return next
  const allowed = new Set(fields || [])
  for (const header of headers || []) {
    if (!Object.prototype.hasOwnProperty.call(remembered, header)) continue
    const field = remembered[header]
    if (field === null || field === '' || field === 'skip' || field === 'ignore') {
      next[header] = null
      continue
    }
    if (allowed.size && !allowed.has(field)) continue
    next[header] = field
  }
  return next
}

/**
 * Normalize / merge value mapping blocks from memory or UI.
 * @param {object|null|undefined} raw
 */
export function normalizeClientValueMappings(raw) {
  const out = emptyValueMappings()
  if (!raw || typeof raw !== 'object') return out
  for (const field of Object.keys(out)) {
    const block = raw[field]
    if (!block || typeof block !== 'object') continue
    for (const [excelValue, target] of Object.entries(block)) {
      if (!String(excelValue || '').trim()) continue
      if (target === null || target === undefined || target === '') continue
      out[field][excelValue] = String(target)
    }
  }
  return out
}

/**
 * Excel values that still need an explicit user map (exact catalog matches are auto-resolved server-side).
 * @param {object|null|undefined} workspace
 * @param {object} valueMappings
 */
export function pendingValueMapEntries(workspace, valueMappings) {
  const pending = []
  for (const group of workspace?.groups || []) {
    for (const entry of group.entries || []) {
      const mapped = valueMappings?.[group.field]?.[entry.excelValue]
      if (mapped) continue
      if (entry.suggestion?.matched || entry.suggestion?.confidence === 'exact') continue
      pending.push({
        field: group.field,
        label: group.label || group.field,
        header: group.header,
        options: group.options || [],
        excelValue: entry.excelValue,
        count: entry.count,
      })
    }
  }
  return pending
}

/**
 * True when catalog Need Review rows remain after validation.
 * @param {object|null|undefined} summary
 * @param {object[]} rows
 */
export function hasUnresolvedCatalogReview(summary, rows = []) {
  if (Number(summary?.catalogNeedReviewRows || 0) > 0) return true
  return (rows || []).some((row) => (row.reviewIssues || []).length > 0)
}

/**
 * @param {object[]} rows validate response rows
 * @param {Record<number, object>} decisionsByRow
 */
export function rowsNeedingDecisions(rows) {
  return (rows || []).filter((row) => row?.duplicate?.requiresDecision)
}

/**
 * @param {object} row
 * @param {object|undefined} decision
 */
export function isDecisionComplete(row, decision) {
  if (!row?.duplicate?.requiresDecision) return true
  if (!decision?.action) return false
  const allowed = row.duplicate.actions || []
  if (allowed.length && !allowed.includes(decision.action)) return false
  if (decision.action === IMPORT_DECISIONS.updateExisting) {
    if (!decision.existingLeadId) return false
    const ids = (row.duplicate.activeMatches || row.duplicate.matches || [])
      .filter((m) => !m.isDeleted && !m.is_deleted)
      .map((m) => m.id)
    const fallbackIds = ids.length ? ids : (row.duplicate.matches || []).map((m) => m.id)
    if (!fallbackIds.includes(decision.existingLeadId)) return false
  }
  if (decision.action === IMPORT_DECISIONS.restoreExisting) {
    if (!decision.existingLeadId) return false
    const ids = (row.duplicate.deletedMatches || row.duplicate.matches || [])
      .filter((m) => m.isDeleted || m.is_deleted)
      .map((m) => m.id)
    if (!ids.includes(decision.existingLeadId)) return false
  }
  if (decision.action === IMPORT_DECISIONS.importAsNew && decision.confirmImportAsNew !== true) {
    return false
  }
  return true
}

/**
 * @param {object[]} rows
 * @param {Record<number, object>} decisionsByRow
 */
export function allDuplicateDecisionsComplete(rows, decisionsByRow) {
  for (const row of rowsNeedingDecisions(rows)) {
    if (!isDecisionComplete(row, decisionsByRow[row.excelRowNumber])) {
      return false
    }
  }
  return true
}

/**
 * Builds confirm payload decisions array from UI state.
 * @param {object[]} rows
 * @param {Record<number, object>} decisionsByRow
 */
export function buildConfirmDecisions(rows, decisionsByRow) {
  return rowsNeedingDecisions(rows).map((row) => {
    const decision = decisionsByRow[row.excelRowNumber] || {}
    const payload = {
      excelRowNumber: row.excelRowNumber,
      action: decision.action,
    }
    if (decision.action === IMPORT_DECISIONS.updateExisting
      || decision.action === IMPORT_DECISIONS.restoreExisting) {
      payload.existingLeadId = decision.existingLeadId
    }
    if (decision.action === IMPORT_DECISIONS.importAsNew) {
      payload.confirmImportAsNew = true
    }
    return payload
  })
}

/**
 * Counts resolved duplicate decisions for the pre-confirm summary strip.
 * Ordinary valid/invalid rows are excluded (not duplicate review).
 *
 * @param {object[]} rows
 * @param {Record<number, object>} decisionsByRow
 */
export function summarizeDecisionPlan(rows, decisionsByRow) {
  let skipCount = 0
  let updateCount = 0
  let restoreCount = 0
  let importAsNewCount = 0
  let unresolvedCount = 0
  const duplicateRows = rowsNeedingDecisions(rows)
  for (const row of duplicateRows) {
    const decision = decisionsByRow[row.excelRowNumber]
    if (!isDecisionComplete(row, decision)) {
      unresolvedCount += 1
      continue
    }
    if (decision.action === IMPORT_DECISIONS.skip) skipCount += 1
    else if (decision.action === IMPORT_DECISIONS.updateExisting) updateCount += 1
    else if (decision.action === IMPORT_DECISIONS.restoreExisting) restoreCount += 1
    else if (decision.action === IMPORT_DECISIONS.importAsNew) importAsNewCount += 1
  }
  return {
    duplicateCount: duplicateRows.length,
    skipCount,
    updateCount,
    restoreCount,
    importAsNewCount,
    unresolvedCount,
  }
}

function rowAllowsAction(row, action) {
  const actions = row?.duplicate?.actions || []
  return actions.includes(action)
}

/**
 * Apply Skip to every duplicate row that supports Skip.
 * Does not touch non-duplicate rows.
 *
 * @param {object[]} rows
 * @param {Record<number, object>} decisionsByRow
 */
export function applyBulkSkip(rows, decisionsByRow) {
  const next = { ...(decisionsByRow || {}) }
  let applied = 0
  let ineligible = 0
  for (const row of rowsNeedingDecisions(rows)) {
    if (!rowAllowsAction(row, IMPORT_DECISIONS.skip)) {
      ineligible += 1
      continue
    }
    next[row.excelRowNumber] = {
      action: IMPORT_DECISIONS.skip,
      existingLeadId: undefined,
      confirmImportAsNew: false,
    }
    applied += 1
  }
  return {
    decisionsByRow: next,
    applied,
    ineligible,
    needsManualSelection: 0,
  }
}

/**
 * Apply Update Existing only when there is exactly one CRM match.
 * Multi-match rows are left unchanged (no first-match guessing).
 *
 * @param {object[]} rows
 * @param {Record<number, object>} decisionsByRow
 */
export function applyBulkUpdate(rows, decisionsByRow) {
  const next = { ...(decisionsByRow || {}) }
  let applied = 0
  let ineligible = 0
  let needsManualSelection = 0
  for (const row of rowsNeedingDecisions(rows)) {
    const matches = row.duplicate?.matches || []
    if (!rowAllowsAction(row, IMPORT_DECISIONS.updateExisting) || matches.length === 0) {
      ineligible += 1
      continue
    }
    if (matches.length > 1) {
      needsManualSelection += 1
      continue
    }
    const previous = next[row.excelRowNumber] || {}
    const onlyId = matches[0].id
    // Keep a prior valid selection for this single match when already set.
    const existingLeadId = previous.existingLeadId === onlyId ? previous.existingLeadId : onlyId
    next[row.excelRowNumber] = {
      action: IMPORT_DECISIONS.updateExisting,
      existingLeadId,
      confirmImportAsNew: false,
    }
    applied += 1
  }
  return {
    decisionsByRow: next,
    applied,
    ineligible,
    needsManualSelection,
  }
}

/**
 * Apply Import as New to every duplicate row that supports it.
 * `confirmImportAsNew` must be true (caller confirms the bulk action).
 *
 * @param {object[]} rows
 * @param {Record<number, object>} decisionsByRow
 * @param {{ confirmImportAsNew?: boolean }} [options]
 */
export function applyBulkImportAsNew(rows, decisionsByRow, options = {}) {
  const confirmImportAsNew = options.confirmImportAsNew === true
  const next = { ...(decisionsByRow || {}) }
  let applied = 0
  let ineligible = 0
  if (!confirmImportAsNew) {
    return {
      decisionsByRow: next,
      applied: 0,
      ineligible: 0,
      needsManualSelection: 0,
      blocked: true,
    }
  }
  for (const row of rowsNeedingDecisions(rows)) {
    if (!rowAllowsAction(row, IMPORT_DECISIONS.importAsNew)) {
      ineligible += 1
      continue
    }
    next[row.excelRowNumber] = {
      action: IMPORT_DECISIONS.importAsNew,
      existingLeadId: undefined,
      confirmImportAsNew: true,
    }
    applied += 1
  }
  return {
    decisionsByRow: next,
    applied,
    ineligible,
    needsManualSelection: 0,
    blocked: false,
  }
}

/**
 * @param {object|null|undefined} results confirm results
 */
export function summarizeImportResults(results) {
  const succeeded = results?.succeeded || []
  const failed = results?.failed || []
  const skipped = results?.skipped || []
  const updated = succeeded.filter((row) => row.action === 'update_existing').length
  const created = succeeded.filter((row) => row.action === 'create' || row.action === 'import_as_new').length
  return {
    succeededCount: Number(results?.succeededCount ?? succeeded.length),
    failedCount: Number(results?.failedCount ?? failed.length),
    skippedCount: Number(results?.skippedCount ?? skipped.length),
    updatedCount: updated,
    createdCount: created,
    message: results?.message || '',
    assignmentSummary: results?.assignmentSummary || [],
  }
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * @param {Record<string, string>|undefined} headers
 * @param {string} fallbackName
 * @returns {string}
 */
export function filenameFromContentDisposition(headers, fallbackName) {
  const header = headers?.['content-disposition'] || headers?.['Content-Disposition'] || ''
  const match = String(header).match(/filename\*?=(?:UTF-8''|")?([^\";]+)"?/i)
  if (!match?.[1]) return fallbackName
  try {
    return decodeURIComponent(match[1].replace(/['"]/g, '').trim()) || fallbackName
  } catch {
    return match[1].replace(/['"]/g, '').trim() || fallbackName
  }
}

/**
 * True when bytes look like a ZIP/OOXML package (xlsx).
 * @param {ArrayBuffer|Uint8Array|null|undefined} buffer
 */
export function isZipArrayBuffer(buffer) {
  if (!buffer) return false
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

/**
 * Ensures an Axios blob response is a real .xlsx (not a JSON error saved as blob).
 * @param {import('axios').AxiosResponse} response
 * @returns {Promise<Blob>}
 */
export async function assertExcelBlobResponse(response) {
  const raw = response?.data
  if (!raw) {
    throw new Error('The Excel template download was empty.')
  }
  const blob = raw instanceof Blob
    ? raw
    : new Blob([raw], { type: response.headers?.['content-type'] || XLSX_MIME })

  const probe = await blob.slice(0, 4).arrayBuffer()
  if (!isZipArrayBuffer(probe)) {
    const text = await blob.text()
    const trimmed = text.trim()
    if (trimmed.startsWith('{')) {
      let message = 'Download failed.'
      try {
        const parsed = JSON.parse(trimmed)
        message = parsed?.error?.message || parsed?.message || message
      } catch {
        // keep generic message
      }
      throw new Error(message)
    }
    throw new Error('The server did not return a valid Excel (.xlsx) file.')
  }

  if (!blob.type || blob.type === 'application/octet-stream' || blob.type.includes('json')) {
    return new Blob([blob], { type: XLSX_MIME })
  }
  return blob
}

/**
 * Trigger browser download from an Axios blob response.
 * @param {import('axios').AxiosResponse} response
 * @param {string} fallbackName
 */
export async function downloadBlobResponse(response, fallbackName) {
  const blob = await assertExcelBlobResponse(response)
  const filename = filenameFromContentDisposition(response.headers, fallbackName)
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Delay revoke so Chromium can start the download after an async fetch.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1500)
}
