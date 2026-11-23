import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasPermission, perm } from './permissions.js'

test('protected Super Admin can grant any permission including Bulk Access', () => {
  const viewer = {
    role: {
      isProtected: true,
      permissions: [],
    },
  }
  assert.equal(hasPermission(viewer, perm.leadsBulk), true)
  assert.equal(hasPermission(viewer, perm.leadsBulkAssign), true)
  assert.equal(hasPermission(viewer, perm.rolesEdit), true)
})

test('Manager without leads.bulk cannot use Bulk Access', () => {
  const viewer = {
    role: {
      isProtected: false,
      permissions: [perm.leadsView, perm.leadsEdit, perm.leadsAssign],
    },
  }
  assert.equal(hasPermission(viewer, perm.leadsBulk), false)
  assert.equal(hasPermission(viewer, perm.leadsView), true)
})

test('Manager with leads.bulk granted can use Bulk Access', () => {
  const viewer = {
    role: {
      isProtected: false,
      permissions: [perm.leadsView, perm.leadsBulk],
    },
  }
  assert.equal(hasPermission(viewer, perm.leadsBulk), true)
})
