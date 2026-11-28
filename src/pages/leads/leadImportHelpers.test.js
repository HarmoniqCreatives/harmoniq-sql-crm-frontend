import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  IMPORT_DECISIONS,
  allDuplicateDecisionsComplete,
  applyBulkImportAsNew,
  applyBulkSkip,
  applyBulkUpdate,
  applyRememberedFieldMapping,
  assertExcelBlobResponse,
  buildConfirmDecisions,
  filenameFromContentDisposition,
  hasUnresolvedCatalogReview,
  isDecisionComplete,
  isZipArrayBuffer,
  buildMappingSummary,
  groupInvalidByReason,
  mappingHasRequiredFields,
  normalizeClientValueMappings,
  pendingValueMapEntries,
  rowsNeedingDecisions,
  summarizeDecisionPlan,
  summarizeImportResults,
  validateImportFile,
} from './leadImportHelpers.js'

test('validateImportFile rejects missing, wrong type, and oversized files', () => {
  assert.equal(validateImportFile(null).ok, false)
  assert.equal(validateImportFile({ name: 'leads.csv', size: 10 }).ok, false)
  assert.equal(validateImportFile({ name: 'leads.xlsx', size: 11 * 1024 * 1024 }).reason, 'size')
  assert.equal(validateImportFile({ name: 'leads.xlsx', size: 1024 }).ok, true)
})

test('mappingHasRequiredFields requires name, phone, and status', () => {
  assert.equal(mappingHasRequiredFields({ A: 'name', B: 'phone' }), false)
  assert.equal(mappingHasRequiredFields({ A: 'name', B: 'phone', C: 'status' }), true)
  assert.equal(mappingHasRequiredFields({ A: 'name', B: 'ignore', C: 'status' }), false)
  assert.equal(mappingHasRequiredFields({ A: 'name', B: 'skip', C: 'phone', D: 'status' }), true)
})

test('buildMappingSummary separates mapped, skipped, and missing required', () => {
  const summary = buildMappingSummary(
    ['Name', 'Mobile', 'Note 9', 'City'],
    { Name: 'name', Mobile: 'phone', 'Note 9': null, City: 'skip' },
    ['name', 'phone', 'status'],
    { name: 'Name', phone: 'Contact No', status: 'Status' },
  )
  assert.equal(summary.mappedCount, 2)
  assert.equal(summary.skippedCount, 2)
  assert.deepEqual(summary.missingRequired, ['status'])
  assert.ok(summary.unmatched.includes('City'))
})

test('groupInvalidByReason prefers backend groups and falls back to row errors', () => {
  const fromBackend = groupInvalidByReason({
    errorsByReason: [{ reason: 'Name is required', count: 3, samples: [] }],
  })
  assert.equal(fromBackend[0].count, 3)

  const fromRows = groupInvalidByReason(null, [
    { excelRowNumber: 2, errors: ['Name is required'], duplicate: null },
    { excelRowNumber: 3, errors: ['Name is required'], duplicate: null },
    { excelRowNumber: 4, errors: ['Email is invalid'], duplicate: { requiresDecision: true } },
  ])
  assert.equal(fromRows.find((row) => row.reason === 'Name is required').count, 2)
  assert.equal(fromRows.some((row) => row.reason === 'Email is invalid'), false)
})

test('duplicate decisions require action, lead selection, and import-as-new confirm', () => {
  const row = {
    excelRowNumber: 2,
    duplicate: {
      requiresDecision: true,
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.updateExisting, IMPORT_DECISIONS.importAsNew],
      matches: [{ id: 'lead-a' }, { id: 'lead-b' }],
    },
  }
  assert.equal(isDecisionComplete(row, {}), false)
  assert.equal(isDecisionComplete(row, { action: IMPORT_DECISIONS.skip }), true)
  assert.equal(isDecisionComplete(row, { action: IMPORT_DECISIONS.updateExisting }), false)
  assert.equal(isDecisionComplete(row, {
    action: IMPORT_DECISIONS.updateExisting,
    existingLeadId: 'lead-a',
  }), true)
  assert.equal(isDecisionComplete(row, { action: IMPORT_DECISIONS.importAsNew }), false)
  assert.equal(isDecisionComplete(row, {
    action: IMPORT_DECISIONS.importAsNew,
    confirmImportAsNew: true,
  }), true)
})

test('buildConfirmDecisions only includes rows needing review', () => {
  const rows = [
    { excelRowNumber: 2, duplicate: { requiresDecision: false } },
    {
      excelRowNumber: 3,
      duplicate: {
        requiresDecision: true,
        actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.updateExisting],
        matches: [{ id: 'lead-1' }],
      },
    },
  ]
  const decisions = {
    3: { action: IMPORT_DECISIONS.updateExisting, existingLeadId: 'lead-1' },
  }
  assert.equal(rowsNeedingDecisions(rows).length, 1)
  assert.deepEqual(buildConfirmDecisions(rows, decisions), [{
    excelRowNumber: 3,
    action: IMPORT_DECISIONS.updateExisting,
    existingLeadId: 'lead-1',
  }])
  assert.equal(allDuplicateDecisionsComplete(rows, decisions), true)
})

