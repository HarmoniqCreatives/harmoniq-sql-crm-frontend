import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bootAuthSession } from './sessionBoot.js'

function createDeps(overrides = {}) {
  const state = {
    token: '',
    cleared: false,
    refreshCalls: 0,
    meCalls: 0,
  }
  const deps = {
    getAccessToken: () => state.token,
    setAccessToken: (token) => {
      state.token = token || ''
    },
    clearAccessToken: () => {
      state.token = ''
      state.cleared = true
    },
    getMe: async () => {
      state.meCalls += 1
      throw new Error('getMe not stubbed')
    },
    refreshSession: async () => {
      state.refreshCalls += 1
      throw new Error('refresh not stubbed')
    },
    ...overrides,
    _state: state,
  }
  return deps
}

describe('bootAuthSession', () => {
  it('loads user from access token without calling refresh', async () => {
    const user = { id: 'u1', name: 'Ada' }
    const deps = createDeps({
      getAccessToken: () => 'access-1',
      getMe: async () => {
        deps._state.meCalls += 1
        return { data: { user } }
      },
      refreshSession: async () => {
        deps._state.refreshCalls += 1
        throw new Error('should not refresh')
      },
    })
    const result = await bootAuthSession(deps)
    assert.deepEqual(result, user)
    assert.equal(deps._state.meCalls, 1)
    assert.equal(deps._state.refreshCalls, 0)
    assert.equal(deps._state.cleared, false)
  })

  it('restores session via refresh when access token is missing', async () => {
    const user = { id: 'u2', name: 'NoToken' }
    const deps = createDeps({
      getAccessToken: () => '',
      refreshSession: async () => {
        deps._state.refreshCalls += 1
        return { data: { accessToken: 'fresh-1' } }
      },
      setAccessToken: (token) => {
        deps._state.token = token
      },
      getMe: async () => {
        deps._state.meCalls += 1
        assert.equal(deps._state.token, 'fresh-1')
        return { data: { user } }
      },
    })
    const result = await bootAuthSession(deps)
    assert.deepEqual(result, user)
    assert.equal(deps._state.refreshCalls, 1)
    assert.equal(deps._state.meCalls, 1)
    assert.equal(deps._state.token, 'fresh-1')
  })

  it('refreshes once when access token exists but getMe fails', async () => {
    const user = { id: 'u3' }
    let mePhase = 0
    const deps = createDeps({
      getAccessToken: () => 'stale',
      getMe: async () => {
        deps._state.meCalls += 1
        mePhase += 1
        if (mePhase === 1) {
          throw new Error('401')
        }
        return { data: { user } }
      },
      refreshSession: async () => {
        deps._state.refreshCalls += 1
        return { data: { accessToken: 'fresh-2' } }
      },
      setAccessToken: (token) => {
        deps._state.token = token
      },
    })
    const result = await bootAuthSession(deps)
    assert.deepEqual(result, user)
    assert.equal(deps._state.refreshCalls, 1)
    assert.equal(deps._state.meCalls, 2)
  })

  it('returns null and clears token when refresh fails without access token', async () => {
    const deps = createDeps({
      getAccessToken: () => '',
      refreshSession: async () => {
        deps._state.refreshCalls += 1
        throw new Error('no cookie')
      },
    })
    const result = await bootAuthSession(deps)
    assert.equal(result, null)
    assert.equal(deps._state.refreshCalls, 1)
    assert.equal(deps._state.cleared, true)
  })

  it('returns null when refresh succeeds but getMe still fails', async () => {
    const deps = createDeps({
      getAccessToken: () => '',
      refreshSession: async () => {
        deps._state.refreshCalls += 1
        return { data: { accessToken: 'fresh-3' } }
      },
      setAccessToken: (token) => {
        deps._state.token = token
      },
      getMe: async () => {
        deps._state.meCalls += 1
        throw new Error('still unauthorized')
      },
    })
    const result = await bootAuthSession(deps)
    assert.equal(result, null)
    assert.equal(deps._state.refreshCalls, 1)
    assert.equal(deps._state.meCalls, 1)
    assert.equal(deps._state.cleared, true)
  })

  it('returns null when refresh returns no access token', async () => {
    const deps = createDeps({
      getAccessToken: () => '',
      refreshSession: async () => {
        deps._state.refreshCalls += 1
        return { data: {} }
      },
    })
    const result = await bootAuthSession(deps)
    assert.equal(result, null)
    assert.equal(deps._state.cleared, true)
  })
})
