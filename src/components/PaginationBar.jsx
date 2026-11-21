import { useState } from 'react'
import { PAGE_SIZE_OPTIONS } from '../utils/pagination'

/**
 * Reusable listing pager: page size, prev/next, page numbers, direct jump, totals.
 *
 * @param {{
 *   page: number,
 *   pageSize: number,
 *   total: number,
 *   onPageChange: (page: number) => void,
 *   onPageSizeChange: (size: number) => void,
 *   disabled?: boolean,
 *   className?: string,
 * }} props
 */
export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  className = '',
}) {
  const safeSize = Math.max(1, Number(pageSize) || 10)
  const safeTotal = Math.max(0, Number(total) || 0)
  const pageCount = Math.max(1, Math.ceil(safeTotal / safeSize) || 1)
  const safePage = Math.min(Math.max(1, Number(page) || 1), pageCount)
  // null = follow current page; string = user is editing the jump field
  const [jumpDraft, setJumpDraft] = useState(null)
  const jumpValue = jumpDraft === null ? String(safePage) : jumpDraft

  const start = safeTotal === 0 ? 0 : (safePage - 1) * safeSize + 1
  const end = safeTotal === 0 ? 0 : Math.min(safePage * safeSize, safeTotal)

  function goTo(next) {
    setJumpDraft(null)
    const target = Math.min(Math.max(1, next), pageCount)
    if (target !== safePage) {
      onPageChange(target)
    }
  }

  function submitJump(event) {
    event.preventDefault()
    const trimmed = String(jumpValue ?? '').trim()
    if (!trimmed) {
      setJumpDraft(null)
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 1) {
      setJumpDraft(null)
      return
    }
    goTo(Math.floor(parsed))
  }

  const windowPages = buildPageWindow(safePage, pageCount)

  return (
    <div className={`pagination-bar ${className}`.trim()}>
      <div className="pagination-bar-meta">
        <label className="pagination-bar-size">
          <span className="sr-only">Rows per page</span>
          <select
            value={safeSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size} / page</option>
            ))}
          </select>
        </label>
        <span className="sub">
          {safeTotal === 0 ? '0 records' : `${start}–${end} of ${safeTotal}`}
        </span>
      </div>

      <div className="pagination-bar-controls">
        <button
          type="button"
          className="ghost-btn"
          disabled={disabled || safePage <= 1}
          onClick={() => goTo(1)}
          aria-label="First page"
        >
          «
        </button>
        <button
          type="button"
          className="ghost-btn"
          disabled={disabled || safePage <= 1}
          onClick={() => goTo(safePage - 1)}
        >
          Previous
        </button>

        {windowPages.map((item) => (
          item === '…' ? (
            <span key={`gap-${item}-${safePage}`} className="pagination-bar-gap" aria-hidden="true">…</span>
          ) : (
            <button
              key={item}
              type="button"
              className={`ghost-btn pagination-bar-page${item === safePage ? ' is-active' : ''}`}
              disabled={disabled || item === safePage}
              onClick={() => goTo(item)}
              aria-current={item === safePage ? 'page' : undefined}
            >
              {item}
            </button>
          )
        ))}

        <button
          type="button"
          className="ghost-btn"
          disabled={disabled || safePage >= pageCount}
          onClick={() => goTo(safePage + 1)}
        >
          Next
        </button>
        <button
          type="button"
          className="ghost-btn"
          disabled={disabled || safePage >= pageCount}
          onClick={() => goTo(pageCount)}
          aria-label="Last page"
        >
          »
        </button>

        <form className="pagination-bar-jump" onSubmit={submitJump}>
          <label>
            <span className="sr-only">Go to page</span>
            <span className="sub">Page</span>
            <input
              type="number"
              min={1}
              max={pageCount}
              value={jumpValue}
              disabled={disabled}
              onChange={(event) => setJumpDraft(event.target.value)}
              aria-label="Go to page"
            />
            <span className="sub">of {pageCount}</span>
          </label>
          <button type="submit" className="ghost-btn" disabled={disabled}>Go</button>
        </form>
      </div>
    </div>
  )
}

function buildPageWindow(page, pageCount) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }
  const pages = new Set([1, pageCount, page, page - 1, page + 1, page - 2, page + 2])
  const sorted = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b)
  const result = []
  for (let index = 0; index < sorted.length; index += 1) {
    if (index > 0 && sorted[index] - sorted[index - 1] > 1) {
      result.push('…')
    }
    result.push(sorted[index])
  }
  return result
}
