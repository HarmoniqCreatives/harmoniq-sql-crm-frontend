import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveLoginReturnPath } from './loginReturn.js'

describe('resolveLoginReturnPath', () => {
  it('returns / when from is missing or unsafe', () => {
    assert.equal(resolveLoginReturnPath(undefined), '/')
    assert.equal(resolveLoginReturnPath(null), '/')
    assert.equal(resolveLoginReturnPath('https://evil.example/x'), '/')
    assert.equal(resolveLoginReturnPath('//evil.example'), '/')
    assert.equal(resolveLoginReturnPath('/login'), '/')
  })

  it('preserves protected app paths from string or location-like from', () => {
    assert.equal(resolveLoginReturnPath('/leads'), '/leads')
    assert.equal(
      resolveLoginReturnPath({ pathname: '/users', search: '?tab=1', hash: '#top' }),
      '/users?tab=1#top',
    )
  })
})
