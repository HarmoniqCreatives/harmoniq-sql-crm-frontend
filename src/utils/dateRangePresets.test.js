import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  formatDisplayDate,
  parseFlexibleDate,
  DATE_PRESETS,
} from './dateRangePresets.js'

const here = dirname(fileURLToPath(import.meta.url))

function readCustomDateBlock() {
  const source = readFileSync(join(here, '../pages/LeadsPage.jsx'), 'utf8')
  const startMarker = '<div className="lead-custom-dates">'
  const start = source.indexOf(startMarker)
  assert.ok(start >= 0, 'custom date block should exist')
  const afterStart = start + startMarker.length
  const end = source.indexOf(') : null', afterStart)
  assert.ok(end > afterStart, 'custom date block should close before ternary null')
  return source.slice(afterStart, end)
}

test('parseFlexibleDate accepts DD-MM-YYYY and YYYY-MM-DD', () => {
  assert.equal(parseFlexibleDate('23-11-2026'), '2026-11-23')
  assert.equal(parseFlexibleDate('2026-11-23'), '2026-11-23')
  assert.equal(parseFlexibleDate('31-02-2026'), '')
  assert.equal(parseFlexibleDate(''), '')
})

test('parseFlexibleDate rejects impossible calendar dates', () => {
  assert.equal(parseFlexibleDate('32-13-2026'), '')
  assert.equal(parseFlexibleDate('00-01-2026'), '')
  assert.equal(parseFlexibleDate('15-00-2026'), '')
  assert.equal(parseFlexibleDate('29-02-2025'), '')
  assert.equal(parseFlexibleDate('29-02-2024'), '2024-02-29')
})

test('formatDisplayDate renders DD-MM-YYYY', () => {
  assert.equal(formatDisplayDate('2026-11-23'), '23-11-2026')
  assert.equal(formatDisplayDate(''), '')
})

test('manual and calendar paths share canonical YYYY-MM-DD via format/parse', () => {
  const fromCalendar = '2026-11-23'
  const typed = formatDisplayDate(fromCalendar)
  assert.equal(typed, '23-11-2026')
  assert.equal(parseFlexibleDate(typed), fromCalendar)
})

test('Leads custom date UI: one From and one To field with shared picker', () => {
  const block = readCustomDateBlock()
  const fieldShells = block.match(/className="lead-custom-date-field"/g) || []
  const textInputs = block.match(/type="text"/g) || []
  const dateInputs = block.match(/type="date"/g) || []
  const fromLabels = block.match(/aria-label=\{messages\.dateFrom\}/g) || []
  const toLabels = block.match(/aria-label=\{messages\.dateTo\}/g) || []
  const fromCalendar = block.match(/aria-label=\{`\$\{messages\.dateFrom\} calendar`\}/g) || []
  const toCalendar = block.match(/aria-label=\{`\$\{messages\.dateTo\} calendar`\}/g) || []
  assert.equal(fieldShells.length, 2)
  assert.equal(textInputs.length, 2)
  assert.equal(dateInputs.length, 2)
  assert.equal(fromLabels.length, 1)
  assert.equal(toLabels.length, 1)
  assert.equal(fromCalendar.length, 1)
  assert.equal(toCalendar.length, 1)
  assert.ok(block.includes("setCustomFromPicker('start'"))
  assert.ok(block.includes("setCustomFromPicker('end'"))
  assert.ok(block.includes("commitCustomText('start'"))
  assert.ok(block.includes("commitCustomText('end'"))
  assert.ok(block.includes('lead-custom-date-picker'))
  assert.equal(DATE_PRESETS.custom, 'custom')
})
