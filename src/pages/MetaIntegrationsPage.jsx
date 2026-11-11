import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, readApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, perm } from '../auth/permissions'
import { PasswordInput } from '../components/PasswordInput'
import {
  isMetaPageSyncing,
  startMetaPageSync,
  subscribeMetaPageSync,
} from '../utils/metaPageSync'
import { MetaActionIcon } from './meta/MetaActionIcon'
import { metaCopy as copy } from './meta/metaCopy'

const LIST_LIMIT = 10

function formatSyncTime(value) {
  if (!value) return copy.neverSynced
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return copy.neverSynced
  return date.toLocaleString()
}

function statusLabel(status) {
  if (status === 'connected') return copy.statusConnected
  if (status === 'disconnected') return copy.statusDisconnected
  if (status === 'expired') return copy.statusExpired
  if (status === 'inaccessible') return copy.statusInaccessible
  return status || '—'
}

function pageRange(page, limit, total) {
  if (!total) return '0 of 0'
  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  return `${start}–${end} of ${total}`
}

function readOAuthNotice(searchParams) {
  const result = searchParams.get('meta')
  if (result === 'connected') return copy.oauthConnected
  if (result === 'cancelled') return copy.oauthCancelled
  if (result === 'error' || result === 'failed') return copy.oauthFailed
  if (result === 'mismatch') return copy.oauthMismatch
  if (result === 'taken') return copy.oauthTaken
  return ''
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z"
      />
    </svg>
  )
}

/**
 * Meta Integration — SaaS layout. Preserves existing Harmoniq Meta APIs,
 * OAuth, Page connect, sync, and Phase 4 aggregate counts.
 */
