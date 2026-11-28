import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getNotificationsUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  readApiError,
  subscribeNotificationStream,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import {
  displayBrowserNotification,
  enableWebPush,
  getBrowserNotificationPermission,
  isWebPushAvailable,
  subscribeForegroundWebPush,
} from '../lib/webPush'

const PAGE_SIZE = 20
const POLL_MS = 20000

function formatNotificationTime(iso) {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) {
    return 'Just now'
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h ago`
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function notificationHref(notification) {
  if (notification?.href) {
    return notification.href
  }
  if (notification?.entityType === 'lead' && notification?.entityId) {
    return `/leads/${notification.entityId}`
  }
  return null
}

function BellIcon() {
  return (
    <svg
      className="notification-bell-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Topbar notification inbox: unread badge, dropdown list, SSE + polling fallback.
 */
export function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const wrapRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [countError, setCountError] = useState('')
  const [markAllBusy, setMarkAllBusy] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushHint, setPushHint] = useState('')
  const pollRef = useRef(null)
  const streamCleanupRef = useRef(null)
  const openRef = useRef(false)
  const showEnablePush = isWebPushAvailable()
    && getBrowserNotificationPermission() !== 'granted'

  useEffect(() => {
    openRef.current = open
  }, [open])

  const refreshUnreadCount = useCallback(async () => {
    try {
      const payload = await getNotificationsUnreadCount()
      setUnreadCount(payload?.data?.unreadCount ?? 0)
      setCountError('')
    } catch (error) {
      setCountError(readApiError(error))
    }
  }, [])

  const loadPage = useCallback(async (pageNumber, { replace = false } = {}) => {
    setListLoading(true)
    setListError('')
    try {
      const payload = await listNotifications({ page: pageNumber, limit: PAGE_SIZE })
      const batch = payload?.data?.notifications || []
      const nextTotal = payload?.data?.total ?? 0
      setTotal(nextTotal)
      setPage(pageNumber)
      setItems((current) => (replace ? batch : [...current, ...batch]))
    } catch (error) {
      setListError(readApiError(error))
    } finally {
      setListLoading(false)
    }
  }, [])

  const refreshListIfOpen = useCallback(() => {
    if (openRef.current) {
      loadPage(1, { replace: true })
    }
  }, [loadPage])

  const applyStreamEvent = useCallback((event) => {
    if (typeof event?.unreadCount === 'number') {
      setUnreadCount(event.unreadCount)
    }
    if (event?.type === 'notification.created' && event.notification) {
      const notification = event.notification
      // Browser toast from SSE when permitted; FCM foreground shares the same dedupe key.
      // Must use SW showNotification (see webPush.js) so focused tabs still get a toast.
      if (getBrowserNotificationPermission() === 'granted') {
        void displayBrowserNotification({
          title: notification.title,
          body: notification.body || '',
          notificationId: notification.id,
          data: {
            notificationId: notification.id,
            leadId: notification.entityType === 'lead' ? notification.entityId : undefined,
            href: notification.href || undefined,
            entityType: notification.entityType || undefined,
            entityId: notification.entityId || undefined,
          },
        })
      } else {
        console.warn(
          '[filos-web-push] sse_toast_skipped permission=',
          getBrowserNotificationPermission(),
        )
      }
      setItems((current) => {
        if (current.some((row) => row.id === notification.id)) {
          return current
        }
        if (!openRef.current) {
          return current
        }
        return [notification, ...current]
      })
      if (!openRef.current) {
        refreshUnreadCount()
      }
    }
    if (event?.type === 'notification.read' && event.notificationId) {
      setItems((current) => current.map((row) => (
        row.id === event.notificationId ? { ...row, readAt: row.readAt || new Date().toISOString() } : row
      )))
    }
    if (event?.type === 'notification.read_all') {
      setItems((current) => current.map((row) => ({ ...row, readAt: row.readAt || new Date().toISOString() })))
    }
  }, [refreshUnreadCount])

  const startPolling = useCallback(() => {
    if (pollRef.current) {
      return
    }
    pollRef.current = window.setInterval(() => {
      refreshUnreadCount()
      refreshListIfOpen()
    }, POLL_MS)
  }, [refreshListIfOpen, refreshUnreadCount])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const connectStream = useCallback(() => {
    streamCleanupRef.current?.()
    streamCleanupRef.current = subscribeNotificationStream({
      onEvent: applyStreamEvent,
      onError: () => {
        startPolling()
      },
    })
  }, [applyStreamEvent, startPolling])

  useEffect(() => {
    if (!user) {
      return undefined
    }
    refreshUnreadCount()
    connectStream()
    let unsubForeground = () => {}
    void subscribeForegroundWebPush(() => {
      refreshUnreadCount()
      refreshListIfOpen()
    }).then((cleanup) => {
      unsubForeground = typeof cleanup === 'function' ? cleanup : () => {}
    })
    function onSwMessage(event) {
      if (event?.data?.type === 'melo-notification-click' && event.data.path) {
        navigate(event.data.path)
      }
    }
    function onLocalNotificationNavigate(event) {
      const path = event?.detail?.path
      if (path) {
        navigate(path)
      }
    }
    navigator.serviceWorker?.addEventListener?.('message', onSwMessage)
    window.addEventListener('filos-notification-navigate', onLocalNotificationNavigate)
    return () => {
      stopPolling()
      streamCleanupRef.current?.()
      streamCleanupRef.current = null
      unsubForeground()
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage)
      window.removeEventListener('filos-notification-navigate', onLocalNotificationNavigate)
    }
  }, [user, refreshUnreadCount, connectStream, stopPolling, refreshListIfOpen, navigate])

  useEffect(() => {
    if (!open) {
      return undefined
    }
    loadPage(1, { replace: true })
    function onDocMouseDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
    }
  }, [open, loadPage])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('keydown', onKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!user) {
    return null
  }

  const hasMore = items.length < total
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount)

  async function onMarkAllRead() {
    if (!unreadCount || markAllBusy) {
      return
    }
    setMarkAllBusy(true)
    try {
      await markAllNotificationsRead()
      setUnreadCount(0)
      setItems((current) => current.map((row) => ({ ...row, readAt: row.readAt || new Date().toISOString() })))
    } catch (error) {
      setListError(readApiError(error))
    } finally {
      setMarkAllBusy(false)
    }
  }

  async function onEnableBrowserPush() {
    if (pushBusy) return
    setPushBusy(true)
    setPushHint('')
    try {
      const result = await enableWebPush()
      if (result.enabled) {
        setPushHint('Browser alerts enabled')
      } else if (result.reason === 'denied') {
        setPushHint('Permission denied — enable notifications in browser settings')
      } else {
        setPushHint('Browser alerts unavailable in this browser')
      }
    } catch (error) {
      setPushHint(readApiError(error))
    } finally {
      setPushBusy(false)
    }
  }

  async function onSelectNotification(notification) {
    const href = notificationHref(notification)
    if (!notification.readAt) {
      try {
        await markNotificationRead(notification.id)
        setItems((current) => current.map((row) => (
          row.id === notification.id ? { ...row, readAt: new Date().toISOString() } : row
        )))
        setUnreadCount((value) => Math.max(0, value - 1))
      } catch (error) {
        setListError(readApiError(error))
      }
    }
    setOpen(false)
    if (href) {
      navigate(href)
    }
  }

  return (
    <div className="notification-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn notification-bell-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        title="Notifications"
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="notification-bell-badge" aria-hidden="true">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notification-dropdown" role="dialog" aria-label="Notifications">
          <div className="notification-dropdown-header">
            <h2 className="notification-dropdown-title">Notifications</h2>
            <div className="notification-dropdown-actions">
              {countError ? (
                <button type="button" className="ghost-btn notification-text-btn" onClick={() => refreshUnreadCount()}>
                  Retry
                </button>
              ) : null}
              {showEnablePush ? (
                <button
                  type="button"
                  className="ghost-btn notification-text-btn"
                  disabled={pushBusy}
                  onClick={() => onEnableBrowserPush()}
                  title="Enable browser push alerts (Chrome / Edge)"
                >
                  {pushBusy ? 'Enabling…' : 'Enable alerts'}
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-btn notification-text-btn"
                disabled={!unreadCount || markAllBusy}
                onClick={() => onMarkAllRead()}
              >
                Mark all read
              </button>
            </div>
          </div>
          {pushHint ? (
            <p className="notification-inline-hint" role="status">{pushHint}</p>
          ) : null}

          {listError ? (
            <p className="notification-inline-error" role="alert">
              {listError}
              {' '}
              <button type="button" className="notification-link-btn" onClick={() => loadPage(1, { replace: true })}>
                Try again
              </button>
            </p>
          ) : null}

          <ul className="notification-list">
            {listLoading && !items.length ? (
              <li className="notification-skeleton" aria-busy="true">
                <span className="notification-skeleton-line" />
                <span className="notification-skeleton-line short" />
              </li>
            ) : null}

            {!listLoading && !items.length && !listError ? (
              <li className="empty-state notification-empty">You&apos;re all caught up — no notifications yet.</li>
            ) : null}

            {items.map((notification) => {
              const unread = !notification.readAt
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={`notification-item${unread ? ' is-unread' : ''}`}
                    onClick={() => onSelectNotification(notification)}
                  >
                    <span className="notification-item-top">
                      <span className="notification-item-title">{notification.title}</span>
                      <time className="notification-item-time" dateTime={notification.createdAt}>
                        {formatNotificationTime(notification.createdAt)}
                      </time>
                    </span>
                    {notification.body ? (
                      <span className="notification-item-body">{notification.body}</span>
                    ) : null}
                    {notification.category ? (
                      <span className="badge badge-navy notification-item-badge">{notification.category}</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>

          {hasMore ? (
            <div className="notification-dropdown-footer">
              <button
                type="button"
                className="ghost-btn"
                disabled={listLoading}
                onClick={() => loadPage(page + 1)}
              >
                {listLoading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}