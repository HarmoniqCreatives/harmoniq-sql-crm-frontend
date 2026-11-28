import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  confirmLeadImportSession,
  createLeadImportSession,
  downloadLeadImportErrors,
  downloadLeadImportTemplate,
  readApiError,
  validateLeadImportSession,
} from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { messages } from './leadCopy'
import {
  IMPORT_DECISIONS,
  allDuplicateDecisionsComplete,
  applyBulkImportAsNew,
  applyBulkSkip,
  applyBulkUpdate,
  applyRememberedFieldMapping,
  buildConfirmDecisions,
  buildMappingSummary,
  downloadBlobResponse,
  emptyValueMappings,
  groupInvalidByReason,
  hasUnresolvedCatalogReview,
  isDecisionComplete,
  loadImportMappingMemory,
  mappingHasRequiredFields,
  normalizeClientValueMappings,
  pendingValueMapEntries,
  rowsNeedingDecisions,
  saveImportMappingMemory,
  summarizeDecisionPlan,
  summarizeImportResults,
  validateImportFile,
} from './leadImportHelpers'

const STEPS = {
  upload: 'upload',
  mapping: 'mapping',
  valueMap: 'valueMap',
  review: 'review',
  results: 'results',
}

/**
 * Wide import wizard modal (same shell classes as Leads HarmoniqModal).
 */