test('summarizeImportResults counts create vs update actions', () => {
  const summary = summarizeImportResults({
    succeededCount: 3,
    failedCount: 1,
    skippedCount: 2,
    succeeded: [
      { action: 'create' },
      { action: 'import_as_new' },
      { action: 'update_existing' },
    ],
    failed: [{ excelRowNumber: 9, error: 'bad' }],
    skipped: [{}, {}],
    message: 'done',
    assignmentSummary: [{ primaryAgentId: 'u1', name: 'Ann', count: 2 }],
  })
  assert.equal(summary.createdCount, 2)
  assert.equal(summary.updatedCount, 1)
  assert.equal(summary.succeededCount, 3)
  assert.equal(summary.failedCount, 1)
  assert.equal(summary.skippedCount, 2)
  assert.equal(summary.assignmentSummary.length, 1)
})

test('filenameFromContentDisposition reads attachment filename', () => {
  assert.equal(
    filenameFromContentDisposition(
      { 'content-disposition': 'attachment; filename="filos-lead-import-template.xlsx"' },
      'fallback.xlsx',
    ),
    'filos-lead-import-template.xlsx',
  )
  assert.equal(filenameFromContentDisposition({}, 'fallback.xlsx'), 'fallback.xlsx')
})

test('isZipArrayBuffer detects OOXML/xlsx magic', () => {
  assert.equal(isZipArrayBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), true)
  assert.equal(isZipArrayBuffer(new Uint8Array([0x7b, 0x22])), false)
})

function duplicateRow(excelRowNumber, { actions, matches = [] }) {
  return {
    excelRowNumber,
    name: `Row ${excelRowNumber}`,
    phone: `+9715${excelRowNumber}`,
    duplicate: {
      requiresDecision: true,
      actions,
      matches,
      warning: 'duplicate',
    },
  }
}

test('Skip All applies only to duplicate rows that allow Skip', () => {
  const rows = [
    { excelRowNumber: 1, duplicate: { requiresDecision: false } },
    duplicateRow(2, {
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.importAsNew],
      matches: [],
    }),
    duplicateRow(3, {
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.updateExisting, IMPORT_DECISIONS.importAsNew],
      matches: [{ id: 'lead-1' }],
    }),
    { excelRowNumber: 4, errors: ['bad'], duplicate: null },
  ]
  const result = applyBulkSkip(rows, { 3: { action: IMPORT_DECISIONS.importAsNew, confirmImportAsNew: true } })
  assert.equal(result.applied, 2)
  assert.equal(result.decisionsByRow[2].action, IMPORT_DECISIONS.skip)
  assert.equal(result.decisionsByRow[3].action, IMPORT_DECISIONS.skip)
  assert.equal(result.decisionsByRow[1], undefined)
  assert.equal(result.decisionsByRow[4], undefined)
})

test('Update All applies unique CRM matches and leaves multi-match unresolved', () => {
  const rows = [
    duplicateRow(2, {
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.updateExisting, IMPORT_DECISIONS.importAsNew],
      matches: [{ id: 'lead-a' }],
    }),
    duplicateRow(3, {
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.updateExisting, IMPORT_DECISIONS.importAsNew],
      matches: [{ id: 'lead-b' }, { id: 'lead-c' }],
    }),
    duplicateRow(4, {
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.importAsNew],
      matches: [],
    }),
    { excelRowNumber: 5, duplicate: { requiresDecision: false } },
  ]
  const prior = {
    3: { action: IMPORT_DECISIONS.skip },
  }
  const result = applyBulkUpdate(rows, prior)
  assert.equal(result.applied, 1)
  assert.equal(result.needsManualSelection, 1)
  assert.equal(result.ineligible, 1)
  assert.equal(result.decisionsByRow[2].action, IMPORT_DECISIONS.updateExisting)
  assert.equal(result.decisionsByRow[2].existingLeadId, 'lead-a')
  // Multi-match left unchanged — still Skip from prior, not auto-picked first match
  assert.equal(result.decisionsByRow[3].action, IMPORT_DECISIONS.skip)
  assert.equal(result.decisionsByRow[3].existingLeadId, undefined)
  assert.equal(result.decisionsByRow[5], undefined)
})

