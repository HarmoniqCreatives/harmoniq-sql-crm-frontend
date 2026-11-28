/**
 * Client-side permission helpers for UX (hide/disable actions).
 *
 * **Permanent FILOS Super Admin policy:** protected Super Admin
 * (`role.isProtected` or `role.key === 'super_admin'`) automatically passes
 * every current and future feature permission check. New screens, menus,
 * buttons, and modules must call `hasPermission` / `perm.*` — do not hardcode
 * separate Super Admin branches unless technically required.
 *
 * Server `requirePermission` / `accessService.hasPermission` remain authoritative.
 * Never rely on these client checks alone for security.
 */

/** Stable Super Admin role key — mirrors backend `roleKeys.superAdmin`. */
export const SUPER_ADMIN_ROLE_KEY = 'super_admin'

/**
 * True when the viewer is the protected Super Admin grantor.
 * Identified from server-provided `/api/auth/me` fields (not client claims):
 * `isInitialSuperAdmin`, `role.isProtected`, or `role.key === 'super_admin'`.
 *
 * @param {{ isInitialSuperAdmin?: boolean, role?: { isProtected?: boolean, key?: string } }|null|undefined} user
 * @returns {boolean}
 */
export function isSuperAdmin(user) {
  if (!user) {
    return false
  }
  if (user.isInitialSuperAdmin) {
    return true
  }
  const role = user.role
  if (!role) {
    return false
  }
  // MySQL TINYINT may arrive as 0/1; Boolean() normalizes both.
  return Boolean(role.isProtected) || role.key === SUPER_ADMIN_ROLE_KEY
}

/**
 * @param {{ role?: { permissions?: string[], isProtected?: boolean, key?: string } }|null} user
 * @param {string} key permission key such as `users.invite`
 * @returns {boolean}
 */
export function hasPermission(user, key) {
  if (!key) {
    return false
  }
  if (isSuperAdmin(user)) {
    return true
  }
  const permissions = user?.role?.permissions
  if (!Array.isArray(permissions)) {
    return false
  }
  return permissions.includes(key)
}

/**
 * Flatten the API permission matrix into a Set of grantable UI keys.
 *
 * @param {Record<string, Array<{ key: string }>>|null|undefined} matrix
 * @returns {Set<string>}
 */
export function collectMatrixPermissionKeys(matrix) {
  return new Set(
    Object.values(matrix || {})
      .flat()
      .map((entry) => entry?.key)
      .filter(Boolean),
  )
}

/**
 * Build the permissions array to persist for create/update role saves.
 *
 * Existing roles: keep legacy keys that are not shown in the current matrix
 * (e.g. activities.manage, roles.manage) so the UI cannot silently delete them.
 * New roles: only explicitly selected matrix keys.
 *
 * @param {{
 *   selected: string[],
 *   existingPermissions?: string[],
 *   matrix: Record<string, Array<{ key: string }>>|null|undefined,
 *   preserveLegacy?: boolean,
 * }} input
 * @returns {string[]}
 */
export function buildSavedRolePermissions({
  selected,
  existingPermissions = [],
  matrix,
  preserveLegacy = false,
}) {
  const matrixKeys = collectMatrixPermissionKeys(matrix)
  const fromMatrix = (Array.isArray(selected) ? selected : [])
    .filter((key) => matrixKeys.has(key))
  if (!preserveLegacy) {
    return [...new Set(fromMatrix)]
  }
  const legacy = (Array.isArray(existingPermissions) ? existingPermissions : [])
    .filter((key) => key && !matrixKeys.has(key))
  return [...new Set([...fromMatrix, ...legacy])]
}

/** Stable permission key constants shared with the backend registry. */
export const perm = {
  usersView: 'users.view',
  usersCreate: 'users.create',
  usersEdit: 'users.edit',
  usersDelete: 'users.delete',
  usersInvite: 'users.invite',
  rolesView: 'roles.view',
  rolesCreate: 'roles.create',
  rolesEdit: 'roles.edit',
  rolesDelete: 'roles.delete',
  settingsManage: 'settings.manage',
  leadsView: 'leads.view',
  leadsCreate: 'leads.create',
  leadsEdit: 'leads.edit',
  leadsDelete: 'leads.delete',
  leadsAssign: 'leads.assign',
  leadsBulk: 'leads.bulk',
  leadsBulkAssign: 'leads.bulk_assign',
  leadsBulkTransfer: 'leads.bulk_transfer',
  leadsBulkDelete: 'leads.bulk_delete',
  leadsImport: 'leads.import',
  reportsView: 'reports.view',
  metaView: 'meta.view',
  metaManage: 'meta.manage',
  metaPagesManage: 'meta.pages.manage',
  whatsappManage: 'whatsapp.manage',
  whatsappViewLogs: 'whatsapp.view_logs',
  recycleBinView: 'recycle_bin.view',
  recycleBinRestore: 'recycle_bin.restore',
}