export function MetaIntegrationsPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const canView = hasPermission(user, perm.metaView)
  const canManage = hasPermission(user, perm.metaManage)
  const canPages = hasPermission(user, perm.metaPagesManage)

  const [profiles, setProfiles] = useState([])
  const [connections, setConnections] = useState([])
  const [pages, setPages] = useState([])
  const [pagesTotal, setPagesTotal] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [leadCounts, setLeadCounts] = useState({ imported: 0, skipped: 0, pages: {} })
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeSyncs, setActiveSyncs] = useState([])

  const [profileModal, setProfileModal] = useState(null)
  const [label, setLabel] = useState('')
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const [selectedPageIds, setSelectedPageIds] = useState([])
  const [pagesModal, setPagesModal] = useState(null)
  const [availablePages, setAvailablePages] = useState([])
  const [availableSelected, setAvailableSelected] = useState([])
  const [availableLoading, setAvailableLoading] = useState(false)
  const [availableError, setAvailableError] = useState('')

  const [confirmDisconnectPages, setConfirmDisconnectPages] = useState(false)
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState(null)
  const [confirmDisconnectAccount, setConfirmDisconnectAccount] = useState(null)
  const [confirmDisconnectPage, setConfirmDisconnectPage] = useState(null)
  const [assetPanel, setAssetPanel] = useState(null)

  const syncByPage = useMemo(
    () => new Map(activeSyncs.map((row) => [row.pageId, row])),
    [activeSyncs],
  )

  const load = useCallback(async (nextPageNumber) => {
    if (!canView) {
      setLoading(false)
      return
    }
    const pageValue = nextPageNumber || pageNumber
    setLoading(true)
    setError('')
    try {
      const [profilesRes, connectionsRes, pagesRes, countsRes] = await Promise.all([
        api.get('/meta/profiles'),
        api.get('/meta/connections'),
        api.get('/meta/pages', { params: { limit: LIST_LIMIT, page: pageValue } }),
        api.get('/meta/lead-counts'),
      ])
      const nextPages = pagesRes.data?.data?.pages || []
      setProfiles(profilesRes.data?.data?.profiles || [])
      setConnections(connectionsRes.data?.data?.connections || [])
      setPages(nextPages)
      setPagesTotal(pagesRes.data?.data?.pagination?.total || nextPages.length)
      setPageNumber(pagesRes.data?.data?.pagination?.page || pageValue)
      const counts = countsRes.data?.data || { imported: 0, skipped: 0, pages: {} }
      setLeadCounts({
        imported: counts.imported || 0,
        skipped: counts.skipped || 0,
        pages: counts.pages || {},
      })

      for (const page of nextPages) {
        const job = page.latestSyncJob
        if (
          job
          && (job.status === 'pending' || job.status === 'processing')
          && !isMetaPageSyncing(page.id)
        ) {
          startMetaPageSync({
            pageId: page.id,
            pageName: page.name,
            jobId: job.id,
            onFinished: () => { load(pageValue) },
          })
        }
      }
    } catch (err) {
      setError(readApiError(err))
    } finally {
      setLoading(false)
    }
  }, [canView, pageNumber])

  useEffect(() => {
    const oauthNotice = readOAuthNotice(searchParams)
    if (oauthNotice) {
      setNotice(oauthNotice)
      const next = new URLSearchParams(searchParams)
      next.delete('meta')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    load(1)
  }, [canView]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => subscribeMetaPageSync((rows) => {
    setActiveSyncs(rows)
  }), [])

  function openCreateProfile() {
    setProfileModal({ mode: 'create' })
    setLabel('')
    setAppId('')
    setAppSecret('')
    setFieldErrors({})
  }

  function openEditProfile(profile) {
    setProfileModal({ mode: 'edit', profile })
    setLabel(profile.label || '')
    setAppId(profile.appId || '')
    setAppSecret('')
    setFieldErrors({})
  }

  function closeProfileModal() {
    setProfileModal(null)
    setLabel('')
    setAppId('')
    setAppSecret('')
    setFieldErrors({})
  }

  async function saveProfile(event) {
    event.preventDefault()
    if (!canManage) {
      setError(copy.manageRequired)
      return
    }
    const isEdit = profileModal?.mode === 'edit'
    const nextErrors = {}
    if (!label.trim()) nextErrors.label = copy.fieldLabel
    if (!appId.trim()) nextErrors.appId = copy.fieldAppId
    if (!isEdit && !appSecret.trim()) nextErrors.appSecret = copy.fieldAppSecret
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setBusyKey('save-profile')
    setError('')
    setNotice('')
    try {
      if (isEdit) {
        const payload = {
          label: label.trim(),
          appId: appId.trim(),
        }
        if (appSecret.trim()) payload.appSecret = appSecret.trim()
        await api.patch(`/meta/profiles/${profileModal.profile.id}`, payload)
        setNotice('App profile updated.')
      } else {
        await api.post('/meta/profiles', {
          mode: 'customer',
          label: label.trim(),
          appId: appId.trim(),
          appSecret: appSecret.trim(),
        })
        setNotice('App profile saved.')
      }
      closeProfileModal()
      await load(pageNumber)
    } catch (err) {
      setError(readApiError(err))
    } finally {
      setBusyKey('')
    }
  }

  async function connectFacebook(profile) {
    if (!canManage) {
      setError(copy.manageRequired)
      return
    }
    setBusyKey(`oauth-${profile.id}`)
    setError('')
    try {
      const response = await api.post('/meta/oauth/start', { profileId: profile.id })
      const url = response.data?.data?.url
      if (!url) throw new Error('Facebook Login URL was empty.')
      window.location.assign(url)
    } catch (err) {
      setError(readApiError(err))
      setBusyKey('')
    }
  }

  function primaryConnectFacebook() {
    if (!canManage) {
      setError(copy.manageRequired)
      return
    }
    if (profiles.length === 0) {
      openCreateProfile()
      return
    }
    const preferred = profiles.find((row) => row.isActive) || profiles[0]
    connectFacebook(preferred)
  }

  async function disconnectAccount(connection) {
    setBusyKey(`disconnect-account-${connection.id}`)
    setError('')
    try {
      await api.post(`/meta/connections/${connection.id}/disconnect`)
      setNotice('Facebook account disconnected.')
      setConfirmDisconnectAccount(null)
      await load(pageNumber)
    } catch (err) {
      setError(readApiError(err))
    } finally {
      setBusyKey('')
    }
  }

  async function deleteProfile(profile) {
    setBusyKey(`delete-profile-${profile.id}`)
    setError('')
    try {
      await api.delete(`/meta/profiles/${profile.id}`)
      setNotice('App profile removed.')
      setConfirmDeleteProfile(null)
      await load(pageNumber)
    } catch (err) {
      setError(readApiError(err))
    } finally {
      setBusyKey('')
    }
  }

  async function openPagesModal(connection) {
    if (!canPages) {
      setError(copy.pagesManageRequired)
      return
    }
    setPagesModal(connection)
    setAvailableSelected([])
    setAvailableError('')
    setAvailableLoading(true)
    try {
      const response = await api.get(`/meta/connections/${connection.id}/available-pages`)
      setAvailablePages(response.data?.data?.pages || [])
    } catch (err) {
      setAvailablePages([])
      setAvailableError(readApiError(err))
    } finally {
      setAvailableLoading(false)
    }
  }

  function toggleAvailable(pageId) {
    setAvailableSelected((current) => (
      current.includes(pageId)
        ? current.filter((id) => id !== pageId)
        : [...current, pageId]
    ))
  }

  function selectAllAvailable() {
    setAvailableSelected(availablePages.map((item) => item.pageId || item.id))
  }

  function clearAvailableSelection() {
    setAvailableSelected([])
  }

  async function addSelectedPages() {
    if (!pagesModal || availableSelected.length === 0) return
    setBusyKey('add-pages')
    setAvailableError('')
    setNotice('')
    try {
      const response = await api.post(`/meta/connections/${pagesModal.id}/pages`, {
        pageIds: availableSelected,
      })
      const results = response.data?.data?.results || []
      const added = results.filter((row) => row.status === 'added')
      const failed = results.filter((row) => row.status === 'failed')
      setNotice(`${added.length} page(s) connected${failed.length ? `, ${failed.length} failed` : ''}.`)
      for (const row of added) {
        if (row.initialSyncStarted && row.syncJob && row.page) {
          startMetaPageSync({
            pageId: row.page.id,
            pageName: row.page.name,
            jobId: row.syncJob.id,
            startedMessage: copy.initialSyncStarted,
            onFinished: () => { load(pageNumber) },
          })
        } else if (row.syncEnqueueError) {
          setNotice(copy.enqueueFailed)
        }
      }
      setPagesModal(null)
      await load(pageNumber)
    } catch (err) {
      setAvailableError(readApiError(err))
    } finally {
      setBusyKey('')
    }
  }

  function togglePage(id) {
    if (!canPages) return
    setSelectedPageIds((current) => (
      current.includes(id) ? current.filter((row) => row !== id) : [...current, id]
    ))
  }

  function toggleAllPages() {
    if (!canPages) return
    const ids = pages.map((row) => row.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedPageIds.includes(id))
    if (allSelected) {
      setSelectedPageIds((current) => current.filter((id) => !ids.includes(id)))
      return
    }
    setSelectedPageIds((current) => [...new Set([...current, ...ids])])
  }

  async function onSync(page) {
    if (!canPages || isMetaPageSyncing(page.id) || page.status !== 'connected') return
    await startMetaPageSync({
      pageId: page.id,
      pageName: page.name,
      onFinished: () => { load(pageNumber) },
    })
    await load(pageNumber)
  }

  async function disconnectPage(page) {
    if (!canPages) return
    setBusyKey(`disconnect-page-${page.id}`)
    setError('')
    try {
      await api.post(`/meta/pages/${page.id}/disconnect`)
      setNotice(`${page.name} disconnected.`)
      setSelectedPageIds((current) => current.filter((id) => id !== page.id))
      setConfirmDisconnectPage(null)
      await load(pageNumber)
    } catch (err) {
      setError(readApiError(err))
    } finally {
      setBusyKey('')
    }
  }

  async function runBulkSync() {
    if (!canPages || selectedPageIds.length === 0) return
    setBusyKey('bulk-sync')
    setError('')
    try {
      const selected = pages.filter((row) => selectedPageIds.includes(row.id) && row.status === 'connected')
      for (const page of selected) {
        if (!isMetaPageSyncing(page.id)) {
          startMetaPageSync({
            pageId: page.id,
            pageName: page.name,
            onFinished: () => { load(pageNumber) },
          })
        }
      }
      setNotice(`Started sync for ${selected.length} page(s).`)
    } finally {
      setBusyKey('')
    }
  }

  async function confirmBulkDisconnect() {
    if (!canPages || selectedPageIds.length === 0) return
    setBusyKey('bulk-disconnect')
    setError('')
    try {
      for (const id of selectedPageIds) {
        await api.post(`/meta/pages/${id}/disconnect`)
      }
      setNotice(`Disconnected ${selectedPageIds.length} page(s).`)
      setSelectedPageIds([])
      setConfirmDisconnectPages(false)
      await load(pageNumber)
    } catch (err) {
      setError(readApiError(err))
    } finally {
      setBusyKey('')
    }
  }

  const allSelected = pages.length > 0 && pages.every((row) => selectedPageIds.includes(row.id))
  const pageHasPrevious = pageNumber > 1
  const pageHasNext = pageNumber * LIST_LIMIT < pagesTotal
  const expiredConnections = connections.filter((row) => row.status === 'expired')
  const connectedAccounts = connections.filter((row) => row.status === 'connected').length
  const connectedPagesCount = pages.filter((row) => row.status === 'connected').length
  const hasProfile = profiles.length > 0
  const hasConnection = connections.some((row) => row.status === 'connected' || row.status === 'expired')
  const hasPages = pagesTotal > 0
  const anySyncing = activeSyncs.length > 0

  const journey = [
    { key: 'profile', label: copy.step1, done: hasProfile, current: !hasProfile },
    { key: 'account', label: copy.step2, done: hasConnection, current: hasProfile && !hasConnection },
    { key: 'pages', label: copy.step3, done: hasPages, current: hasConnection && !hasPages },
    { key: 'sync', label: copy.step4, done: leadCounts.imported > 0 || anySyncing, current: hasPages },
  ]

  if (!canView) {
    return (
      <section className="admin-page meta-page">
        <header className="meta-hero">
          <div className="meta-hero-copy">
            <p className="meta-hero-eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
          </div>
        </header>
        <p className="admin-muted">{copy.noPermission}</p>
      </section>
    )
  }

  return (
    <section className="admin-page meta-page">
      {/* Section 1 — Header */}
      <header className="meta-hero">
        <div className="meta-hero-copy">
          <p className="meta-hero-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="meta-hero-sub">{copy.subtitle}</p>
        </div>
        <div className="meta-hero-actions">
          <button
            type="button"
            className="meta-btn-secondary"
            onClick={() => load(pageNumber)}
            disabled={loading || Boolean(busyKey)}
          >
            <MetaActionIcon name="refresh" />
            {copy.refresh}
          </button>
          {canManage ? (
            <button
              type="button"
              className="meta-btn-primary"
              onClick={primaryConnectFacebook}
              disabled={Boolean(busyKey)}
            >
              <FacebookMark />
              {copy.connectFacebook}
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      {notice ? <p className="admin-alert" role="status">{notice}</p> : null}
      {expiredConnections.length > 0 ? (
        <div className="admin-alert" role="status">
          {copy.reconnectHint}
        </div>
      ) : null}

      <nav className="meta-journey" aria-label="Setup steps">
        {journey.map((step, index) => (
          <div
            key={step.key}
            className={`meta-journey-step${step.done ? ' done' : ''}${step.current && !step.done ? ' current' : ''}`}
          >
            <span className="meta-journey-num">{step.done ? '✓' : index + 1}</span>
            <span className="meta-journey-label">{step.label}</span>
          </div>
        ))}
      </nav>

      {/* Section 2 — Overview */}
      <div className="meta-overview">
        <article className="meta-stat-card">
          <div className="meta-stat-icon" aria-hidden="true"><MetaActionIcon name="accounts" /></div>
          <div className="meta-stat-body">
            <p className="meta-stat-value">{loading ? '—' : connectedAccounts}</p>
            <p className="meta-stat-label">{copy.overviewAccounts}</p>
          </div>
        </article>
        <article className="meta-stat-card">
          <div className="meta-stat-icon gold" aria-hidden="true"><MetaActionIcon name="pages" /></div>
          <div className="meta-stat-body">
            <p className="meta-stat-value">{loading ? '—' : pagesTotal}</p>
            <p className="meta-stat-label">{copy.overviewPages}</p>
          </div>
        </article>
        <article className="meta-stat-card">
          <div className="meta-stat-icon green" aria-hidden="true"><MetaActionIcon name="check" /></div>
          <div className="meta-stat-body">
            <p className="meta-stat-value">{loading ? '—' : leadCounts.imported}</p>
            <p className="meta-stat-label">{copy.overviewImported}</p>
          </div>
        </article>
        <article className="meta-stat-card">
          <div className="meta-stat-icon muted" aria-hidden="true"><MetaActionIcon name="forms" /></div>
          <div className="meta-stat-body">
            <p className="meta-stat-value">{loading ? '—' : leadCounts.skipped}</p>
            <p className="meta-stat-label">{copy.overviewSkipped}</p>
          </div>
        </article>
      </div>

      {/* Section 3 — App Profiles */}
      <section className="meta-panel">
        <div className="meta-panel-head">
          <div>
            <h2>{copy.profilesTitle}</h2>
            <p className="meta-panel-hint">{copy.profilesHint}</p>
          </div>
          <div className="meta-panel-actions">
            {canManage ? (
              <button type="button" className="meta-btn-solid gold" onClick={openCreateProfile} disabled={Boolean(busyKey)}>
                {copy.addProfile}
              </button>
            ) : null}
          </div>
        </div>
        <div className="meta-panel-body">
          {loading ? (
            <div className="meta-skeleton-grid" aria-hidden="true">
              <div className="meta-skeleton" />
              <div className="meta-skeleton" />
            </div>
          ) : null}
          {!loading && profiles.length === 0 ? (
            <div className="meta-empty">
              <h3>{copy.profilesEmptyTitle}</h3>
              <p>{copy.profilesEmptyBody}</p>
              {canManage ? (
                <button type="button" className="meta-btn-solid" onClick={openCreateProfile}>
                  {copy.addProfile}
                </button>
              ) : (
                <p>{copy.manageRequired}</p>
              )}
            </div>
          ) : null}
          {!loading && profiles.length > 0 ? (
            <div className="meta-card-grid">
              {profiles.map((profile) => (
                <article key={profile.id} className="meta-profile-card">
                  <div className="meta-card-top">
                    <div className="meta-avatar" aria-hidden="true">{initials(profile.label)}</div>
                    <div className="meta-card-meta">
                      <h3>{profile.label}</h3>
                      <p className="meta-card-sub">App ID · {profile.appId || '—'}</p>
                      <div className="meta-badge-row">
                        <span className={`meta-badge ${profile.isActive ? 'ok' : 'muted'}`}>
                          {profile.isActive ? copy.profileActive : copy.profileInactive}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="meta-card-actions">
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          className="meta-btn-ghost"
                          disabled={Boolean(busyKey)}
                          onClick={() => connectFacebook(profile)}
                        >
                          <FacebookMark />
                          {copy.useThisProfile}
                        </button>
                        <button
                          type="button"
                          className="meta-icon-btn"
                          title={copy.editProfile}
                          aria-label={copy.editProfile}
                          disabled={Boolean(busyKey)}
                          onClick={() => openEditProfile(profile)}
                        >
                          <MetaActionIcon name="edit" />
                        </button>
                        <button
                          type="button"
                          className="meta-icon-btn danger"
                          title={copy.deleteProfile}
                          aria-label={copy.deleteProfile}
                          disabled={Boolean(busyKey)}
                          onClick={() => setConfirmDeleteProfile(profile)}
                        >
                          <MetaActionIcon name="delete" />
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Section 4 — Facebook Account */}
      <section className="meta-panel">
        <div className="meta-panel-head">
          <div>
            <h2>{copy.facebookTitle}</h2>
            <p className="meta-panel-hint">{copy.facebookHint}</p>
          </div>
        </div>
        <div className="meta-panel-body">
          {loading ? (
            <div className="meta-skeleton" style={{ height: '6rem' }} aria-hidden="true" />
          ) : null}

          {!loading && connections.length === 0 ? (
            <div className="meta-fb-hero">
              <div className="meta-fb-logo" aria-hidden="true"><FacebookMark /></div>
              <div className="meta-fb-copy">
                <h3>{copy.facebookEmptyTitle}</h3>
                <p>{copy.facebookEmptyBody}</p>
              </div>
              <div className="meta-fb-actions">
                {canManage ? (
                  <button
                    type="button"
                    className="meta-btn-solid"
                    onClick={primaryConnectFacebook}
                    disabled={Boolean(busyKey)}
                  >
                    <FacebookMark />
                    {copy.connectFacebook}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!loading && connections.length > 0 ? (
            <div className="meta-card-grid">
              {connections.map((connection) => {
                const connected = connection.status === 'connected'
                const expired = connection.status === 'expired'
                return (
                  <article key={connection.id} className="meta-account-card">
                    <div className="meta-card-top">
                      <div className="meta-avatar fb" aria-hidden="true"><FacebookMark /></div>
                      <div className="meta-card-meta">
                        <h3>{connection.displayName || connection.metaUserId}</h3>
                        {connection.connectionLabel ? (
                          <p className="meta-card-sub">{connection.connectionLabel}</p>
                        ) : null}
                        <div className="meta-badge-row">
                          <span className={`meta-badge ${connected ? 'ok' : expired ? 'warn' : 'muted'}`}>
                            {statusLabel(connection.status)}
                          </span>
                          {Array.isArray(connection.missingPermissions) && connection.missingPermissions.length > 0 ? (
                            <span className="meta-badge warn">{copy.missingAccess}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="meta-card-actions">
                      {connected && canPages ? (
                        <button
                          type="button"
                          className="meta-btn-solid gold"
                          disabled={Boolean(busyKey)}
                          onClick={() => openPagesModal(connection)}
                        >
                          {copy.choosePages}
                        </button>
                      ) : null}
                      {expired && canManage ? (
                        <button
                          type="button"
                          className="meta-btn-ghost"
                          disabled={Boolean(busyKey)}
                          onClick={primaryConnectFacebook}
                        >
                          {copy.connectFacebook}
                        </button>
                      ) : null}
                      {canManage ? (
                        <button
                          type="button"
                          className="meta-btn-ghost meta-btn-danger-ghost"
                          disabled={Boolean(busyKey)}
                          onClick={() => setConfirmDisconnectAccount(connection)}
                        >
                          {copy.disconnectAccount}
                        </button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}
        </div>
      </section>

      {/* Section 6 — Connected Pages (+ sync UX) */}
      <section className="meta-panel">
        <div className="meta-panel-head">
          <div>
            <h2>{copy.pagesTitle}</h2>
            <p className="meta-panel-hint">
              {copy.pagesHint}
              {' '}
              {copy.pageRangeLabel}
              {' '}
              {pageRange(pageNumber, LIST_LIMIT, pagesTotal)}
            </p>
          </div>
        </div>
        <div className="meta-panel-body">
          {canPages && pages.length > 0 ? (
            <div className="meta-bulk-bar">
              <div>
                <label className="meta-page-check" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                  <input
                    type="checkbox"
                    aria-label={allSelected ? copy.deselectAll : copy.selectAll}
                    checked={allSelected}
                    onChange={toggleAllPages}
                  />
                  <strong>
                    {selectedPageIds.length}
                    {' '}
                    {copy.selectedCount}
                  </strong>
                </label>
              </div>
              <div className="meta-bulk-actions">
                <button
                  type="button"
                  className="meta-btn-ghost"
                  disabled={selectedPageIds.length === 0 || Boolean(busyKey)}
                  onClick={runBulkSync}
                >
                  <MetaActionIcon name="sync" />
                  {copy.bulkSync}
                </button>
                <button
                  type="button"
                  className="meta-btn-ghost meta-btn-danger-ghost"
                  disabled={selectedPageIds.length === 0 || Boolean(busyKey)}
                  onClick={() => setConfirmDisconnectPages(true)}
                >
                  {copy.bulkDisconnect}
                </button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="meta-skeleton-grid" aria-hidden="true">
              <div className="meta-skeleton" />
              <div className="meta-skeleton" />
              <div className="meta-skeleton" />
            </div>
          ) : null}

          {!loading && pages.length === 0 ? (
            <div className="meta-empty">
              <h3>{copy.pagesEmptyTitle}</h3>
              <p>{copy.pagesEmptyBody}</p>
              {canPages && connections.some((row) => row.status === 'connected') ? (
                <button
                  type="button"
                  className="meta-btn-solid"
                  onClick={() => openPagesModal(connections.find((row) => row.status === 'connected'))}
                >
                  {copy.choosePages}
                </button>
              ) : null}
            </div>
          ) : null}

          {!loading && pages.length > 0 ? (
            <div className="meta-card-grid">
              {pages.map((page) => {
                const sync = syncByPage.get(page.id)
                const syncing = Boolean(sync)
                const connected = page.status === 'connected'
                const counts = page.counts || leadCounts.pages[page.pageId] || { imported: 0, skipped: 0 }
                const jobFailed = page.latestSyncJob?.status === 'failed' || Boolean(page.lastError)
                return (
                  <article key={page.id} className="meta-page-card">
                    <div className="meta-card-top">
                      {canPages ? (
                        <label className="meta-page-check">
                          <input
                            type="checkbox"
                            aria-label={copy.selectPage}
                            checked={selectedPageIds.includes(page.id)}
                            onChange={() => togglePage(page.id)}
                          />
                        </label>
                      ) : null}
                      <div className="meta-avatar" aria-hidden="true">{initials(page.name)}</div>
                      <div className="meta-card-meta">
                        <h3 title={page.name}>{page.name}</h3>
                        <p className="meta-card-sub">
                          {copy.lastSync}
                          :
                          {' '}
                          {formatSyncTime(page.lastSyncAt)}
                        </p>
                        <div className="meta-badge-row">
                          <span className={`meta-badge ${connected ? 'ok' : 'muted'}`}>
                            {statusLabel(page.status)}
                          </span>
                          {syncing ? (
                            <span className="meta-badge warn">{copy.syncRunning}</span>
                          ) : jobFailed ? (
                            <span className="meta-badge danger">{copy.syncFailed}</span>
                          ) : connected ? (
                            <span className="meta-badge ok">{copy.syncIdle}</span>
                          ) : null}
                          <span className={`meta-badge ${page.webhookSubscribed ? 'ok' : 'muted'}`}>
                            {page.webhookSubscribed ? copy.webhookOk : copy.webhookOff}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="meta-metrics">
                      <div className="meta-metric">
                        <p className="meta-metric-value">{counts.imported ?? 0}</p>
                        <p className="meta-metric-label">{copy.importedLabel}</p>
                      </div>
                      <div className="meta-metric">
                        <p className="meta-metric-value">{counts.skipped ?? 0}</p>
                        <p className="meta-metric-label">{copy.skippedLabel}</p>
                      </div>
                    </div>

                    {syncing ? (
                      <div className="meta-sync-bar-wrap">
                        <div className="meta-sync-bar" aria-hidden="true"><span /></div>
                        <p className="meta-sync-note">
                          {copy.syncing}
                          {sync.status ? ` · ${sync.status}` : ''}
                          {sync.leadsSeen ? ` · ${sync.leadsSeen} seen` : ''}
                        </p>
                      </div>
                    ) : null}

                    {page.lastError && !syncing ? (
                      <p className="meta-sync-note error">{page.lastError}</p>
                    ) : null}
                    {jobFailed && !syncing ? (
                      <p className="meta-sync-note">{copy.retryHint}</p>
                    ) : null}

                    <div className="meta-card-actions">
                      <button
                        type="button"
                        className="meta-btn-solid"
                        title={syncing ? copy.syncing : copy.syncNow}
                        disabled={!canPages || syncing || !connected}
                        onClick={() => onSync(page)}
                      >
                        <MetaActionIcon name="sync" />
                        {syncing ? copy.syncing : copy.syncNow}
                      </button>
                      <button
                        type="button"
                        className="meta-icon-btn"
                        title={copy.ads}
                        aria-label={copy.ads}
                        disabled={!connected}
                        onClick={() => setAssetPanel({ page, kind: 'ads' })}
                      >
                        <MetaActionIcon name="ads" />
                      </button>
                      <button
                        type="button"
                        className="meta-icon-btn"
                        title={copy.forms}
                        aria-label={copy.forms}
                        disabled={!connected}
                        onClick={() => setAssetPanel({ page, kind: 'forms' })}
                      >
                        <MetaActionIcon name="forms" />
                      </button>
                      <button
                        type="button"
                        className="meta-icon-btn"
                        title={copy.campaigns}
                        aria-label={copy.campaigns}
                        disabled={!connected}
                        onClick={() => setAssetPanel({ page, kind: 'campaigns' })}
                      >
                        <MetaActionIcon name="campaigns" />
                      </button>
                      {canPages && connected ? (
                        <button
                          type="button"
                          className="meta-icon-btn danger"
                          title={copy.disconnectPage}
                          aria-label={copy.disconnectPage}
                          disabled={Boolean(busyKey) || syncing}
                          onClick={() => setConfirmDisconnectPage(page)}
                        >
                          <MetaActionIcon name="disconnect" />
                        </button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}

          <p className="meta-panel-hint" style={{ marginTop: '1rem' }}>{copy.manualSyncHint}</p>
          <div className="meta-bulk-actions" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="meta-btn-ghost"
              disabled={!pageHasPrevious || Boolean(busyKey)}
              onClick={() => load(pageNumber - 1)}
            >
              {copy.previous}
            </button>
            <span className="meta-panel-hint" style={{ margin: 0 }}>{pageNumber}</span>
            <button
              type="button"
              className="meta-btn-ghost"
              disabled={!pageHasNext || Boolean(busyKey)}
              onClick={() => load(pageNumber + 1)}
            >
              {copy.next}
            </button>
          </div>
        </div>
      </section>

      {/* Ads / Forms / Campaigns placeholders */}
      {assetPanel ? (
        <section className="meta-panel">
          <div className="meta-tabs" role="tablist">
            {['ads', 'forms', 'campaigns'].map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                className={`meta-tab${assetPanel.kind === kind ? ' active' : ''}`}
                aria-selected={assetPanel.kind === kind}
                onClick={() => setAssetPanel({ ...assetPanel, kind })}
              >
                {kind === 'ads' ? copy.ads : null}
                {kind === 'forms' ? copy.forms : null}
                {kind === 'campaigns' ? copy.campaigns : null}
              </button>
            ))}
            <button type="button" className="meta-tab" style={{ marginLeft: 'auto' }} onClick={() => setAssetPanel(null)}>
              {copy.close}
            </button>
          </div>
          <div className="meta-tab-panel">
            <h2 style={{ margin: '0 0 0.35rem', fontSize: '1rem' }}>
              {assetPanel.kind === 'ads' ? copy.ads : null}
              {assetPanel.kind === 'forms' ? copy.forms : null}
              {assetPanel.kind === 'campaigns' ? copy.campaigns : null}
              {' · '}
              {assetPanel.page.name}
            </h2>
            <p className="meta-panel-hint">{copy.assetPlaceholderTitle}</p>
            <p className="meta-panel-hint">{copy.assetPlaceholderBody}</p>
            <div className="meta-empty" style={{ marginTop: '0.85rem' }}>
              <p>{copy.assetEmpty}</p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Profile create/edit modal */}
      {profileModal ? (
        <div className="modal-backdrop" role="presentation" onClick={closeProfileModal}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meta-profile-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="meta-profile-modal-title">
              {profileModal.mode === 'edit' ? copy.editProfile : copy.addProfile}
            </h3>
            <form className="meta-form-grid" onSubmit={saveProfile}>
              <label htmlFor="meta-label">
                {copy.profileLabel}
                <input
                  id="meta-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  autoComplete="off"
                  disabled={Boolean(busyKey)}
                />
                {fieldErrors.label ? <span className="admin-error">{fieldErrors.label}</span> : null}
              </label>
              <label htmlFor="meta-app-id">
                {copy.appId}
                <input
                  id="meta-app-id"
                  value={appId}
                  onChange={(event) => setAppId(event.target.value)}
                  autoComplete="off"
                  disabled={Boolean(busyKey)}
                />
                {fieldErrors.appId ? <span className="admin-error">{fieldErrors.appId}</span> : null}
              </label>
              <label htmlFor="meta-app-secret">
                {copy.appSecret}
                <PasswordInput
                  id="meta-app-secret"
                  value={appSecret}
                  onChange={(event) => setAppSecret(event.target.value)}
                  autoComplete="new-password"
                  disabled={Boolean(busyKey)}
                  placeholder={profileModal.mode === 'edit' ? copy.secretHint : undefined}
                />
                {fieldErrors.appSecret ? <span className="admin-error">{fieldErrors.appSecret}</span> : null}
                {profileModal.mode === 'edit' ? (
                  <span className="meta-panel-hint" style={{ fontWeight: 500 }}>{copy.secretHint}</span>
                ) : null}
              </label>
              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={closeProfileModal}>{copy.cancel}</button>
                <button type="submit" className="btn primary" disabled={Boolean(busyKey)}>
                  {busyKey === 'save-profile'
                    ? copy.working
                    : (profileModal.mode === 'edit' ? copy.updateProfile : copy.saveProfile)}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Section 5 — Page selection modal */}
      {pagesModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPagesModal(null)}>
          <div
            className="modal-card"
            style={{ width: 'min(720px, calc(100vw - 1.5rem))' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="meta-pages-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="meta-pages-modal-title">{copy.pagesModalTitle}</h3>
            <p className="meta-confirm-text">
              {copy.pagesModalHint}
              {' '}
              (
              {pagesModal.displayName || pagesModal.metaUserId}
              )
            </p>

            <div className="meta-select-toolbar">
              <strong>
                {availableSelected.length}
                {' '}
                {copy.selectedCount}
              </strong>
              <div className="meta-bulk-actions">
                <button type="button" className="meta-btn-ghost" onClick={selectAllAvailable} disabled={availableLoading || availablePages.length === 0}>
                  {copy.selectAllAvailable}
                </button>
                <button type="button" className="meta-btn-ghost" onClick={clearAvailableSelection} disabled={availableSelected.length === 0}>
                  {copy.clearSelection}
                </button>
              </div>
            </div>

            {availableLoading ? (
              <div className="meta-skeleton-grid" aria-hidden="true">
                <div className="meta-skeleton" />
                <div className="meta-skeleton" />
              </div>
            ) : null}
            {availableError ? <p className="admin-error">{availableError}</p> : null}
            {!availableLoading && availablePages.length === 0 ? (
              <div className="meta-empty">
                <p>{copy.pagesModalEmpty}</p>
              </div>
            ) : null}
            {!availableLoading && availablePages.length > 0 ? (
              <div className="meta-available-grid">
                {availablePages.map((item) => {
                  const facebookPageId = item.pageId || item.id
                  const selected = availableSelected.includes(facebookPageId)
                  return (
                    <button
                      key={facebookPageId}
                      type="button"
                      className={`meta-available-card${selected ? ' selected' : ''}`}
                      onClick={() => toggleAvailable(facebookPageId)}
                      aria-pressed={selected}
                    >
                      <span className="meta-page-check">
                        <input
                          type="checkbox"
                          tabIndex={-1}
                          readOnly
                          checked={selected}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="meta-avatar" aria-hidden="true">{initials(item.name)}</span>
                      <span>
                        <h4>{item.name}</h4>
                        <p>{facebookPageId}</p>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setPagesModal(null)}>
                {copy.cancel}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={availableSelected.length === 0 || busyKey === 'add-pages' || availableLoading}
                onClick={addSelectedPages}
              >
                {busyKey === 'add-pages' ? copy.working : copy.addPages}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDisconnectPages ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setConfirmDisconnectPages(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>{copy.bulkDisconnect}</h3>
            <p className="meta-confirm-text">{copy.confirmDisconnectPages}</p>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmDisconnectPages(false)}>{copy.cancel}</button>
              <button type="button" className="btn primary" onClick={confirmBulkDisconnect} disabled={busyKey === 'bulk-disconnect'}>
                {busyKey === 'bulk-disconnect' ? copy.working : copy.bulkDisconnect}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeleteProfile ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setConfirmDeleteProfile(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>{copy.deleteProfile}</h3>
            <p className="meta-confirm-text">{copy.confirmDeleteProfile}</p>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmDeleteProfile(null)}>{copy.cancel}</button>
              <button type="button" className="btn primary" onClick={() => deleteProfile(confirmDeleteProfile)}>
                {copy.deleteProfile}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDisconnectAccount ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setConfirmDisconnectAccount(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>{copy.disconnectAccount}</h3>
            <p className="meta-confirm-text">{copy.confirmDisconnectAccount}</p>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmDisconnectAccount(null)}>{copy.cancel}</button>
              <button type="button" className="btn primary" onClick={() => disconnectAccount(confirmDisconnectAccount)}>
                {copy.disconnectAccount}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDisconnectPage ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setConfirmDisconnectPage(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>{copy.disconnectPage}</h3>
            <p className="meta-confirm-text">
              Disconnect
              {' '}
              <strong>{confirmDisconnectPage.name}</strong>
              ? New Lead Ads from this Page will stop arriving until you connect it again.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirmDisconnectPage(null)}>{copy.cancel}</button>
              <button
                type="button"
                className="btn primary"
                disabled={busyKey === `disconnect-page-${confirmDisconnectPage.id}`}
                onClick={() => disconnectPage(confirmDisconnectPage)}
              >
                {copy.disconnectPage}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
