import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import {
  createAuthResponseInterceptor,
  isRefreshInFlight,
  resetAuthRefreshState,
  runSingleFlightRefresh,
  shouldSkipAuthRefresh,
} from './authRefresh.js'

describe('authRefresh', () => {
  beforeEach(() => {
    resetAuthRefreshState()
  })

  it('skips refresh for auth endpoints', () => {
    assert.equal(shouldSkipAuthRefresh('/auth/login'), true)
    assert.equal(shouldSkipAuthRefresh('/auth/refresh'), true)
    assert.equal(shouldSkipAuthRefresh('/leads'), false)
  })

  it('shares one refresh promise across concurrent callers', async () => {
    let calls = 0
    const refreshSession = async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { data: { accessToken: 'token-1' } }
    }
    const p1 = runSingleFlightRefresh(refreshSession)
    assert.equal(isRefreshInFlight(), true)
    const p2 = runSingleFlightRefresh(refreshSession)
    const [a, b] = await Promise.all([p1, p2])
    assert.equal(calls, 1)
    assert.equal(a.data.accessToken, 'token-1')
    assert.equal(b.data.accessToken, 'token-1')
    assert.equal(isRefreshInFlight(), false)
  })

  it('retries original request after successful refresh', async () => {
    const tokens = []
    let retried = false
    const api = async (config) => {
      retried = true
      return { data: { ok: true }, config }
    }
    const interceptor = createAuthResponseInterceptor({
      api,
      refreshSession: async () => ({ data: { accessToken: 'fresh-token' } }),
      setAccessToken: (token) => tokens.push(token),
      clearAccessToken: () => {},
      onAuthFailure: () => {
        throw new Error('should not clear auth on success')
      },
    })
    const result = await interceptor({
      response: { status: 401 },
      config: { url: '/leads', headers: {} },
    })
    assert.equal(retried, true)
    assert.deepEqual(tokens, ['fresh-token'])
    assert.equal(result.data.ok, true)
  })

  it('clears auth and rejects when refresh fails', async () => {
    let cleared = false
    let failed = false
    const interceptor = createAuthResponseInterceptor({
      api: async () => ({ data: {} }),
      refreshSession: async () => {
        throw new Error('refresh failed')
      },
      setAccessToken: () => {},
      clearAccessToken: () => {
        cleared = true
      },
      onAuthFailure: () => {
        failed = true
      },
    })
    await assert.rejects(
      () => interceptor({
        response: { status: 401 },
        config: { url: '/leads', headers: {} },
      }),
      /refresh failed/,
    )
    assert.equal(cleared, true)
    assert.equal(failed, true)
  })

  it('does not refresh or logout on 403', async () => {
    let refreshCalls = 0
    let cleared = false
    const interceptor = createAuthResponseInterceptor({
      api: async () => ({ data: {} }),
      refreshSession: async () => {
        refreshCalls += 1
        return { data: { accessToken: 'x' } }
      },
      setAccessToken: () => {},
      clearAccessToken: () => {
        cleared = true
      },
      onAuthFailure: () => {
        cleared = true
      },
    })
    await assert.rejects(
      () => interceptor({
        response: { status: 403, data: { error: { message: 'forbidden' } } },
        config: { url: '/leads', headers: {} },
      }),
    )
    assert.equal(refreshCalls, 0)
    assert.equal(cleared, false)
  })

  it('does not clear auth on network errors or 5xx', async () => {
    let cleared = false
    const interceptor = createAuthResponseInterceptor({
      api: async () => ({ data: {} }),
      refreshSession: async () => ({ data: { accessToken: 'x' } }),
      setAccessToken: () => {},
      clearAccessToken: () => {
        cleared = true
      },
      onAuthFailure: () => {
        cleared = true
      },
    })
    await assert.rejects(() => interceptor({
      message: 'Network Error',
      config: { url: '/leads' },
    }))
    await assert.rejects(() => interceptor({
      response: { status: 500 },
      config: { url: '/leads', headers: {} },
    }))
    assert.equal(cleared, false)
  })

  it('avoids infinite retry loops with _authRetry', async () => {
    let refreshCalls = 0
    const interceptor = createAuthResponseInterceptor({
      api: async () => ({ data: {} }),
      refreshSession: async () => {
        refreshCalls += 1
        return { data: { accessToken: 'x' } }
      },
      setAccessToken: () => {},
      clearAccessToken: () => {},
      onAuthFailure: () => {},
    })
    await assert.rejects(() => interceptor({
      response: { status: 401 },
      config: { url: '/leads', headers: {}, _authRetry: true },
    }))
    assert.equal(refreshCalls, 0)
  })

  it('concurrent 401s trigger only one refresh', async () => {
    let refreshCalls = 0
    const api = async () => ({ data: { ok: true } })
    const interceptor = createAuthResponseInterceptor({
      api,
      refreshSession: async () => {
        refreshCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 30))
        return { data: { accessToken: 'shared' } }
      },
      setAccessToken: () => {},
      clearAccessToken: () => {},
      onAuthFailure: () => {},
    })
    await Promise.all([
      interceptor({ response: { status: 401 }, config: { url: '/a', headers: {} } }),
      interceptor({ response: { status: 401 }, config: { url: '/b', headers: {} } }),
      interceptor({ response: { status: 401 }, config: { url: '/c', headers: {} } }),
    ])
    assert.equal(refreshCalls, 1)
  })
})