function ImportModal({ open, title, onCloseRequest, children, footer, busy }) {
  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape' && !busy) {
        onCloseRequest()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onCloseRequest, busy])

  if (!open) return null

  return createPortal(
    <div
      className="leads-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onCloseRequest()
      }}
    >
      <div
        className="leads-modal-card is-wide import-leads-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-leads-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="leads-modal-head">
          <h2 id="import-leads-title">{title}</h2>
          <button
            type="button"
            className="ghost-btn leads-modal-close"
            onClick={() => {
              if (!busy) onCloseRequest()
            }}
            aria-label={messages.close}
            disabled={busy}
          >
            ×
          </button>
        </div>
        <div className="leads-modal-body">{children}</div>
        {footer ? <div className="leads-modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Excel bulk lead import wizard wired to `/api/leads/import/*`.
 *
 * @param {{ open: boolean, onClose: () => void, onCompleted: (summary: object) => void }} props
 */
export function ImportLeadsDialog({ open, onClose, onCompleted }) {
  const { user } = useAuth()
  const companyId = user?.company?.id || ''
  const fileInputId = useId()
  const fileRef = useRef(null)
  const selectedFileRef = useRef(null)
  const [step, setStep] = useState(STEPS.upload)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [memoryNotice, setMemoryNotice] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [confirmToken, setConfirmToken] = useState('')
  const [headers, setHeaders] = useState([])
  const [fields, setFields] = useState([])
  const [fieldLabels, setFieldLabels] = useState({})
  const [fieldMeta, setFieldMeta] = useState({})
  const [requiredFields, setRequiredFields] = useState(['name', 'phone', 'status'])
  const [suggestionReasons, setSuggestionReasons] = useState({})
  const [mappingConfidence, setMappingConfidence] = useState({})
  const [mapping, setMapping] = useState({})
  const [filename, setFilename] = useState('')
  const [sheets, setSheets] = useState([])
  const [parseOptions, setParseOptions] = useState({ sheetIndex: 0, headerRow: 1, sheetName: '' })
  const [headerFingerprint, setHeaderFingerprint] = useState('')
  const [valueMappings, setValueMappings] = useState(emptyValueMappings())
  const [valueMappingWorkspace, setValueMappingWorkspace] = useState(null)
  const [rows, setRows] = useState([])
  const [validationSummary, setValidationSummary] = useState(null)
  const [decisionsByRow, setDecisionsByRow] = useState({})
  const [results, setResults] = useState(null)
  const [idempotent, setIdempotent] = useState(false)
  const [bulkNotice, setBulkNotice] = useState('')

  const dirty = useMemo(() => {
    if (step === STEPS.results) return false
    if (!sessionId) return false
    if (step === STEPS.review && rowsNeedingDecisions(rows).length) {
      return !allDuplicateDecisionsComplete(rows, decisionsByRow)
    }
    return Boolean(sessionId) && step !== STEPS.upload
  }, [step, sessionId, rows, decisionsByRow])

  function resetState() {
    setStep(STEPS.upload)
    setBusy(false)
    setLocalError('')
    setMemoryNotice('')
    setSessionId('')
    setConfirmToken('')
    setHeaders([])
    setFields([])
    setFieldLabels({})
    setFieldMeta({})
    setRequiredFields(['name', 'phone', 'status'])
    setSuggestionReasons({})
    setMappingConfidence({})
    setMapping({})
    setFilename('')
    setSheets([])
    setParseOptions({ sheetIndex: 0, headerRow: 1, sheetName: '' })
    setHeaderFingerprint('')
    setValueMappings(emptyValueMappings())
    setValueMappingWorkspace(null)
    setRows([])
    setValidationSummary(null)
    setDecisionsByRow({})
    setResults(null)
    setIdempotent(false)
    setBulkNotice('')
    selectedFileRef.current = null
    if (fileRef.current) fileRef.current.value = ''
  }

  function persistMappingMemory(nextMapping, nextValueMappings, nextFingerprint, nextParseOptions) {
    saveImportMappingMemory(companyId, nextFingerprint || headerFingerprint, {
      fieldMapping: nextMapping || mapping,
      valueMappings: nextValueMappings || valueMappings,
      parseOptions: nextParseOptions || parseOptions,
    })
  }

  function applySessionPayload(data, file, { restoreMemory = true } = {}) {
    const session = data.session || {}
    const nextHeaders = session.headers || data.headers || []
    const nextFields = Array.isArray(data.fields) ? data.fields : Object.keys(data.fieldLabels || {})
    const suggested = data.suggestedMapping || session.suggestedMapping || session.mapping || {}
    const fingerprint = data.headerFingerprint || session.headerFingerprint || ''
    const nextParse = data.parseOptions || session.parseOptions || { sheetIndex: 0, headerRow: 1 }
    let nextMapping = { ...suggested }
    let nextValueMaps = emptyValueMappings()
    let restored = false
    if (restoreMemory && companyId && fingerprint) {
      const memory = loadImportMappingMemory(companyId, fingerprint)
      if (memory?.fieldMapping) {
        nextMapping = applyRememberedFieldMapping(nextHeaders, suggested, memory.fieldMapping, nextFields)
        restored = true
      }
      if (memory?.valueMappings) {
        nextValueMaps = normalizeClientValueMappings(memory.valueMappings)
        restored = true
      }
    }
    setSessionId(session.id)
    setFilename(session.originalFilename || file?.name || filename)
    setHeaders(nextHeaders)
    setFields(nextFields)
    setFieldLabels(data.fieldLabels || {})
    setFieldMeta(data.fieldMeta || {})
    setRequiredFields(
      Array.isArray(data.requiredFields) && data.requiredFields.length
        ? data.requiredFields
        : ['name', 'phone', 'status'],
    )
    setSuggestionReasons(data.suggestionReasons || {})
    setMappingConfidence(data.mappingConfidence || session.validationSummary?.mappingConfidence || {})
    setSheets(data.sheets || session.sheets || [])
    setParseOptions({
      sheetIndex: Number(nextParse.sheetIndex || 0),
      headerRow: Number(nextParse.headerRow || 1),
      sheetName: nextParse.sheetName || '',
    })
    setHeaderFingerprint(fingerprint)
    setMapping(nextMapping)
    setValueMappings(nextValueMaps)
    setValueMappingWorkspace(null)
    setRows([])
    setValidationSummary(null)
    setDecisionsByRow({})
    setConfirmToken('')
    setMemoryNotice(restored ? messages.importMemoryRestored : '')
    setStep(STEPS.mapping)
  }

  function requestClose() {
    if (busy) return
    if (dirty) {
      const ok = window.confirm(messages.importCloseWarn)
      if (!ok) return
    }
    resetState()
    onClose()
  }

  async function handleDownloadTemplate() {
    setLocalError('')
    setBusy(true)
    try {
      const response = await downloadLeadImportTemplate()
      await downloadBlobResponse(response, 'filos-lead-import-template.xlsx')
    } catch (error) {
      setLocalError(readApiError(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(file, options = {}, { restoreMemory = true } = {}) {
    setLocalError('')
    const check = validateImportFile(file)
    if (!check.ok) {
      if (check.reason === 'type') setLocalError(messages.importFileType)
      else if (check.reason === 'size') setLocalError(messages.importFileSize)
      else setLocalError(messages.importNoFile)
      return
    }
    setBusy(true)
    try {
      selectedFileRef.current = file
      const payload = await createLeadImportSession(file, options)
      const data = payload?.data || payload
      applySessionPayload(data, file, { restoreMemory })
    } catch (error) {
      setLocalError(readApiError(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleApplyStructure() {
    const file = selectedFileRef.current
    if (!file) {
      setLocalError(messages.importNoFile)
      return
    }
    await handleUpload(
      file,
      {
        sheetIndex: Number(parseOptions.sheetIndex || 0),
        headerRow: Number(parseOptions.headerRow || 1),
      },
      { restoreMemory: true },
    )
  }

  function updateMapping(header, field) {
    setMapping((current) => ({
      ...current,
      [header]: field || null,
    }))
  }

  function updateValueMapping(field, excelValue, target) {
    setValueMappings((current) => {
      const next = normalizeClientValueMappings(current)
      if (!target) {
        delete next[field][excelValue]
      } else {
        next[field][excelValue] = target
      }
      return next
    })
  }

  function seedDecisions(nextRows) {
    const seeds = {}
    for (const row of nextRows) {
      if (!row.duplicate?.requiresDecision) continue
      const matches = row.duplicate.matches || []
      if (matches.length === 1 && (row.duplicate.actions || []).includes(IMPORT_DECISIONS.updateExisting)) {
        seeds[row.excelRowNumber] = {
          action: IMPORT_DECISIONS.updateExisting,
          existingLeadId: matches[0].id,
        }
      }
    }
    setDecisionsByRow(seeds)
  }

  function applyValidateResult(data, { preferValueMapStep = true } = {}) {
    const session = data.session || {}
    const nextRows = Array.isArray(data.rows) ? data.rows : []
    const summary = session.validationSummary || data.validationSummary || null
    const workspace = data.valueMappingWorkspace
      || summary?.valueMappingWorkspace
      || null
    const nextValueMaps = normalizeClientValueMappings(
      data.valueMappings || summary?.valueMappings || valueMappings,
    )
    setRows(nextRows)
    setValidationSummary(summary)
    setConfirmToken(session.confirmToken || '')
    setValueMappingWorkspace(workspace)
    setValueMappings(nextValueMaps)
    setBulkNotice('')
    seedDecisions(nextRows)
    persistMappingMemory(mapping, nextValueMaps, headerFingerprint, parseOptions)

    const pending = pendingValueMapEntries(workspace, nextValueMaps)
    const catalogOpen = hasUnresolvedCatalogReview(summary, nextRows)
    if (preferValueMapStep && (pending.length > 0 || catalogOpen)) {
      setStep(STEPS.valueMap)
      return
    }
    setStep(STEPS.review)
  }

  async function handleValidate() {
    setLocalError('')
    if (!mappingHasRequiredFields(mapping)) {
      setLocalError(messages.importMappingRequired)
      return
    }
    setBusy(true)
    try {
      persistMappingMemory(mapping, valueMappings, headerFingerprint, parseOptions)
      const payload = await validateLeadImportSession(sessionId, {
        mapping,
        valueMappings,
      })
      applyValidateResult(payload?.data || payload, { preferValueMapStep: true })
    } catch (error) {
      setLocalError(readApiError(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleRevalidateValueMaps() {
    setLocalError('')
    const pending = pendingValueMapEntries(valueMappingWorkspace, valueMappings)
    if (pending.length) {
      setLocalError(messages.importCatalogReviewWarn)
      return
    }
    setBusy(true)
    try {
      persistMappingMemory(mapping, valueMappings, headerFingerprint, parseOptions)
      const payload = await validateLeadImportSession(sessionId, {
        mapping,
        valueMappings,
      })
      applyValidateResult(payload?.data || payload, { preferValueMapStep: false })
      if (hasUnresolvedCatalogReview(
        (payload?.data || payload)?.session?.validationSummary,
        (payload?.data || payload)?.rows,
      )) {
        setLocalError(messages.importCatalogReviewWarn)
        setStep(STEPS.valueMap)
      }
    } catch (error) {
      setLocalError(readApiError(error))
    } finally {
      setBusy(false)
    }
  }

  function setDecision(excelRowNumber, patch) {
    setBulkNotice('')
    setDecisionsByRow((current) => ({
      ...current,
      [excelRowNumber]: {
        ...(current[excelRowNumber] || {}),
        ...patch,
      },
    }))
  }

  function applyBulkResult(result, successMessage) {
    setDecisionsByRow(result.decisionsByRow)
    if (result.applied > 0) {
      setBulkNotice(successMessage)
      setLocalError('')
    } else {
      setBulkNotice('')
      setLocalError(messages.importBulkNone)
    }
  }

  function handleBulkSkip() {
    if (busy) return
    const result = applyBulkSkip(rows, decisionsByRow)
    applyBulkResult(result, messages.importBulkSkipDone(result.applied))
  }

  function handleBulkUpdate() {
    if (busy) return
    const result = applyBulkUpdate(rows, decisionsByRow)
    setDecisionsByRow(result.decisionsByRow)
    const message = messages.importBulkUpdateDone(result.applied, result.needsManualSelection)
    if (result.applied > 0 || result.needsManualSelection > 0) {
      setBulkNotice(message)
      setLocalError('')
      return
    }
    setBulkNotice('')
    setLocalError(messages.importBulkNone)
  }

  function handleBulkImportAll() {
    if (busy) return
    const ok = window.confirm(messages.importBulkImportConfirm)
    if (!ok) return
    const result = applyBulkImportAsNew(rows, decisionsByRow, { confirmImportAsNew: true })
    applyBulkResult(result, messages.importBulkImportDone(result.applied))
  }

  async function handleConfirm() {
    setLocalError('')
    if (hasUnresolvedCatalogReview(validationSummary, rows)) {
      setLocalError(messages.importCatalogReviewWarn)
      setStep(STEPS.valueMap)
      return
    }
    if (!allDuplicateDecisionsComplete(rows, decisionsByRow)) {
      setLocalError(messages.importNeedDecisions)
      return
    }
    setBusy(true)
    try {
      persistMappingMemory(mapping, valueMappings, headerFingerprint, parseOptions)
      const payload = await confirmLeadImportSession(sessionId, {
        confirmToken: confirmToken || undefined,
        decisions: buildConfirmDecisions(rows, decisionsByRow),
      })
      const data = payload?.data || payload
      setResults(data.results || null)
      setIdempotent(Boolean(data.idempotent))
      setStep(STEPS.results)
      if (typeof onCompleted === 'function') {
        onCompleted(summarizeImportResults(data.results))
      }
    } catch (error) {
      setLocalError(readApiError(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleErrorReport() {
    setLocalError('')
    setBusy(true)
    try {
      const response = await downloadLeadImportErrors(sessionId)
      await downloadBlobResponse(response, `lead-import-errors-${sessionId.slice(0, 8)}.xlsx`)
    } catch (error) {
      setLocalError(readApiError(error))
    } finally {
      setBusy(false)
    }
  }

  const summaryStats = validationSummary || {}
  const resultSummary = summarizeImportResults(results)
  const reviewRows = rows
  const decisionRows = rowsNeedingDecisions(rows)
  const decisionPlan = summarizeDecisionPlan(rows, decisionsByRow)
  const mappingSummary = useMemo(
    () => buildMappingSummary(headers, mapping, requiredFields, fieldLabels),
    [headers, mapping, requiredFields, fieldLabels],
  )
  const invalidReasonGroups = useMemo(
    () => groupInvalidByReason(validationSummary, rows),
    [validationSummary, rows],
  )
  const pendingValueMaps = useMemo(
    () => pendingValueMapEntries(valueMappingWorkspace, valueMappings),
    [valueMappingWorkspace, valueMappings],
  )
  const pendingByField = useMemo(() => {
    const groups = new Map()
    for (const entry of pendingValueMaps) {
      if (!groups.has(entry.field)) {
        groups.set(entry.field, {
          field: entry.field,
          label: entry.label,
          options: entry.options || [],
          entries: [],
        })
      }
      groups.get(entry.field).entries.push(entry)
    }
    return [...groups.values()]
  }, [pendingValueMaps])

  function fieldBadge(field) {
    if (!field) return null
    if (requiredFields.includes(field)) {
      return <span className="import-field-badge is-required">{messages.importRequiredBadge}</span>
    }
    const meta = fieldMeta[field]
    if (meta?.group === 'notes') {
      return <span className="import-field-badge is-notes">{messages.importNotesBadge}</span>
    }
    return <span className="import-field-badge is-optional">{messages.importOptionalBadge}</span>
  }

  function confidencePill(header) {
    const level = mappingConfidence[header] || 'none'
    if (level === 'exact') {
      return <span className="import-confidence-pill is-exact">{messages.importConfidenceExact}</span>
    }
    if (level === 'synonym') {
      return <span className="import-confidence-pill is-synonym">{messages.importConfidenceSynonym}</span>
    }
    return <span className="import-confidence-pill is-none">{messages.importConfidenceNone}</span>
  }

  const footer = (
    <>
      {step !== STEPS.results ? (
        <button type="button" className="ghost-btn" onClick={requestClose} disabled={busy}>
          {messages.cancel}
        </button>
      ) : null}
      {step === STEPS.mapping ? (
        <>
          <button type="button" className="ghost-btn" onClick={() => setStep(STEPS.upload)} disabled={busy}>
            {messages.importBack}
          </button>
          <button type="button" className="primary-btn" onClick={handleValidate} disabled={busy}>
            {busy ? messages.importBusy : messages.importValidate}
          </button>
        </>
      ) : null}
      {step === STEPS.valueMap ? (
        <>
          <button type="button" className="ghost-btn" onClick={() => setStep(STEPS.mapping)} disabled={busy}>
            {messages.importBack}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleRevalidateValueMaps}
            disabled={busy || pendingValueMaps.length > 0}
          >
            {busy ? messages.importBusy : messages.importValueMapContinue}
          </button>
        </>
      ) : null}
      {step === STEPS.review ? (
        <>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setStep(
              pendingValueMaps.length || hasUnresolvedCatalogReview(validationSummary, rows)
                ? STEPS.valueMap
                : STEPS.mapping,
            )}
            disabled={busy}
          >
            {messages.importBack}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleConfirm}
            disabled={
              busy
              || !allDuplicateDecisionsComplete(rows, decisionsByRow)
              || hasUnresolvedCatalogReview(validationSummary, rows)
            }
          >
            {busy ? messages.importBusy : messages.importRun}
          </button>
        </>
      ) : null}
      {step === STEPS.results ? (
        <>
          <button type="button" className="ghost-btn" onClick={handleErrorReport} disabled={busy || !sessionId}>
            {messages.importErrorReport}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              resetState()
              onClose()
            }}
            disabled={busy}
          >
            {messages.close}
          </button>
        </>
      ) : null}
    </>
  )

  return (
    <ImportModal
      open={open}
      title={messages.importTitle}
      onCloseRequest={requestClose}
      busy={busy}
      footer={footer}
    >
      {localError ? <p className="import-inline-error" role="alert">{localError}</p> : null}
      {memoryNotice ? <p className="import-inline-success" role="status">{memoryNotice}</p> : null}
      {bulkNotice ? <p className="import-inline-success" role="status">{bulkNotice}</p> : null}

      {step === STEPS.upload ? (
        <div className="import-step">
          <p className="import-hint">{messages.importUploadHint}</p>
          <div className="import-upload-actions">
            <button type="button" className="ghost-btn" onClick={handleDownloadTemplate} disabled={busy}>
              {messages.importDownloadTemplate}
            </button>
            <label className="primary-btn import-file-label" htmlFor={fileInputId}>
              {busy ? messages.importBusy : messages.importChooseFile}
              <input
                id={fileInputId}
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="import-file-input"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) handleUpload(file)
                }}
              />
            </label>
          </div>
        </div>
      ) : null}

      {step === STEPS.mapping ? (
        <div className="import-step">
          <p className="import-hint">
            {messages.importMapColumns}
            {filename ? ` — ${filename}` : ''}
          </p>
          <div className="import-structure-panel">
            <h3>{messages.importStructureTitle}</h3>
            <p className="import-hint">{messages.importStructureHint}</p>
            <div className="import-structure-grid">
              <label>
                {messages.importSheetLabel}
                <select
                  value={String(parseOptions.sheetIndex ?? 0)}
                  disabled={busy || !sheets.length}
                  onChange={(event) => {
                    const index = Number(event.target.value)
                    const sheet = sheets[index]
                    setParseOptions((current) => ({
                      ...current,
                      sheetIndex: index,
                      sheetName: sheet?.name || '',
                      headerRow: sheet?.suggestedHeaderRow || current.headerRow || 1,
                    }))
                  }}
                >
                  {(sheets.length ? sheets : [{ index: 0, name: parseOptions.sheetName || 'Sheet 1' }]).map((sheet) => (
                    <option key={sheet.index ?? sheet.name} value={String(sheet.index ?? 0)}>
                      {sheet.name || `Sheet ${(sheet.index ?? 0) + 1}`}
                      {sheet.rowCount ? ` (${sheet.rowCount} rows)` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {messages.importHeaderRowLabel}
                <input
                  type="number"
                  min={1}
                  value={parseOptions.headerRow || 1}
                  disabled={busy}
                  onChange={(event) => setParseOptions((current) => ({
                    ...current,
                    headerRow: Math.max(1, Number(event.target.value) || 1),
                  }))}
                />
              </label>
              <button
                type="button"
                className="ghost-btn"
                disabled={busy || !sessionId}
                onClick={handleApplyStructure}
              >
                {messages.importApplyStructure}
              </button>
            </div>
          </div>
          <div className="import-summary-strip" aria-live="polite">
            <strong>{messages.importMappingSummaryTitle}</strong>
            <span>{messages.importMappedCount}: {mappingSummary.mappedCount}</span>
            <span>{messages.importSkippedCount}: {mappingSummary.skippedCount}</span>
            {mappingSummary.missingRequired.length ? (
              <span className="is-unresolved">
                {messages.importMissingRequired}: {mappingSummary.missingRequired.map((field) => fieldLabels[field] || field).join(', ')}
              </span>
            ) : null}
          </div>
          {mappingSummary.unmatched.length ? (
            <p className="import-inline-warn" role="status">
              {messages.importUnmatchedWarn}
              {' '}
              {mappingSummary.unmatched.slice(0, 8).join(', ')}
              {mappingSummary.unmatched.length > 8 ? '…' : ''}
            </p>
          ) : null}
          <div className="import-mapping-table-wrap">
            <table className="import-mapping-table">
              <thead>
                <tr>
                  <th scope="col">Excel column</th>
                  <th scope="col">CRM field</th>
                  <th scope="col">{messages.importSuggestionWhy}</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header) => {
                  const selected = mapping[header] || ''
                  return (
                    <tr key={header} className={!selected ? 'is-skipped' : ''}>
                      <td>
                        <div className="import-excel-col">
                          {header}
                          {confidencePill(header)}
                        </div>
                      </td>
                      <td>
                        <div className="import-map-control">
                          <select
                            aria-label={`Map ${header}`}
                            value={selected}
                            disabled={busy}
                            onChange={(event) => updateMapping(header, event.target.value || null)}
                          >
                            <option value="">{messages.importIgnoreColumn}</option>
                            {fields.map((field) => (
                              <option key={field} value={field}>
                                {fieldLabels[field] || field}
                                {requiredFields.includes(field) ? ' *' : ''}
                              </option>
                            ))}
                          </select>
                          {fieldBadge(selected)}
                        </div>
                      </td>
                      <td className="import-suggestion-why">
                        {suggestionReasons[header] || (selected
                          ? `Mapped to ${fieldLabels[selected] || selected}`
                          : 'Skipped')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {step === STEPS.valueMap ? (
        <div className="import-step">
          <p className="import-hint">{messages.importValueMapHint}</p>
          <div className="import-summary-strip" aria-live="polite">
            <span>{messages.importSummaryNeedReview}: {summaryStats.needReviewRows ?? summaryStats.catalogNeedReviewRows ?? 0}</span>
            <span>{messages.importSummaryInvalid}: {summaryStats.invalidRows ?? 0}</span>
            <span>{messages.importSummaryValid}: {summaryStats.validRows ?? 0}</span>
          </div>
          {pendingByField.length === 0 ? (
            <p className="import-inline-success" role="status">{messages.importValueMapEmpty}</p>
          ) : (
            pendingByField.map((group) => (
              <div key={group.field} className="import-value-map-group">
                <h3>{group.label || group.field}</h3>
                <table className="import-value-map-table">
                  <thead>
                    <tr>
                      <th scope="col">{messages.importValueMapExcel}</th>
                      <th scope="col">{messages.importValueMapCount}</th>
                      <th scope="col">{messages.importValueMapTarget}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map((entry) => (
                      <tr key={`${group.field}:${entry.excelValue}`}>
                        <td>{entry.excelValue}</td>
                        <td>{entry.count}</td>
                        <td>
                          <select
                            aria-label={`Map ${entry.excelValue} for ${group.label}`}
                            value={valueMappings?.[group.field]?.[entry.excelValue] || ''}
                            disabled={busy}
                            onChange={(event) => updateValueMapping(
                              group.field,
                              entry.excelValue,
                              event.target.value || null,
                            )}
                          >
                            <option value="">Select…</option>
                            {(group.options || []).map((option) => (
                              <option key={option.id || option.key} value={option.id || option.key}>
                                {option.name || option.key}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      ) : null}

      {step === STEPS.review ? (
        <div className="import-step">
          <div className="import-summary-strip" aria-live="polite">
            <span>{messages.importSummaryValid}: {summaryStats.validRows ?? 0}</span>
            <span>{messages.importSummaryInvalid}: {summaryStats.invalidRows ?? 0}</span>
            <span>{messages.importSummaryNeedReview}: {summaryStats.needReviewRows ?? summaryStats.duplicateRows ?? 0}</span>
            <span>{messages.importSummaryDuplicates}: {summaryStats.duplicateRows ?? 0}</span>
            <span>{messages.importSummaryWarnings}: {summaryStats.warningRows ?? 0}</span>
            {summaryStats.companyDialCode ? (
              <span>{messages.importDialHint}: {summaryStats.companyDialCode}</span>
            ) : null}
          </div>

          {invalidReasonGroups.length ? (
            <div className="import-reason-groups">
              <h3>{messages.importErrorsByReason}</h3>
              <ul>
                {invalidReasonGroups.map((group) => (
                  <li key={group.reason}>
                    <strong>{group.count}</strong>
                    {' × '}
                    {group.reason}
                    {group.samples?.length ? (
                      <span className="import-reason-samples">
                        {' '}
                        (rows {group.samples.map((sample) => sample.excelRowNumber).join(', ')})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {decisionRows.length ? (
            <div className="import-decisions">
              <div className="import-bulk-bar">
                <h3>{messages.importBulkTitle}</h3>
                <div className="import-bulk-actions" role="group" aria-label={messages.importBulkTitle}>
                  <button
                    type="button"
                    className="ghost-btn import-bulk-btn"
                    disabled={busy}
                    onClick={handleBulkSkip}
                  >
                    {messages.importBulkSkipAll}
                  </button>
                  <button
                    type="button"
                    className="ghost-btn import-bulk-btn"
                    disabled={busy}
                    onClick={handleBulkUpdate}
                  >
                    {messages.importBulkUpdateAll}
                  </button>
                  <button
                    type="button"
                    className="primary-btn import-bulk-btn"
                    disabled={busy}
                    onClick={handleBulkImportAll}
                  >
                    {messages.importBulkImportAll}
                  </button>
                </div>
              </div>

              <div className="import-summary-strip import-decision-plan" aria-live="polite">
                <strong>{messages.importDecisionPlanTitle}</strong>
                <span>{messages.importDecisionPlanSkip}: {decisionPlan.skipCount}</span>
                <span>{messages.importDecisionPlanUpdate}: {decisionPlan.updateCount}</span>
                <span>{messages.importDecisionPlanRestore}: {decisionPlan.restoreCount}</span>
                <span>{messages.importDecisionPlanNew}: {decisionPlan.importAsNewCount}</span>
                <span className={decisionPlan.unresolvedCount ? 'is-unresolved' : ''}>
                  {messages.importDecisionPlanUnresolved}: {decisionPlan.unresolvedCount}
                </span>
              </div>

              <h3>{messages.importPreview}</h3>
              {decisionRows.map((row) => {
                const decision = decisionsByRow[row.excelRowNumber] || {}
                const actions = row.duplicate?.actions || []
                const matches = row.duplicate?.matches || []
                const complete = isDecisionComplete(row, decision)
                return (
                  <div
                    key={row.excelRowNumber}
                    className={`import-decision-card ${complete ? 'is-complete' : 'is-pending'}`}
                  >
                    <div className="import-decision-head">
                      <strong>
                        {messages.importRow} {row.excelRowNumber}
                      </strong>
                      <span>
                        {row.name || '—'} · {row.phone || '—'} · {row.statusName || '—'}
                      </span>
                    </div>
                    {row.duplicate?.warning ? (
                      <p className="import-warning">{row.duplicate.warning}</p>
                    ) : null}
                    {(row.errors || []).length ? (
                      <ul className="import-error-list">
                        {row.errors.map((err) => (
                          <li key={err}>{err}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="import-decision-actions" role="group" aria-label={`Decision for row ${row.excelRowNumber}`}>
                      {actions.includes(IMPORT_DECISIONS.skip) ? (
                        <button
                          type="button"
                          className={`ghost-btn ${decision.action === IMPORT_DECISIONS.skip ? 'is-selected' : ''}`}
                          disabled={busy}
                          onClick={() => setDecision(row.excelRowNumber, {
                            action: IMPORT_DECISIONS.skip,
                            existingLeadId: undefined,
                            confirmImportAsNew: false,
                          })}
                        >
                          {messages.importDecisionSkip}
                        </button>
                      ) : null}
                      {actions.includes(IMPORT_DECISIONS.updateExisting) ? (
                        <button
                          type="button"
                          className={`ghost-btn ${decision.action === IMPORT_DECISIONS.updateExisting ? 'is-selected' : ''}`}
                          disabled={busy || !(row.duplicate.activeMatches || matches).length}
                          onClick={() => {
                            const active = (row.duplicate.activeMatches || matches).filter(
                              (m) => !m.isDeleted && !m.is_deleted,
                            )
                            setDecision(row.excelRowNumber, {
                              action: IMPORT_DECISIONS.updateExisting,
                              existingLeadId: active.length === 1 ? active[0].id : decision.existingLeadId,
                              confirmImportAsNew: false,
                            })
                          }}
                        >
                          {messages.importDecisionUpdate}
                        </button>
                      ) : null}
                      {actions.includes(IMPORT_DECISIONS.restoreExisting) ? (
                        <button
                          type="button"
                          className={`ghost-btn ${decision.action === IMPORT_DECISIONS.restoreExisting ? 'is-selected' : ''}`}
                          disabled={busy || !(row.duplicate.deletedMatches || []).length}
                          onClick={() => {
                            const deleted = row.duplicate.deletedMatches || matches.filter(
                              (m) => m.isDeleted || m.is_deleted,
                            )
                            setDecision(row.excelRowNumber, {
                              action: IMPORT_DECISIONS.restoreExisting,
                              existingLeadId: deleted.length === 1 ? deleted[0].id : decision.existingLeadId,
                              confirmImportAsNew: false,
                            })
                          }}
                        >
                          {messages.importDecisionRestore}
                        </button>
                      ) : null}
                      {actions.includes(IMPORT_DECISIONS.importAsNew) ? (
                        <button
                          type="button"
                          className={`ghost-btn ${decision.action === IMPORT_DECISIONS.importAsNew ? 'is-selected' : ''}`}
                          disabled={busy}
                          onClick={() => setDecision(row.excelRowNumber, {
                            action: IMPORT_DECISIONS.importAsNew,
                            existingLeadId: undefined,
                            confirmImportAsNew: decision.confirmImportAsNew === true,
                          })}
                        >
                          {messages.importDecisionNew}
                        </button>
                      ) : null}
                    </div>
                    {decision.action === IMPORT_DECISIONS.updateExisting
                      && (row.duplicate.activeMatches || matches).filter((m) => !m.isDeleted && !m.is_deleted).length > 0 ? (
                      <label className="manage-field">
                        {messages.importSelectExisting}
                        <select
                          value={decision.existingLeadId || ''}
                          disabled={busy}
                          onChange={(event) => setDecision(row.excelRowNumber, {
                            action: IMPORT_DECISIONS.updateExisting,
                            existingLeadId: event.target.value || undefined,
                          })}
                        >
                          <option value="">Select…</option>
                          {(row.duplicate.activeMatches || matches)
                            .filter((m) => !m.isDeleted && !m.is_deleted)
                            .map((match) => (
                              <option key={match.id} value={match.id}>
                                {match.number || match.id}
                                {match.name ? ` — ${match.name}` : ''}
                                {match.phone ? ` (${match.phone})` : ''}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : null}
                    {decision.action === IMPORT_DECISIONS.restoreExisting
                      && (row.duplicate.deletedMatches || []).length > 0 ? (
                      <label className="manage-field">
                        {messages.importSelectDeleted}
                        <select
                          value={decision.existingLeadId || ''}
                          disabled={busy}
                          onChange={(event) => setDecision(row.excelRowNumber, {
                            action: IMPORT_DECISIONS.restoreExisting,
                            existingLeadId: event.target.value || undefined,
                          })}
                        >
                          <option value="">Select…</option>
                          {(row.duplicate.deletedMatches || []).map((match) => (
                            <option key={match.id} value={match.id}>
                              {match.number || match.id}
                              {match.name ? ` — ${match.name}` : ''}
                              {match.phone ? ` (${match.phone})` : ''}
                              {' · deleted'}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {decision.action === IMPORT_DECISIONS.importAsNew ? (
                      <label className="check-line">
                        <input
                          type="checkbox"
                          checked={decision.confirmImportAsNew === true}
                          disabled={busy}
                          onChange={(event) => setDecision(row.excelRowNumber, {
                            action: IMPORT_DECISIONS.importAsNew,
                            confirmImportAsNew: event.target.checked,
                          })}
                        />
                        {messages.importConfirmNewLabel}
                      </label>
                    ) : null}
                    {row.primaryAgentName || row.statusName ? (
                      <p className="import-proposed">
                        Proposed status: {row.statusName || '—'}
                        {row.primaryAgentName ? ` · Agent: ${row.primaryAgentName}` : ''}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}

          <div className="import-preview-table-wrap">
            <h3>{messages.importPreview}</h3>
            {reviewRows.length === 0 ? (
              <p className="import-hint">{messages.importEmptyPreview}</p>
            ) : (
              <table className="import-preview-table">
                <thead>
                  <tr>
                    <th scope="col">{messages.importRow}</th>
                    <th scope="col">Name</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Status</th>
                    <th scope="col">Agent</th>
                    <th scope="col">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewRows.map((row) => {
                    const issues = [
                      ...(row.errors || []),
                      ...(row.reviewIssues || []),
                      ...(row.warnings || []),
                      row.duplicate?.requiresDecision ? 'Duplicate decision needed' : null,
                    ].filter(Boolean)
                    const rowClass = row.errors?.length
                      ? 'is-invalid'
                      : (row.reviewIssues || []).length
                        ? 'is-skipped'
                        : ''
                    return (
                      <tr key={row.excelRowNumber} className={rowClass}>
                        <td>{row.excelRowNumber}</td>
                        <td>{row.name || '—'}</td>
                        <td>{row.phone || '—'}</td>
                        <td>{row.statusName || '—'}</td>
                        <td>{row.primaryAgentName || '—'}</td>
                        <td>{issues.length ? issues.join('; ') : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      {step === STEPS.results ? (
        <div className="import-step">
          <p className="import-hint" role="status">
            {resultSummary.message || messages.importDone}
            {idempotent ? ' (Already completed — showing saved results.)' : ''}
          </p>
          <p className="import-hint">{messages.importResultsHint}</p>
          <div className="import-summary-strip">
            <span>{messages.importSucceeded}: {resultSummary.succeededCount}</span>
            <span>{messages.importCreated}: {resultSummary.createdCount}</span>
            <span>{messages.importUpdated}: {resultSummary.updatedCount}</span>
            <span>{messages.importFailed}: {resultSummary.failedCount}</span>
            <span>{messages.importSkipped}: {resultSummary.skippedCount}</span>
          </div>
          {(resultSummary.assignmentSummary || []).length ? (
            <div className="import-assignment-summary">
              <h3>Assignment summary</h3>
              <ul>
                {resultSummary.assignmentSummary.map((item) => (
                  <li key={item.primaryAgentId}>
                    {item.name || item.primaryAgentId}: {item.count}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {(results?.failed || []).length ? (
            <ul className="import-error-list">
              {results.failed.map((row) => (
                <li key={`${row.excelRowNumber}-${row.error}`}>
                  Row {row.excelRowNumber}: {row.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </ImportModal>
  )
}
