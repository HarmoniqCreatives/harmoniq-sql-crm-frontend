import { useEffect, useState } from 'react'
import {
  exportLeads,
  listCatalog,
  listLeadPageTypes,
  listUsers,
  readApiError,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, perm } from '../auth/permissions'
import { Toast } from '../components/Toast'

function toInputDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultRange() {
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth(), 1)
  return { startDate: toInputDate(start), endDate: toInputDate(end) }
}

function filenameFromDisposition(header, fallback) {
  if (!header) return fallback
  const match = String(header).match(/filename="?([^"]+)"?/i)
  return match ? match[1] : fallback
}

/**
 * Lead Report download page — filters + CSV/Excel export (all matching rows).
 */
export function ReportsPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, perm.reportsView) || hasPermission(user, perm.leadsView)
  const canExport = hasPermission(user, perm.leadsBulk)

  const defaults = defaultRange()
  const [startDate, setStartDate] = useState(defaults.startDate)
  const [endDate, setEndDate] = useState(defaults.endDate)
  const [pageType, setPageType] = useState('')
  const [agentId, setAgentId] = useState('')
  const [statusId, setStatusId] = useState('')
  const [pageTypes, setPageTypes] = useState([])
  const [agents, setAgents] = useState([])
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!canView) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const [pagesPayload, usersPayload, statusPayload] = await Promise.all([
          listLeadPageTypes().catch(() => ({ data: { pageTypes: [] } })),
          listUsers({ status: 'ACTIVE', limit: 100 }).catch(() => ({ data: { users: [] } })),
          listCatalog({ kind: 'STATUS' }),
        ])
        if (!active) return
        setPageTypes(pagesPayload.data?.pageTypes || [])
        setAgents((usersPayload.data?.users || []).filter((row) => row.status === 'ACTIVE'))
        setStatuses(statusPayload.data?.items || [])
      } catch (loadError) {
        if (active) setError(readApiError(loadError))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [canView])

  function buildParams(format) {
    const params = {
      format,
      startDate,
      endDate,
    }
    if (pageType) params.pageType = pageType
    if (agentId) params.agentId = agentId
    if (statusId) params.statusId = statusId
    return params
  }

  async function download(format) {
    if (!canExport) {
      setError('You do not have permission to download reports.')
      return
    }
    if (!startDate || !endDate) {
      setError('Choose a start and end date.')
      return
    }
    setBusy(format)
    setError('')
    setNotice('')
    try {
      const response = await exportLeads(buildParams(format))
      const blob = response.data
      const fallback = `Lead_Report_${startDate}_to_${endDate}.${format === 'xlsx' ? 'xlsx' : 'csv'}`
      const filename = filenameFromDisposition(response.headers?.['content-disposition'], fallback)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      setNotice(`Lead report downloaded (${format.toUpperCase()}).`)
    } catch (downloadError) {
      setError(readApiError(downloadError))
    } finally {
      setBusy('')
    }
  }

  if (!canView) {
    return (
      <div className="admin-panel">
        <p className="empty-state">You do not have permission to view reports.</p>
      </div>
    )
  }

  return (
    <div>
      <Toast notice={notice} error={error} onClear={() => { setNotice(''); setError('') }} />
      <div className="admin-toolbar">
        <div>
          <h3 className="page-heading">Lead Report export</h3>
          <p className="sub" style={{ margin: '0.25rem 0 0' }}>
            Download Lead Reports with date, page type, agent and status filters. Exports include every matching lead.
          </p>
        </div>
      </div>

      <div className="admin-panel">
        <h3 className="card-heading">Filters & download</h3>
        {loading ? (
          <>
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </>
        ) : (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault()
              download('csv')
            }}
          >
            <div className="field">
              <label htmlFor="report-start">Start date</label>
              <input
                id="report-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="report-end">End date</label>
              <input
                id="report-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="report-page-type">Page Type</label>
              <select id="report-page-type" value={pageType} onChange={(e) => setPageType(e.target.value)}>
                <option value="">All page types</option>
                {pageTypes.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="report-agent">Assigned agent</label>
              <select id="report-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">All agents</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="report-status">Lead status</label>
              <select id="report-status" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                <option value="">All statuses</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>{status.name}</option>
                ))}
              </select>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
              <button type="submit" className="primary-btn" disabled={!canExport || Boolean(busy)}>
                {busy === 'csv' ? 'Preparing…' : 'Download CSV'}
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={!canExport || Boolean(busy)}
                onClick={() => download('xlsx')}
              >
                {busy === 'xlsx' ? 'Preparing…' : 'Download Excel'}
              </button>
            </div>
            {!canExport ? (
              <p className="sub">You can view this page, but download requires export permission.</p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  )
}
