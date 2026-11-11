import { useEffect, useState } from 'react'
import {
  getMetaSyncToastDismissMs,
  subscribeMetaSyncToasts,
} from '../utils/metaPageSync'

/** Floating toast stack for Sync Now success/failure while browsing. */
export function MetaSyncToasts() {
  const [toasts, setToasts] = useState([])

  useEffect(() => subscribeMetaSyncToasts((toast) => {
    setToasts((current) => [toast, ...current].slice(0, 5))
    window.setTimeout(() => {
      setToasts((current) => current.filter((row) => row.id !== toast.id))
    }, getMetaSyncToastDismissMs())
  }), [])

  if (toasts.length === 0) return null

  return (
    <div className="meta-sync-toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={toast.tone === 'error' ? 'meta-sync-toast is-error' : 'meta-sync-toast is-success'}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <div className="meta-sync-toast-body">
            <p className="meta-sync-toast-title">{toast.title}</p>
            {toast.pageName ? <p className="meta-sync-toast-line">Page: {toast.pageName}</p> : null}
            {toast.tone === 'success' && typeof toast.imported === 'number' ? (
              <>
                <p className="meta-sync-toast-line">Imported: {toast.imported}</p>
                <p className="meta-sync-toast-line">Duplicates skipped: {toast.skipped}</p>
                {toast.finishedLabel ? (
                  <p className="meta-sync-toast-line">Finished: {toast.finishedLabel}</p>
                ) : null}
              </>
            ) : null}
            {toast.tone === 'error' && toast.detail ? (
              <p className="meta-sync-toast-line">{toast.detail}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="meta-sync-toast-dismiss"
            onClick={() => setToasts((current) => current.filter((row) => row.id !== toast.id))}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  )
}
