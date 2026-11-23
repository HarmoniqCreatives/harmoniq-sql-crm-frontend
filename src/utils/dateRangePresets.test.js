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

test('parseFlexibleDate accepts DD-MM-YYYY and YYYY-MM-DD', () => {
  assert.equal(parseFlexibleDate('23-11-2026'), '2026-11-23')
  assert.equal(parseFlexibleDate('2026-11-23'), '2026-11-23')
  assert.equal(parseFlexibleDate('31-02-2026'), '')
  assert.equal(parseFlexibleDate(''), '')
})

test('formatDisplayDate renders DD-MM-YYYY', () => {
  assert.equal(formatDisplayDate('2026-11-23'), '23-11-2026')
  assert.equal(formatDisplayDate(''), '')
})

test('Leads custom date UI exposes exactly one From and one To text field', () => {
  const source = readFileSync(join(here, '../pages/LeadsPage.jsx'), 'utf8')
  const customBlockMatch = source.match(
    /datePreset === DATE_PRESETS\.custom \? \(\s*<div className="lead-custom-dates">([\s\S]*?)<\/div>\s*\) : null/,
  )
  assert.ok(customBlockMatch, 'custom date block should exist')
  const block = customBlockMatch[1]
  const textInputs = block.match(/type="text"/g) || []
  const dateInputs = block.match(/type="date"/g) || []
  const fromLabels = block.match(/aria-label=\{messages\.dateFrom\}/g) || []
  const toLabels = block.match(/aria-label=\{messages\.dateTo\}/g) || []
  assert.equal(textInputs.length, 2)
  assert.equal(dateInputs.length, 0)
  assert.equal(fromLabels.length, 1)
  assert.equal(toLabels.length, 1)
  assert.equal(DATE_PRESETS.custom, 'custom')
})
