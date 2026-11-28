import { getToken, onMessage, deleteToken } from 'firebase/messaging'
import {
  getFirebaseMessaging,
  getVapidKey,
  isFirebaseWebConfigured,
} from './firebaseApp'
import { deactivateNotificationDevice, registerNotificationDevice } from '../api/client'
import { notificationPathFromData } from './webPushHelpers'

export { notificationPathFromData } from './webPushHelpers'

const WEB_TOKEN_STORAGE_KEY = 'filos_web_fcm_token'
const SHOWN_IDS_KEY = 'filos_web_push_shown_ids'
const SHOWN_TTL_MS = 5 * 60 * 1000

function readStoredToken() {
  try {
    return String(localStorage.getItem(WEB_TOKEN_STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

function writeStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(WEB_TOKEN_STORAGE_KEY, token)
    } else {
      localStorage.removeItem(WEB_TOKEN_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures (private mode).
  }
}

function sanitizeError(error) {
  if (!error || typeof error !== 'object') {
    return String(error || 'unknown').slice(0, 120)
  }
  const anyErr = error
  const status = anyErr.response?.status
  const code = anyErr.code || anyErr.response?.data?.error || (status ? `http_${status}` : '')
  const message = String(anyErr.message || '').slice(0, 80)
  return [code, message].filter(Boolean).join(':').slice(0, 160)
}

function readShownMap() {
  try {
    const raw = sessionStorage.getItem(SHOWN_IDS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeShownMap(map) {
  try {
    sessionStorage.setItem(SHOWN_IDS_KEY, JSON.stringify(map))
  } catch {
    // Ignore.
  }
}

/**
 * Returns true if this notification id was not shown recently and is now claimed.
 * @param {string} notificationId
 */
export function claimBrowserNotificationDisplay(notificationId) {
  const id = String(notificationId || '').trim()
  if (!id) return true
  const now = Date.now()
  const map = readShownMap()
  for (const [key, ts] of Object.entries(map)) {
    if (!ts || now - Number(ts) > SHOWN_TTL_MS) {
      delete map[key]
    }
  }
  if (map[id]) {
    writeShownMap(map)
    return false
  }
  map[id] = now
  writeShownMap(map)
  return true
}

/** Allow a later SSE/FCM path to retry after a failed display attempt. */
export function releaseBrowserNotificationDisplay(notificationId) {
  const id = String(notificationId || '').trim()
  if (!id) return
  const map = readShownMap()
  if (map[id]) {
    delete map[id]
    writeShownMap(map)
  }
}

async function getNotificationRegistration() {
  if (!('serviceWorker' in navigator)) {
    return null
  }
  let registration = await navigator.serviceWorker.getRegistration('/')
  if (!registration) {
    registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    })
  }
  await navigator.serviceWorker.ready
  return registration
}

/**
 * Show a browser notification when permission is granted.
 *
 * Uses ServiceWorkerRegistration.showNotification (not `new Notification()`),
 * because Chromium often suppresses constructor toasts while the tab is focused —
 * the exact case when agents watch the Bell update over SSE.
 *
 * Dedupes by notificationId across SSE + FCM. Claim is released if display fails.
 *
 * @param {{ title?: string, body?: string, notificationId?: string, data?: Record<string, string|undefined> }} payload
 * @returns {Promise<boolean>} whether a notification was displayed
 */
export async function displayBrowserNotification(payload = {}) {
  if (typeof Notification === 'undefined') {
    console.warn('[filos-web-push] display_skipped unsupported')
    return false
  }
  if (Notification.permission !== 'granted') {
    console.warn('[filos-web-push] display_skipped permission=', Notification.permission)
    return false
  }
  const data = payload.data || {}
  const notificationId = String(
    payload.notificationId || data.notificationId || '',
  ).trim()
  if (notificationId && !claimBrowserNotificationDisplay(notificationId)) {
    return false
  }
  const title = String(payload.title || data.title || 'FILOS CRM').trim() || 'FILOS CRM'
  const body = String(payload.body || data.body || '')
  const path = notificationPathFromData({ ...data, href: data.href })
  const options = {
    body,
    tag: notificationId || path || 'filos-crm',
    data: { ...data, path, href: path, notificationId },
    renotify: false,
    requireInteraction: false,
  }
  try {
    const registration = await getNotificationRegistration()
    if (registration?.showNotification) {
      await registration.showNotification(title, options)
      return true
    }
    // Rare fallback (no SW): constructor is less reliable while focused.
    const note = new Notification(title, options)
    note.onclick = () => {
      try {
        window.focus()
        if (path) {
          window.dispatchEvent(new CustomEvent('filos-notification-navigate', { detail: { path } }))
        }
      } finally {
        note.close()
      }
    }
    return true
  } catch (error) {
    if (notificationId) {
      releaseBrowserNotificationDisplay(notificationId)
    }
    console.warn('[filos-web-push] display_failed', sanitizeError(error))
    return false
  }
}

export function isWebPushAvailable() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && isFirebaseWebConfigured()
    && Boolean(getVapidKey())
}

export function getBrowserNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/**
 * Request browser permission (must run from a user gesture), obtain an FCM token,
 * and register with the existing backend device API (platform: web).
 * Never returns the raw token.
 */
export async function enableWebPush() {
  if (!isWebPushAvailable()) {
    return { enabled: false, reason: 'unsupported' }
  }
  if (Notification.permission === 'denied') {
    return { enabled: false, reason: 'denied' }
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { enabled: false, reason: permission === 'denied' ? 'denied' : 'dismissed' }
  }

  const messaging = await getFirebaseMessaging()
  if (!messaging) {
    return { enabled: false, reason: 'messaging_unavailable' }
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    })
    await navigator.serviceWorker.ready
    const token = await getToken(messaging, {
      vapidKey: getVapidKey(),
      serviceWorkerRegistration: registration,
    })
    if (!token || token.length < 20) {
      return { enabled: false, reason: 'token_unavailable' }
    }
    if (token.length > 191) {
      console.warn('[filos-web-push] token_too_long length=', token.length)
      return { enabled: false, reason: 'token_too_long_for_schema' }
    }

    await registerNotificationDevice({
      token,
      platform: 'web',
      deviceId: 'web-browser',
      appVersion: 'web',
    })
    writeStoredToken(token)
    console.warn('[filos-web-push] device_registered tokenLen=', token.length)
    return { enabled: true }
  } catch (error) {
    console.warn('[filos-web-push] enable_failed', sanitizeError(error))
    return { enabled: false, reason: 'enable_failed' }
  }
}

/**
 * Re-register an existing web token after login (no permission prompt).
 */
export async function syncWebPushTokenIfPermitted() {
  if (!isWebPushAvailable()) return { synced: false }
  if (Notification.permission !== 'granted') return { synced: false, reason: 'not_granted' }

  const messaging = await getFirebaseMessaging()
  if (!messaging) return { synced: false }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    })
    await navigator.serviceWorker.ready
    const token = await getToken(messaging, {
      vapidKey: getVapidKey(),
      serviceWorkerRegistration: registration,
    })
    if (!token || token.length < 20) return { synced: false, reason: 'token_unavailable' }
    if (token.length > 191) return { synced: false, reason: 'token_too_long_for_schema' }
    await registerNotificationDevice({
      token,
      platform: 'web',
      deviceId: 'web-browser',
      appVersion: 'web',
    })
    writeStoredToken(token)
    return { synced: true }
  } catch (error) {
    console.warn('[filos-web-push] sync_failed', sanitizeError(error))
    return { synced: false, reason: 'sync_failed' }
  }
}

/**
 * Foreground FCM — display one browser notification (deduped) and notify caller.
 * @param {(payload: object) => void} onPayload
 */
export async function subscribeForegroundWebPush(onPayload) {
  if (!isWebPushAvailable() || Notification.permission !== 'granted') {
    return () => {}
  }
  const messaging = await getFirebaseMessaging()
  if (!messaging) return () => {}
  return onMessage(messaging, (payload) => {
    const data = payload?.data || {}
    displayBrowserNotification({
      title: payload?.notification?.title || data.title,
      body: payload?.notification?.body || data.body,
      notificationId: data.notificationId,
      data,
    })
    onPayload?.(payload)
  })
}

/** Deactivate this browser's token on logout. */
export async function deactivateWebPushOnLogout() {
  const token = readStoredToken()
  try {
    if (token) {
      await deactivateNotificationDevice({ token })
    }
  } catch (error) {
    console.warn('[filos-web-push] deactivate_failed', sanitizeError(error))
  }
  try {
    const messaging = await getFirebaseMessaging()
    if (messaging && Notification.permission === 'granted') {
      await deleteToken(messaging)
    }
  } catch {
    // Ignore.
  }
  writeStoredToken('')
}
