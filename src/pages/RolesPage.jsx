import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createRole,
  deleteRole,
  listRoles,
  readApiError,
  updateRole,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, perm } from '../auth/permissions'
import { Toast } from '../components/Toast'

/**
 * Roles & permissions administration.
 *
 * The matrix only offers checkboxes for permissions the viewer already holds,
 * matching backend privilege-escalation rules. System/protected roles stay
 * non-deletable in the UI as well as the API.
 */
export function RolesPage() {
  const { user: viewer } = useAuth()
  const canView = hasPermission(viewer, perm.rolesView)
  const canCreate = hasPermission(viewer, perm.rolesCreate)
  const canEdit = hasPermission(viewer, perm.rolesEdit)
  const canDelete = hasPermission(viewer, perm.rolesDelete)

  const [roles, setRoles] = useState([])
  const [matrix, setMatrix] = useState({})
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null)

  async function load() {
    if (!canView) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const payload = await listRoles()
      setRoles(payload.data.roles || [])
      setMatrix(payload.data.permissionMatrix || {})
    } catch (loadError) {
      setError(readApiError(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [canView])

  async function onDelete(role) {
    if (!window.confirm(`Delete role ${role.name}?`)) {
      return
    }
    try {
      const payload = await deleteRole(role.id)
      setNotice(payload.data.message)
      await load()
    } catch (deleteError) {
      setError(readApiError(deleteError))
    }
  }

  if (!canView) {
    return <div className="admin-panel"><p className="empty-state">You do not have permission to view roles.</p></div>
  }

  return (
    <div>
      <Toast notice={notice} error={error} onClear={() => { setNotice(''); setError('') }} />
      <div className="admin-toolbar">
        <div>
          <h3 style={{ margin: 0 }}>Role List</h3>
          <p className="sub" style={{ margin: '0.25rem 0 0' }}>Create reusable roles and control access by module and action.</p>
        </div>
        <div className="icon-actions">
          <Link className="ghost-btn" to="/permissions">Manage Permissions</Link>
          {canCreate ? (
            <button type="button" className="primary-btn" onClick={() => setEditor({ id: null, name: '', description: '', permissions: [] })}>
              Create role
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-panel">
        {loading ? (
          <>
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Scope</th>
                  <th>Users</th>
                  <th>Permissions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <strong>{role.name}</strong>
                      <div className="sub">{role.key}{role.isSystem ? ' · system' : ''}</div>
                    </td>
                    <td>{role.scope}</td>
                    <td>{role.userCount}</td>
                    <td>{(role.permissions || []).length}</td>
                    <td>
                      <div className="icon-actions">
                        <Link className="icon-btn" to={`/roles/${role.id}`} title="View role">View</Link>
                        <Link className="icon-btn" to={`/permissions?roleId=${role.id}`} title="Manage permissions">Permissions</Link>
                        {canEdit && !role.isProtected ? (
                          <button type="button" className="icon-btn" onClick={() => setEditor(role)}>Edit</button>
                        ) : null}
                        {canDelete && !role.isSystem ? (
                          <button type="button" className="danger-btn" onClick={() => onDelete(role)}>Delete</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editor ? (
        <RoleEditorModal
          role={editor}
          matrix={matrix}
          heldPermissions={viewer?.role?.permissions || []}
          onClose={() => setEditor(null)}
          onSaved={async (message) => {
            setEditor(null)
            setNotice(message)
            await load()
          }}
          onError={setError}
        />
      ) : null}
    </div>
  )
}

function RoleEditorModal({ role, matrix, heldPermissions, onClose, onSaved, onError }) {
  const [name, setName] = useState(role.name || '')
  const [description, setDescription] = useState(role.description || '')
  const [permissions, setPermissions] = useState(role.permissions || [])
  const [busy, setBusy] = useState(false)
  const modules = Object.keys(matrix || {})

  function toggle(key) {
    setPermissions((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ))
  }

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const body = { name, description, permissions }
      const payload = role.id
        ? await updateRole(role.id, body)
        : await createRole(body)
      await onSaved(payload.data.message)
    } catch (submitError) {
      onError(readApiError(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ width: 'min(100%, 720px)', maxHeight: '90vh', overflow: 'auto' }}>
        <h3>{role.id ? 'Edit role' : 'Create role'}</h3>
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="roleName">Name</label>
            <input id="roleName" value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="roleDescription">Description</label>
            <textarea id="roleDescription" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
          </div>
          {modules.map((moduleName) => (
            <div className="perm-module" key={moduleName}>
              <h4>{moduleName}</h4>
              <div className="perm-list">
                {(matrix[moduleName] || []).map((entry) => {
                  const allowed = heldPermissions.includes(entry.key)
                  return (
                    <label key={entry.key}>
                      <input
                        type="checkbox"
                        checked={permissions.includes(entry.key)}
                        disabled={busy || !allowed}
                        onChange={() => toggle(entry.key)}
                      />
                      <span>
                        <strong>{entry.key}</strong>
                        <div className="sub">{entry.description}</div>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save role'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function RoleDetailPage() {
  return <RolesPage />
}
