import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildSavedRolePermissions,
  hasPermission,
  isSuperAdmin,
  perm,
  SUPER_ADMIN_ROLE_KEY,
} from './permissions.js'

const sampleMatrix = {
  leads: [
    { key: 'leads.view', description: 'View leads' },
    { key: 'leads.edit', description: 'Edit leads' },
  ],
  roles: [
    { key: 'roles.edit', description: 'Edit roles' },
  ],
}

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

test('Super Admin passes future keys not present in the client perm catalog', () => {
  const viewer = {
    role: {
      key: SUPER_ADMIN_ROLE_KEY,
      isProtected: true,
      permissions: [],
    },
  }
  assert.equal(isSuperAdmin(viewer), true)
  assert.equal(hasPermission(viewer, 'future.module.never_seeded'), true)
})

test('isInitialSuperAdmin alone grants Import Excel without leads.import assignment', () => {
  const viewer = {
    isInitialSuperAdmin: true,
    role: {
      key: SUPER_ADMIN_ROLE_KEY,
      isProtected: 1,
      permissions: ['leads.view'],
    },
  }
  assert.equal(isSuperAdmin(viewer), true)
  assert.equal(hasPermission(viewer, perm.leadsImport), true)
})

test('Super Admin identified by role key alone still bypasses', () => {
  const viewer = {
    role: {
      key: SUPER_ADMIN_ROLE_KEY,
      isProtected: false,
      permissions: [],
    },
  }
  assert.equal(isSuperAdmin(viewer), true)
  assert.equal(hasPermission(viewer, perm.leadsImport), true)
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

test('leads.import is gated like other lead permissions; Super Admin bypasses', () => {
  assert.equal(perm.leadsImport, 'leads.import')
  const agent = {
    role: {
      isProtected: false,
      permissions: [perm.leadsView, perm.leadsCreate],
    },
  }
  const importer = {
    role: {
      isProtected: false,
      permissions: [perm.leadsView, perm.leadsImport],
    },
  }
  const superAdmin = {
    role: {
      isProtected: true,
      permissions: [],
    },
  }
  assert.equal(hasPermission(agent, perm.leadsImport), false)
  assert.equal(hasPermission(importer, perm.leadsImport), true)
  assert.equal(hasPermission(superAdmin, perm.leadsImport), true)
})

test('non-Super Admin roles never auto-receive all permissions', () => {
  const admin = {
    role: {
      key: 'admin',
      isProtected: false,
      permissions: [perm.leadsView],
    },
  }
  assert.equal(isSuperAdmin(admin), false)
  assert.equal(hasPermission(admin, perm.leadsImport), false)
  assert.equal(hasPermission(admin, 'future.module.never_seeded'), false)
})

test('buildSavedRolePermissions preserves legacy keys outside the matrix on update', () => {
  const selected = ['leads.view', 'leads.edit']
  const existing = [
    'leads.view',
    'activities.manage',
    'templates.manage',
    'communications.send',
    'audit.view',
    'users.manage',
    'roles.manage',
  ]
  const saved = buildSavedRolePermissions({
    selected,
    existingPermissions: existing,
    matrix: sampleMatrix,
    preserveLegacy: true,
  })
  assert.equal(saved.includes('leads.edit'), true)
  assert.equal(saved.includes('activities.manage'), true)
  assert.equal(saved.includes('templates.manage'), true)
  assert.equal(saved.includes('communications.send'), true)
  assert.equal(saved.includes('audit.view'), true)
  assert.equal(saved.includes('users.manage'), true)
  assert.equal(saved.includes('roles.manage'), true)
})

test('buildSavedRolePermissions for new roles keeps only selected matrix keys', () => {
  const saved = buildSavedRolePermissions({
    selected: ['leads.view', 'activities.manage'],
    existingPermissions: ['activities.manage'],
    matrix: sampleMatrix,
    preserveLegacy: false,
  })
  assert.deepEqual(saved, ['leads.view'])
})

test('roles.manage is treated as sufficient for edit UX alongside roles.edit', () => {
  const legacyEditor = {
    role: {
      isProtected: false,
      permissions: ['roles.view', 'roles.manage'],
    },
  }
  const modernEditor = {
    role: {
      isProtected: false,
      permissions: ['roles.view', 'roles.edit'],
    },
  }
  assert.equal(
    hasPermission(legacyEditor, perm.rolesEdit) || hasPermission(legacyEditor, 'roles.manage'),
    true,
  )
  assert.equal(
    hasPermission(modernEditor, perm.rolesEdit) || hasPermission(modernEditor, 'roles.manage'),
    true,
  )
})

test('viewer without a permission cannot grant it via hasPermission gate', () => {
  const viewer = {
    role: {
      isProtected: false,
      permissions: ['roles.edit', 'leads.view'],
    },
  }
  assert.equal(hasPermission(viewer, 'leads.bulk'), false)
  assert.equal(hasPermission(viewer, 'roles.edit'), true)
})
