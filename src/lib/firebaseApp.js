import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, isSupported } from 'firebase/messaging'

/**
 * Firebase web app bootstrap from Vite env (no secrets in source).
 * Returns null when config is incomplete.
 */

function readFirebaseWebConfig() {
  const apiKey = String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim()
  const authDomain = String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim()
  const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim()
  const messagingSenderId = String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim()
  const appId = String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim()
  const storageBucket = String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim()
  if (!apiKey || !projectId || !messagingSenderId || !appId) {
    return null
  }
  return {
    apiKey,
    authDomain: authDomain || undefined,
    projectId,
    storageBucket: storageBucket || undefined,
    messagingSenderId,
    appId,
  }
}

export function isFirebaseWebConfigured() {
  return Boolean(readFirebaseWebConfig())
}

export function getFirebaseApp() {
  const config = readFirebaseWebConfig()
  if (!config) return null
  if (getApps().length) {
    return getApps()[0]
  }
  return initializeApp(config)
}

export async function getFirebaseMessaging() {
  if (!(await isSupported())) {
    return null
  }
  const app = getFirebaseApp()
  if (!app) return null
  return getMessaging(app)
}

export function getVapidKey() {
  return String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim()
}
