import { api, readApiError } from '../api/client'

const syncPollDelayMs = 2000
const syncPollMaxAttempts = 180
const toastDismissMs = 5000

const activeSyncs = new Map()
const syncListeners = new Set()
const toastListeners = new Set()
let toastSequence = 0

function emitSyncChange() {
  const snapshot = getActiveMetaSyncs()
  for (const listener of syncListeners) {
    listener(snapshot)
  }
}

function emitToast(toast) {
  for (const listener of toastListeners) {
    listener(toast)
  }
}

export function getActiveMetaSyncs() {
  return [...activeSyncs.values()].map((entry) => ({
    pageId: entry.pageId,
    pageName: entry.pageName,
    jobId: entry.jobId,
    status: entry.status,
    imported: entry.imported || 0,
    skipped: entry.skipped || 0,
    leadsSeen: entry.leadsSeen || 0,
  }))
}

export function isMetaPageSyncing(pageId) {
  return activeSyncs.has(pageId)
}

export function subscribeMetaPageSync(listener) {
  syncListeners.add(listener)
  listener(getActiveMetaSyncs())
  return () => {
    syncListeners.delete(listener)
  }
}

export function subscribeMetaSyncToasts(listener) {
  toastListeners.add(listener)
  return () => {
    toastListeners.delete(listener)
  }
}

export function getMetaSyncToastDismissMs() {
  return toastDismissMs
}

async function waitForSyncJob(pageId, jobId) {
  for (let attempt = 0; attempt < syncPollMaxAttempts; attempt += 1) {
    const response = await api.get(`/meta/pages/${pageId}/sync-jobs/${jobId}`)
    const job = response.data?.data
    if (!job) {
      throw new Error('Sync job response was empty.')
    }
    const entry = activeSyncs.get(pageId)
    if (entry) {
      entry.status = job.status
      entry.imported = job.imported || 0
      entry.skipped = job.skipped || 0
      entry.leadsSeen = job.leadsSeen || 0
      emitSyncChange()
    }
    if (job.status === 'completed' || job.status === 'failed') {
      return job
    }
    await new Promise((resolve) => {
      window.setTimeout(resolve, syncPollDelayMs)
    })
  }
  const timeoutError = new Error('Facebook lead sync timed out.')
  timeoutError.statusCode = 504
  throw timeoutError
}

function publishJobToast(pageName, job) {
  toastSequence += 1
  if (job.status === 'failed') {
    emitToast({
      id: `meta-sync-toast-${toastSequence}`,
      tone: 'error',
      title: 'Facebook lead sync failed',
      detail: job.errorMessage || 'Facebook lead sync failed.',
      pageName,
    })
    return
  }
  const finishedAt = job.finishedAt ? new Date(job.finishedAt) : new Date()
  emitToast({
    id: `meta-sync-toast-${toastSequence}`,
    tone: 'success',
    title: 'Facebook leads synced',
    pageName,
    imported: job.imported || 0,
    skipped: job.skipped || 0,
    finishedLabel: Number.isNaN(finishedAt.getTime()) ? '' : finishedAt.toLocaleString(),
  })
}

/**
 * Starts or resumes a Page sync job and polls until completed/failed.
 * Pass `jobId` to resume an initial sync without creating another job.
 */
export async function startMetaPageSync({ pageId, pageName, jobId, startedMessage, onFinished }) {
  if (!pageId) return null
  if (activeSyncs.has(pageId)) {
    return activeSyncs.get(pageId)
  }
  const entry = {
    pageId,
    pageName: pageName || '',
    jobId: jobId || '',
    status: 'pending',
    imported: 0,
    skipped: 0,
    leadsSeen: 0,
  }
  activeSyncs.set(pageId, entry)
  emitSyncChange()
  if (startedMessage) {
    toastSequence += 1
    emitToast({
      id: `meta-sync-toast-${toastSequence}`,
      tone: 'success',
      title: startedMessage,
      pageName: entry.pageName,
      imported: undefined,
      skipped: undefined,
      finishedLabel: '',
    })
  }
  try {
    let activeJobId = jobId
    if (!activeJobId) {
      const started = await api.post(`/meta/pages/${pageId}/sync`, {})
      activeJobId = started.data?.data?.id
      entry.jobId = activeJobId
      entry.status = started.data?.data?.status || 'pending'
      emitSyncChange()
    }
    const job = await waitForSyncJob(pageId, activeJobId)
    publishJobToast(entry.pageName, job)
    activeSyncs.delete(pageId)
    emitSyncChange()
    if (typeof onFinished === 'function') onFinished(job)
    return job
  } catch (syncError) {
    toastSequence += 1
    emitToast({
      id: `meta-sync-toast-${toastSequence}`,
      tone: 'error',
      title: 'Facebook lead sync failed',
      detail: readApiError(syncError),
      pageName: entry.pageName,
    })
    activeSyncs.delete(pageId)
    emitSyncChange()
    if (typeof onFinished === 'function') onFinished(null)
    return null
  }
}
