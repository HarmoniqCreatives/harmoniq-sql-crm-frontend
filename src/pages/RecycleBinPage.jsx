import { useEffect, useState } from 'react'
import { listRecycleBin, readApiError, restoreRecycleBinItem } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, perm } from '../auth/permissions'
import { Toast } from '../components/Toast'

const TABS = [
  { id: 'leads', label: 'Leads' },
  { id: 'roles', label: 'Roles' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'meta_profiles', label: 'Meta profiles' },
  { id: 'email_reports', label: 'Email reports' },
]

function formatWhen(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

/**
 * Recycle Bin — soft-deleted records for Super Admin / Admin (recycle_bin.view|restore).
 * Backend enforces permissions and company isolation.
 */
export function RecycleBinPage() {
  const { user: viewer } = useAuth()
  const canView = hasPermission(viewer, perm.recycleBinView)
  const canRestore = hasPermission(viewer, perm.recycleBinRestore)

  const [entity, setEntity] = useState('leads')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function load(nextPage = page) {
    if (!canView) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = { entity }
      if (entity === 'leads') {
        params.page = nextPage
        params.limit = 20
      }
      const payload = await listRecycleBin(params)
      const data = payload.data || {}
      if (entity === 'leads') {
        setRows(data.leads || [])
        setTotal(Number(data.total) || 0)
        setPage(Number(data.page) || nextPage)
      } else if (entity === 'roles') {
        setRows(data.roles || [])
        setTotal((data.roles || []).length)
      } else if (entity === 'catalog') {
        setRows(data.items || [])
        setTotal((data.items || []).length)
      } else if (entity === 'meta_profiles') {
        setRows(data.profiles || [])
        setTotal((data.profiles || []).length)
      } else {
        setRows(data.reports || [])
        setTotal((data.reports || []).length)
      }
    } catch (loadError) {
      setError(readApiError(loadError))
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when tab changes
  }, [entity, canView])

  async function onRestore(row) {
    if (!canRestore || !row?.id) return
    const label = rowLabel(entity, row)
    if (!window.confirm(`Restore ${label}?`)) return
    setBusyId(row.id)
    setError('')
    try {
      const payload = await restoreRecycleBinItem(entity, row.id)
      setNotice(payload.data?.message || 'Restored.')
      await load(page)
    } catch (restoreError) {
      setError(readApiError(restoreError))
    } finally {
      setBusyId('')
    }
  }

  if (!canView) {
    return (
      <div className="admin-panel">
        <p className="empty-state">You do not have permission to view the Recycle Bin.</p>
      </div>
    )
  }

  const totalPages = entity === 'leads' ? Math.max(1, Math.ceil(total / 20)) : 1

  return (
    <div>
      <Toast notice={notice} error={error} onClear={() => { setNotice(''); setError('') }} />
      <div className="admin-toolbar">
        <div>
          <h3 className="page-heading">Recycle Bin</h3>
          <p className="sub" style={{ margin: '0.25rem 0 0' }}>
            Soft-deleted records for this company. Restore checks active unique-key conflicts.
          </p>
        </div>
      </div>

      <div className="admin-toolbar" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={entity === tab.id ? 'primary-btn' : 'ghost-btn'}
            onClick={() => setEntity(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="admin-panel">
        {loading ? (
          <>
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </>
        ) : rows.length === 0 ? (
          <p className="empty-state">No deleted {TABS.find((t) => t.id === entity)?.label.toLowerCase() || 'records'}.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Deleted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{rowLabel(entity, row)}</strong>
                      <div className="sub">{rowDetail(entity, row)}</div>
                    </td>
                    <td>{formatWhen(row.deletedAt)}</td>
                    <td>
                      {canRestore ? (
                        <button
                          type="button"
                          className="primary-btn"
                          disabled={busyId === row.id}
                          onClick={() => onRestore(row)}
                        >
                          {busyId === row.id ? 'Restoring…' : 'Restore'}
                        </button>
                      ) : (
                        <span className="sub">View only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entity === 'leads' && total > 20 ? (
          <div className="admin-toolbar" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="ghost-btn"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1)}
            >
              Previous
            </button>
            <span className="sub">Page {page} of {totalPages}</span>
            <button
              type="button"
              className="ghost-btn"
              disabled={page >= totalPages || loading}
              onClick={() => load(page + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function rowLabel(entity, row) {
  if (entity === 'leads') {
    return row.number || row.name || row.id
  }
  if (entity === 'roles') {
    return row.name || row.key || row.id
  }
  if (entity === 'catalog') {
    return row.name || row.key || row.id
  }
  if (entity === 'meta_profiles') {
    return row.label || row.id
  }
  return row.reportName || row.reportType || row.id
}

function rowDetail(entity, row) {
  if (entity === 'leads') {
    return [row.name, row.phone].filter(Boolean).join(' · ') || row.id
  }
  if (entity === 'roles') {
    return row.key || ''
  }
  if (entity === 'catalog') {
    return [row.kind, row.key].filter(Boolean).join(' · ')
  }
  if (entity === 'meta_profiles') {
    return row.mode || ''
  }
  return row.frequency || ''
}
