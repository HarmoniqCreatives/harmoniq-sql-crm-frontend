import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildTransferAssignmentPayload,
  displayCurrentAgentName,
  eligibleTransferAgents,
  normalizeTransferReason,
} from './transferFormHelpers.js'

describe('transferFormHelpers', () => {
  it('displays current agent name or Unassigned', () => {
    assert.equal(
      displayCurrentAgentName({ primaryAgent: { id: 'a1', name: 'Ada Agent' } }, 'Unassigned'),
      'Ada Agent',
    )
    assert.equal(displayCurrentAgentName({ primaryAgent: null }, 'Unassigned'), 'Unassigned')
    assert.equal(displayCurrentAgentName({}, 'Unassigned'), 'Unassigned')
    assert.equal(displayCurrentAgentName(null, 'Unassigned'), 'Unassigned')
  })

  it('excludes current agent from Transfer To options', () => {
    const agents = [
      { id: 'a1', name: 'Ada' },
      { id: 'a2', name: 'Ben' },
      { id: 'a3', name: 'Cara' },
    ]
    const eligible = eligibleTransferAgents(agents, 'a2')
    assert.deepEqual(eligible.map((row) => row.id), ['a1', 'a3'])
    assert.equal(eligible.some((row) => row.id === 'a2'), false)
  })

  it('keeps all agents when current is unassigned', () => {
    const agents = [
      { id: 'a1', name: 'Ada' },
      { id: 'a2', name: 'Ben' },
    ]
    assert.equal(eligibleTransferAgents(agents, '').length, 2)
    assert.equal(eligibleTransferAgents(agents, null).length, 2)
  })

  it('normalizes optional transfer reason without inventing a default', () => {
    assert.equal(normalizeTransferReason('  Coverage  '), 'Coverage')
    assert.equal(normalizeTransferReason(''), '')
    assert.equal(normalizeTransferReason('   '), '')
    assert.equal(normalizeTransferReason(null), '')
    assert.equal(normalizeTransferReason(undefined), '')
  })

  it('builds assignment payload with primary + reason only (no secondary)', () => {
    const payload = buildTransferAssignmentPayload('a2', '  Coverage  ')
    assert.deepEqual(payload, { primaryAgentId: 'a2', reason: 'Coverage' })
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'secondaryAgentId'), false)
    assert.deepEqual(buildTransferAssignmentPayload('a3', ''), {
      primaryAgentId: 'a3',
      reason: '',
    })
  })
})
