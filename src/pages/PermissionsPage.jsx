import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listRoles, readApiError, updateRole } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, perm } from '../auth/permissions'
import { Toast } from '../components/Toast'

/**
 * Dedicated Manage Permissions page (legacy parity under Roles & Permissions).
 * Uses the central permission matrix from the API; backend enforces escalation rules.
 */
export function PermissionsPage() {
  const { user: viewer } = useAuth()
  const [params] = useSearchParams()
  const canView = hasPermission(viewer, perm.rolesView)
  const canEdit = hasPermission(viewer, perm.rolesEdit) || hasPermission(viewer, 'roles.manage')
  const held = viewer?.role?.permissions || []

  const [roles, setRoles] = useState([])
  const [matrix, setMatrix] = useState({})
  const [roleId, setRoleId] = useState(params.get('roleId') || '')
  const [selected, setSelected] = useState([])
  const [scope, setScope] = useState('COMPANY')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const payload = await listRoles()
      const loaded = payload.data.roles || []
      setRoles(loaded)
      setMatrix(payload.data.permissionMatrix || {})
      const preferred = params.get('roleId')
      const initial = loaded.find((row) => row.id === preferred) || loaded[0]
      if (initial) {
        setRoleId(initial.id)
        setSelected(initial.permissions || [])
        setScope(initial.scope || 'COMPANY')
      }
    } catch (loadError) {
      setError(readApiError(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canView) {
      load()
    } else {
      setLoading(false)
    }
  }, [canView])

  useEffect(() => {
    const role = roles.find((row) => row.id === roleId)
    if (!role) {
      return
    }
    setSelected(role.permissions || [])
    setScope(role.scope || 'COMPANY')
  }, [roleId, roles])

  const role = roles.find((row) => row.id === roleId)
  const locked = !canEdit || Boolean(role?.isProtected) || viewer?.role?.id === roleId

  function toggle(key) {
    if (locked || !held.includes(key)) {
      return
    }
    setSelected((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ))
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (!role || locked) {
      return
    }
    if (!window.confirm('Save permission changes for this role?')) {
      return
    }
    setBusy(true)
    setError('')
    try {
      const payload = await updateRole(role.id, { permissions: selected, scope })
      setNotice(payload.data.message)
      await load()
    } catch (saveError) {
      setError(readApiError(saveError))
    } finally {
      setBusy(false)
    }
  }

  if (!canView) {
    return <div className="admin-panel"><p className="empty-state">You do not have permission to manage permissions.</p></div>
  }

  const modules = Object.keys(matrix || {})

  return (
    <div>
      <Toast notice={notice} error={error} onClear={() => { setNotice(''); setError('') }} />
      <div className="admin-toolbar">
        <div>
          <h3 style={{ margin: 0 }}>Manage Permissions</h3>
          <p className="sub" style={{ margin: '0.25rem 0 0' }}>Select a role, then enable only the permissions it needs.</p>
        </div>
      </div>

      <div className="admin-panel">
        {loading ? <div className="skeleton-row" /> : (
          <>
            <div className="field" style={{ marginBottom: '1rem', maxWidth: '20rem' }}>
              <label htmlFor="perm-role">Choose role</label>
              <select id="perm-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            {role ? (
              <form onSubmit={onSubmit}>
                {locked ? <p className="sub">This role is locked for your account or is a protected Super Admin role.</p> : null}
                {modules.map((moduleName) => (
                  <div className="perm-module" key={moduleName}>
                    <h4>{moduleName}</h4>
                    <div className="perm-list">
                      {(matrix[moduleName] || []).map((entry) => (
                        <label key={entry.key}>
                          <input
                            type="checkbox"
                            checked={selected.includes(entry.key)}
                            disabled={locked || busy || !held.includes(entry.key)}
                            onChange={() => toggle(entry.key)}
                          />
                          <span>
                            <strong>{entry.key}</strong>
                            <div className="sub">{entry.description}</div>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="field" style={{ maxWidth: '16rem', marginTop: '0.75rem' }}>
                  <label htmlFor="perm-scope">Data access scope</label>
                  <select id="perm-scope" value={scope} disabled={locked || busy} onChange={(e) => setScope(e.target.value)}>
                    <option value="OWN">Own</option>
                    <option value="TEAM">Team</option>
                    <option value="BRANCH">Branch</option>
                    <option value="COMPANY">Company</option>
                  </select>
                </div>
                {canEdit ? (
                  <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
                    <button type="submit" className="primary-btn" disabled={locked || busy}>
                      {busy ? 'Saving…' : 'Save permissions'}
                    </button>
                  </div>
                ) : null}
              </form>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
