import { useEffect } from 'react'

/**
 * Transient success/error toast for admin actions (e.g. "Link copied").
 *
 * @param {{ notice?: string, error?: string, onClear?: () => void }} props
 */
export function Toast({ notice, error, onClear }) {
  useEffect(() => {
    if (!notice && !error) {
      return undefined
    }
    const timer = window.setTimeout(() => onClear?.(), 3200)
    return () => window.clearTimeout(timer)
  }, [notice, error, onClear])

  if (!notice && !error) {
    return null
  }

  return (
    <div className={`hc-toast ${error ? 'is-error' : 'is-success'}`} role="status">
      {error || notice}
    </div>
  )
}

/**
 * Copies text using Clipboard API with a textarea fallback for non-secure contexts.
 *
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function copyText(value) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const area = document.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', 'readonly')
  area.style.position = 'absolute'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(area)
  if (!ok) {
    throw new Error('Could not copy to clipboard.')
  }
}
