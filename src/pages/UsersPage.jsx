import { useCallback, useEffect, useState } from 'react'
import {
  activateUser,
  createAdminPasswordReset,
  createInvitation,
  createUser,
  deactivateUser,
  issueInvitationLink,
  listBranches,
  listInvitations,
  listRoles,
  listTeams,
  listUsers,
  readApiError,
  resendInvitation,
  revokeInvitation,
  updateInvitation,
  updateUser,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, perm } from '../auth/permissions'
import { PasswordInput } from '../components/PasswordInput'
import { Toast, copyText } from '../components/Toast'

/**
 * User directory + pending invitations admin page.
 *
 * Includes Add User, invitation PATCH editing, admin password-reset link copy,
 * and invite copy/resend/revoke. Permission checks are UX-only; APIs enforce access.
 */

function statusClass(status) {
  const value = String(status || '').toLowerCase()
  if (value.includes('active') || value === 'sent' || value === 'accepted') return `badge is-${value}`
  if (value.includes('pending') || value === 'failed') return `badge is-${value}`
  return `badge is-${value || 'pending'}`
}

export function UsersPage() {
  const { user: viewer } = useAuth()
  const canView = hasPermission(viewer, perm.usersView)
  const canCreate = hasPermission(viewer, perm.usersCreate)
  const canEdit = hasPermission(viewer, perm.usersEdit)
  const canDelete = hasPermission(viewer, perm.usersDelete)
  const canInvite = hasPermission(viewer, perm.usersInvite)

  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [roleId, setRoleId] = useState('')
  const [status, setStatus] = useState('')
  const [branchId, setBranchId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [sort, setSort] = useState('name')
  const [direction, setDirection] = useState('asc')
  const [roles, setRoles] = useState([])
  const [branches, setBranches] = useState([])
  const [teams, setTeams] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [editInvite, setEditInvite] = useState(null)
  const [busyId, setBusyId] = useState('')

  const loadDirectory = useCallback(async () => {
    if (!canView) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const payload = await listUsers({
        page,
        limit: 20,
        search,
        roleId,
        status,
        branchId,
        teamId,
        sort,
        direction,
      })
      setUsers(payload.data.users || [])
      setTotal(payload.data.total || 0)
    } catch (loadError) {
      setError(readApiError(loadError))
    } finally {
      setLoading(false)
    }
  }, [canView, page, search, roleId, status, branchId, teamId, sort, direction])

  const loadMeta = useCallback(async () => {
    try {
      const [rolePayload, branchPayload, teamPayload] = await Promise.all([
        listRoles().catch(() => ({ data: { roles: [] } })),
        listBranches().catch(() => ({ data: { branches: [] } })),
        listTeams(branchId ? { branchId } : {}).catch(() => ({ data: { teams: [] } })),
      ])
      setRoles(rolePayload.data.roles || [])
      setBranches(branchPayload.data.branches || [])
      setTeams(teamPayload.data.teams || [])
      if (canInvite) {
        const invites = await listInvitations()
        setInvitations(invites.data.invitations || [])
      }
    } catch (metaError) {
      setError(readApiError(metaError))
    }
  }, [branchId, canInvite])

  useEffect(() => {
    loadDirectory()
  }, [loadDirectory])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  async function onCopyLink(invitation) {
    setBusyId(invitation.id)
    setError('')
    try {
      const payload = await issueInvitationLink(invitation.id)
      const link = payload.data.link || payload.data.invitationUrl
      await copyText(link)
      setNotice('Link copied')
      await loadMeta()
    } catch (copyError) {
      setError(readApiError(copyError))
    } finally {
      setBusyId('')
    }
  }

  async function onResend(invitation) {
    setBusyId(invitation.id)
    try {
      const payload = await resendInvitation(invitation.id)
      setNotice(payload.data.message)
      await loadMeta()
    } catch (resendError) {
      setError(readApiError(resendError))
    } finally {
      setBusyId('')
    }
  }

  async function onRevoke(invitation) {
    if (!window.confirm('Revoke this invitation?')) {
      return
    }
    setBusyId(invitation.id)
    try {
      const payload = await revokeInvitation(invitation.id)
      setNotice(payload.data.message)
      await loadMeta()
    } catch (revokeError) {
      setError(readApiError(revokeError))
    } finally {
      setBusyId('')
    }
  }

  async function onToggleActive(row) {
    const active = String(row.status).toUpperCase() === 'ACTIVE'
    if (active && !window.confirm(`Deactivate ${row.name}?`)) {
      return
    }
    setBusyId(row.id)
    try {
      const payload = active ? await deactivateUser(row.id) : await activateUser(row.id)
      setNotice(payload.data.message)
      await loadDirectory()
    } catch (toggleError) {
      setError(readApiError(toggleError))
    } finally {
      setBusyId('')
    }
  }

  if (!canView) {
    return <div className="admin-panel"><p className="empty-state">You do not have permission to view users.</p></div>
  }

  const pageCount = Math.max(1, Math.ceil(total / 20))
  const assignableRoles = roles.filter((role) => !role.isProtected)

  return (
    <div>
      <Toast notice={notice} error={error} onClear={() => { setNotice(''); setError('') }} />
      <div className="admin-toolbar">
        <div className="field">
          <label htmlFor="search">Search</label>
          <input id="search" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value) }} placeholder="Name, email, mobile" />
        </div>
        <div className="field">
          <label htmlFor="roleId">Role</label>
          <select id="roleId" value={roleId} onChange={(e) => { setPage(1); setRoleId(e.target.value) }}>
            <option value="">All roles</option>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value) }}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="branchId">Branch</label>
          <select id="branchId" value={branchId} onChange={(e) => { setPage(1); setBranchId(e.target.value); setTeamId('') }}>
            <option value="">All branches</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="teamId">Team</label>
          <select id="teamId" value={teamId} onChange={(e) => { setPage(1); setTeamId(e.target.value) }}>
            <option value="">All teams</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Sort</label>
          <select id="sort" value={`${sort}:${direction}`} onChange={(e) => {
            const [nextSort, nextDirection] = e.target.value.split(':')
            setSort(nextSort)
            setDirection(nextDirection)
          }}>
            <option value="name:asc">Name A–Z</option>
            <option value="name:desc">Name Z–A</option>
            <option value="createdAt:desc">Newest</option>
            <option value="createdAt:asc">Oldest</option>
            <option value="status:asc">Status</option>
          </select>
        </div>
        {canCreate ? (
          <button type="button" className="primary-btn" onClick={() => setAddOpen(true)}>Add user</button>
        ) : null}
        {canInvite ? (
          <button type="button" className="ghost-btn" onClick={() => setInviteOpen(true)}>Invite user</button>
        ) : null}
      </div>

      <div className="admin-panel">
        {loading ? (
          <>
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </>
        ) : users.length === 0 ? (
          <p className="empty-state">No users match these filters.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Branch / Team</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      <div className="sub">{row.phone || '—'}</div>
                    </td>
                    <td>{row.email}</td>
                    <td>{row.role?.name || '—'}</td>
                    <td>{[row.branch?.name, row.team?.name].filter(Boolean).join(' / ') || '—'}</td>
                    <td><span className={statusClass(row.status)}>{row.status}</span></td>
                    <td>{row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '—'}</td>
                    <td>
                      <div className="icon-actions">
                        {canEdit ? (
                          <button type="button" className="icon-btn" title="Edit user" onClick={() => setEditUser(row)}>Edit</button>
                        ) : null}
                        {canDelete || canEdit ? (
                          <button
                            type="button"
                            className="icon-btn"
                            title={row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            disabled={busyId === row.id || row.isInitialSuperAdmin}
                            onClick={() => onToggleActive(row)}
                          >
                            {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager">
          <span className="sub">{total} users</span>
          <div className="icon-actions">
            <button type="button" className="ghost-btn" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span className="sub">Page {page} / {pageCount}</span>
            <button type="button" className="ghost-btn" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>
      </div>

      {canInvite ? (
        <div className="admin-panel" style={{ marginTop: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Pending invitations</h3>
          {invitations.filter((row) => row.status === 'PENDING').length === 0 ? (
            <p className="empty-state">No pending invitations.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Expires</th>
                    <th>Email status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.filter((row) => row.status === 'PENDING').map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.email}</td>
                      <td>{row.role?.name || '—'}</td>
                      <td>{new Date(row.expiresAt).toLocaleString()}</td>
                      <td>
                        <span className={statusClass(row.emailDelivery || 'pending')}>{row.emailDelivery || 'pending'}</span>
                        {row.emailError ? <div className="sub">{row.emailError}</div> : null}
                      </td>
                      <td>
                        <div className="icon-actions">
                          <button type="button" className="icon-btn" title="Edit invitation" disabled={busyId === row.id} onClick={() => setEditInvite(row)}>Edit</button>
                          <button type="button" className="icon-btn" title="Copy invite link" disabled={busyId === row.id} onClick={() => onCopyLink(row)}>Copy link</button>
                          <button type="button" className="icon-btn" title="Resend invitation" disabled={busyId === row.id} onClick={() => onResend(row)}>Resend</button>
                          <button type="button" className="danger-btn" title="Revoke invitation" disabled={busyId === row.id} onClick={() => onRevoke(row)}>Revoke</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {addOpen ? (
        <AddUserModal
          roles={assignableRoles}
          branches={branches}
          teams={teams}
          onClose={() => setAddOpen(false)}
          onSaved={async (message) => {
            setAddOpen(false)
            setNotice(message)
            await loadDirectory()
          }}
          onError={setError}
        />
      ) : null}

      {inviteOpen ? (
        <InviteModal
          roles={assignableRoles}
          branches={branches}
          teams={teams}
          onClose={() => setInviteOpen(false)}
          onSaved={async (message) => {
            setInviteOpen(false)
            setNotice(message)
            await loadMeta()
          }}
          onError={setError}
        />
      ) : null}

      {editUser ? (
        <EditUserModal
          user={editUser}
          roles={roles}
          branches={branches}
          teams={teams}
          canReset={canEdit}
          onClose={() => setEditUser(null)}
          onSaved={async (message) => {
            setEditUser(null)
            setNotice(message)
            await loadDirectory()
          }}
          onNotice={setNotice}
          onError={setError}
        />
      ) : null}

      {editInvite ? (
        <EditInviteModal
          invitation={editInvite}
          roles={assignableRoles}
          branches={branches}
          teams={teams}
          onClose={() => setEditInvite(null)}
          onSaved={async (message) => {
            setEditInvite(null)
            setNotice(message)
            await loadMeta()
          }}
          onError={setError}
        />
      ) : null}
    </div>
  )
}

function AddUserModal({ roles, branches, teams, onClose, onSaved, onError }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState(roles.find((role) => role.key === 'agent')?.id || roles[0]?.id || '')
  const [branchId, setBranchId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const payload = await createUser({
        name,
        email,
        phone: phone || undefined,
        password,
        roleId,
        branchId: branchId || undefined,
        teamId: teamId || undefined,
      })
      await onSaved(payload.data.message)
    } catch (submitError) {
      onError(readApiError(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3>Add user</h3>
        <p className="sub">Create an active account with a temporary password.</p>
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="addName">Name</label>
            <input id="addName" value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="addEmail">Email</label>
            <input id="addEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="addPhone">Mobile</label>
            <input id="addPhone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} placeholder="+9198…" />
          </div>
          <div className="field">
            <label htmlFor="addPassword">Password</label>
            <PasswordInput id="addPassword" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="addRole">Role</label>
            <select id="addRole" value={roleId} onChange={(e) => setRoleId(e.target.value)} required disabled={busy}>
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </div>
          <div className="form-grid two" style={{ margin: 0 }}>
            <div className="field">
              <label htmlFor="addBranch">Branch</label>
              <select id="addBranch" value={branchId} onChange={(e) => { setBranchId(e.target.value); setTeamId('') }} disabled={busy}>
                <option value="">None</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="addTeam">Team</label>
              <select id="addTeam" value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={busy}>
                <option value="">None</option>
                {teams.filter((team) => !branchId || team.branchId === branchId).map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InviteModal({ roles, branches, teams, onClose, onSaved, onError }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState(roles.find((role) => role.key === 'agent')?.id || '')
  const [branchId, setBranchId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const payload = await createInvitation({
        name,
        email,
        roleId,
        branchId: branchId || undefined,
        teamId: teamId || undefined,
      })
      await onSaved(payload.data.message)
    } catch (submitError) {
      onError(readApiError(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3>Invite user</h3>
        <p className="sub">They will receive an email or you can copy the invite link.</p>
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="inviteName">Name</label>
            <input id="inviteName" value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="inviteEmail">Email</label>
            <input id="inviteEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="inviteRole">Role</label>
            <select id="inviteRole" value={roleId} onChange={(e) => setRoleId(e.target.value)} required disabled={busy}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
          <div className="form-grid two" style={{ margin: 0 }}>
            <div className="field">
              <label htmlFor="inviteBranch">Branch</label>
              <select id="inviteBranch" value={branchId} onChange={(e) => { setBranchId(e.target.value); setTeamId('') }} disabled={busy}>
                <option value="">None</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="inviteTeam">Team</label>
              <select id="inviteTeam" value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={busy}>
                <option value="">None</option>
                {teams.filter((team) => !branchId || team.branchId === branchId).map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditInviteModal({ invitation, roles, branches, teams, onClose, onSaved, onError }) {
  const [name, setName] = useState(invitation.name)
  const [email, setEmail] = useState(invitation.email)
  const [roleId, setRoleId] = useState(invitation.role?.id || '')
  const [branchId, setBranchId] = useState(invitation.branch?.id || '')
  const [teamId, setTeamId] = useState(invitation.team?.id || '')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const payload = await updateInvitation(invitation.id, {
        name,
        email,
        roleId,
        branchId: branchId || null,
        teamId: teamId || null,
      })
      await onSaved(payload.data.message)
    } catch (submitError) {
      onError(readApiError(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3>Edit invitation</h3>
        <p className="sub">Pending invites can be corrected without rotating the token.</p>
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="editInviteName">Name</label>
            <input id="editInviteName" value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="editInviteEmail">Email</label>
            <input id="editInviteEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="editInviteRole">Role</label>
            <select id="editInviteRole" value={roleId} onChange={(e) => setRoleId(e.target.value)} required disabled={busy}>
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </div>
          <div className="form-grid two" style={{ margin: 0 }}>
            <div className="field">
              <label htmlFor="editInviteBranch">Branch</label>
              <select id="editInviteBranch" value={branchId} onChange={(e) => { setBranchId(e.target.value); setTeamId('') }} disabled={busy}>
                <option value="">None</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="editInviteTeam">Team</label>
              <select id="editInviteTeam" value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={busy}>
                <option value="">None</option>
                {teams.filter((team) => !branchId || team.branchId === branchId).map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditUserModal({ user, roles, branches, teams, canReset, onClose, onSaved, onNotice, onError }) {
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone || '')
  const [roleId, setRoleId] = useState(user.role?.id || '')
  const [branchId, setBranchId] = useState(user.branch?.id || '')
  const [teamId, setTeamId] = useState(user.team?.id || '')
  const [busy, setBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const payload = await updateUser(user.id, {
        name,
        phone,
        roleId,
        branchId: branchId || null,
        teamId: teamId || null,
      })
      await onSaved(payload.data.message)
    } catch (submitError) {
      onError(readApiError(submitError))
    } finally {
      setBusy(false)
    }
  }

  async function onPasswordReset() {
    setResetBusy(true)
    try {
      const payload = await createAdminPasswordReset(user.id)
      const resetUrl = payload.data.resetUrl
      try {
        await copyText(resetUrl)
        onNotice(`${payload.data.message} Link copied.`)
      } catch {
        onNotice(`${payload.data.message} ${resetUrl}`)
      }
    } catch (resetError) {
      onError(readApiError(resetError))
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3>Edit user</h3>
        <p className="sub">{user.email}</p>
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="editName">Name</label>
            <input id="editName" value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="editPhone">Mobile</label>
            <input id="editPhone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor="editRole">Role</label>
            <select id="editRole" value={roleId} onChange={(e) => setRoleId(e.target.value)} required disabled={busy || user.isInitialSuperAdmin}>
              {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </div>
          <div className="form-grid two" style={{ margin: 0 }}>
            <div className="field">
              <label htmlFor="editBranch">Branch</label>
              <select id="editBranch" value={branchId} onChange={(e) => { setBranchId(e.target.value); setTeamId('') }} disabled={busy}>
                <option value="">None</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="editTeam">Team</label>
              <select id="editTeam" value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={busy}>
                <option value="">None</option>
                {teams.filter((team) => !branchId || team.branchId === branchId).map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          </div>
          {canReset && user.status === 'ACTIVE' ? (
            <button type="button" className="ghost-btn" disabled={resetBusy || busy} onClick={onPasswordReset}>
              {resetBusy ? 'Preparing reset…' : 'Reset password'}
            </button>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
