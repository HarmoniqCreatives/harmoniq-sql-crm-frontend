import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { claimShownId, notificationPathFromData } from './webPushHelpers.js'

describe('notificationPathFromData', () => {
  it('prefers leadId deep link', () => {
    assert.equal(
      notificationPathFromData({ leadId: 'abc-123', href: '/leads/other' }),
      '/leads/abc-123',
    )
  })

  it('uses relative href when leadId missing', () => {
    assert.equal(notificationPathFromData({ href: '/leads/xyz' }), '/leads/xyz')
  })

  it('extracts pathname from absolute href', () => {
    assert.equal(
      notificationPathFromData({ href: 'https://example.com/leads/xyz?x=1' }),
      '/leads/xyz?x=1',
    )
  })

  it('falls back to root', () => {
    assert.equal(notificationPathFromData({}), '/')
  })
})

describe('claimShownId', () => {
  it('claims a new id and rejects a second claim within TTL', () => {
    const first = claimShownId({}, 'n1', 1_000, 60_000)
    assert.equal(first.claimed, true)
    const second = claimShownId(first.map, 'n1', 1_500, 60_000)
    assert.equal(second.claimed, false)
  })

  it('allows reclaim after TTL expiry', () => {
    const first = claimShownId({}, 'n1', 1_000, 100)
    const later = claimShownId(first.map, 'n1', 1_250, 100)
    assert.equal(later.claimed, true)
  })
})