test('Import All requires explicit confirm and sets confirmImportAsNew', () => {
  const rows = [
    duplicateRow(2, {
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.importAsNew],
    }),
    duplicateRow(3, {
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.updateExisting],
      matches: [{ id: 'lead-1' }],
    }),
  ]
  const blocked = applyBulkImportAsNew(rows, {}, { confirmImportAsNew: false })
  assert.equal(blocked.blocked, true)
  assert.equal(blocked.applied, 0)

  const result = applyBulkImportAsNew(rows, {}, { confirmImportAsNew: true })
  assert.equal(result.applied, 1)
  assert.equal(result.ineligible, 1)
  assert.equal(result.decisionsByRow[2].action, IMPORT_DECISIONS.importAsNew)
  assert.equal(result.decisionsByRow[2].confirmImportAsNew, true)
  assert.equal(result.decisionsByRow[3], undefined)
})

test('individual override after bulk Skip is preserved in decision plan', () => {
  const rows = [
    duplicateRow(2, {
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.updateExisting, IMPORT_DECISIONS.importAsNew],
      matches: [{ id: 'lead-1' }],
    }),
    duplicateRow(3, {
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.importAsNew],
    }),
  ]
  const bulk = applyBulkSkip(rows, {})
  const overridden = {
    ...bulk.decisionsByRow,
    2: {
      action: IMPORT_DECISIONS.updateExisting,
      existingLeadId: 'lead-1',
      confirmImportAsNew: false,
    },
  }
  const plan = summarizeDecisionPlan(rows, overridden)
  assert.equal(plan.skipCount, 1)
  assert.equal(plan.updateCount, 1)
  assert.equal(plan.unresolvedCount, 0)
  assert.equal(allDuplicateDecisionsComplete(rows, overridden), true)
})

test('summarizeDecisionPlan counts unresolved duplicate decisions only', () => {
  const rows = [
    { excelRowNumber: 1, duplicate: { requiresDecision: false } },
    duplicateRow(2, {
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.importAsNew],
    }),
    duplicateRow(3, {
      actions: [IMPORT_DECISIONS.skip, IMPORT_DECISIONS.updateExisting, IMPORT_DECISIONS.importAsNew],
      matches: [{ id: 'a' }, { id: 'b' }],
    }),
  ]
  const plan = summarizeDecisionPlan(rows, {
    2: { action: IMPORT_DECISIONS.skip },
    3: { action: IMPORT_DECISIONS.updateExisting },
  })
  assert.equal(plan.duplicateCount, 2)
  assert.equal(plan.skipCount, 1)
  assert.equal(plan.updateCount, 0)
  assert.equal(plan.unresolvedCount, 1)
})

test('pendingValueMapEntries skips exact suggestions and resolved maps', () => {
  const workspace = {
    groups: [{
      field: 'source',
      label: 'Lead Source',
      options: [{ id: 'manual', name: 'manual' }],
      entries: [
        { excelValue: 'Direct', count: 2, suggestion: null },
        { excelValue: 'Facebook', count: 1, suggestion: { matched: true, confidence: 'exact' } },
      ],
    }],
  }
  const pending = pendingValueMapEntries(workspace, normalizeClientValueMappings({}))
  assert.equal(pending.length, 1)
  assert.equal(pending[0].excelValue, 'Direct')

  const resolved = pendingValueMapEntries(
    workspace,
    normalizeClientValueMappings({ source: { Direct: 'manual' } }),
  )
  assert.equal(resolved.length, 0)
})

test('applyRememberedFieldMapping only restores current headers/fields', () => {
  const next = applyRememberedFieldMapping(
    ['Name', 'City'],
    { Name: 'name', City: null },
    { Name: 'phone', City: 'status', Gone: 'email' },
    ['name', 'phone', 'status', 'email'],
  )
  assert.equal(next.Name, 'phone')
  assert.equal(next.City, 'status')
  assert.equal(Object.prototype.hasOwnProperty.call(next, 'Gone'), false)
})

test('hasUnresolvedCatalogReview detects summary and row review issues', () => {
  assert.equal(hasUnresolvedCatalogReview({ catalogNeedReviewRows: 2 }, []), true)
  assert.equal(hasUnresolvedCatalogReview({}, [{ reviewIssues: ['map me'] }]), true)
  assert.equal(hasUnresolvedCatalogReview({ catalogNeedReviewRows: 0 }, [{ errors: ['x'] }]), false)
})

test('assertExcelBlobResponse accepts zip blobs and rejects JSON error blobs', async () => {
  const ok = await assertExcelBlobResponse({
    data: new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="filos-lead-import-template.xlsx"',
    },
  })
  assert.equal(ok instanceof Blob, true)

  await assert.rejects(
    () => assertExcelBlobResponse({
      data: new Blob([JSON.stringify({ data: null, error: { message: 'Sign in to continue.' } })], {
        type: 'application/json',
      }),
      headers: { 'content-type': 'application/json' },
    }),
    (error) => error instanceof Error && error.message === 'Sign in to continue.',
  )
})
