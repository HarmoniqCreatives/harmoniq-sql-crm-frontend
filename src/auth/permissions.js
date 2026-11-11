/**
 * Client-side permission helpers for UX (hide/disable actions).
 *
 * Server `requirePermission` remains authoritative—never rely on these checks alone.
 */

/**
 * @param {{ role?: { permissions?: string[] } }|null} user
 * @param {string} key permission key such as `users.invite`
 * @returns {boolean}
 */
export function hasPermission(user, key) {
  if (user?.role?.isProtected) {
    return true
  }
  const permissions = user?.role?.permissions
  if (!Array.isArray(permissions)) {
    return false
  }
  return permissions.includes(key)
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
  metaView: 'meta.view',
  metaManage: 'meta.manage',
  metaPagesManage: 'meta.pages.manage',
}
