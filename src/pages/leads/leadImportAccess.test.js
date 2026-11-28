import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canShowImportExcel } from './leadImportAccess.js'

test('Super Admin can use Import Excel without leads.import in role.permissions', () => {
  // Shape mirrors GET /api/auth/me for Suvid Super Admin (isProtected, no import key).
  const meUser = {
    id: 'user-sa',
    isInitialSuperAdmin: true,
    role: {
      id: 'role-sa',
      key: 'super_admin',
      name: 'Super Admin',
      scope: 'COMPANY',
      isProtected: 1,
      permissions: [
        'leads.view',
        'leads.create',
        'leads.edit',
        // intentionally no leads.import — must still see Import Excel
      ],
    },
  }
  assert.equal(canShowImportExcel(meUser), true)
})

test('Super Admin with empty permissions array can still use Import Excel', () => {
  const meUser = {
    isInitialSuperAdmin: true,
    role: {
      key: 'super_admin',
      isProtected: true,
      permissions: [],
    },
  }
  assert.equal(canShowImportExcel(meUser), true)
})

test('Admin without leads.import cannot see Import Excel', () => {
  const admin = {
    isInitialSuperAdmin: false,
    role: {
      key: 'admin',
      isProtected: false,
      permissions: ['leads.view', 'leads.create', 'leads.edit'],
    },
  }
  assert.equal(canShowImportExcel(admin), false)
})

test('Admin with leads.import can see Import Excel', () => {
  const admin = {
    role: {
      key: 'admin',
      isProtected: false,
      permissions: ['leads.view', 'leads.import'],
    },
  }
  assert.equal(canShowImportExcel(admin), true)
})

test('Manager/Agent without leads.import stay blocked', () => {
  for (const key of ['manager', 'agent']) {
    assert.equal(canShowImportExcel({
      role: { key, isProtected: false, permissions: ['leads.view'] },
    }), false)
  }
})
