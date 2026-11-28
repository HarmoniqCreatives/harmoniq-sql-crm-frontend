/**
 * Lead Excel import visibility helpers.
 * Always use centralized hasPermission — never check role.permissions for Super Admin.
 */

import { hasPermission, perm } from '../../auth/permissions.js'

/**
 * Whether the Leads page should show the Import Excel action.
 * Super Admin passes even when `leads.import` is absent from role.permissions
 * (matches `/api/auth/me` Super Admin payloads with empty/stale permission arrays).
 *
 * @param {{ isInitialSuperAdmin?: boolean, role?: object }|null|undefined} viewer
 * @returns {boolean}
 */
export function canShowImportExcel(viewer) {
  return hasPermission(viewer, perm.leadsImport)
}
