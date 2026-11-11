import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  assignLead,
  createLead,
  deleteLead,
  getCompany,
  getLead,
  listCatalog,
  listLeads,
  listUsers,
  readApiError,
  updateLead,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, perm } from '../auth/permissions'
import { Toast } from '../components/Toast'
import {
  actionShapes,
  errors,
  feedbackOptions,
  historyFilters,
  messages,
  propertyOptions,
  purposeOptions,
  readinessOptions,
  sourceOptions,
} from './leads/leadCopy'
import { isEmail, isPastDateValue, normalizeEmail, todayDateValue } from './leads/leadHelpers'

const pageSize = 20

/**
 * Lead dialog shell. Uses dedicated `leads-modal-*` classes so admin.css
 * `.modal-card { padding }` and lower z-index cannot flatten the layout.
 */
function HarmoniqModal({ open, title, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) {
      return undefined
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return createPortal(
    <div className="leads-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`leads-modal-card ${wide ? 'is-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leads-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="leads-modal-head">
          <h2 id="leads-modal-title">{title}</h2>
          <button type="button" className="ghost-btn leads-modal-close" onClick={onClose} aria-label={messages.close}>
            ×
          </button>
        </div>
        <div className="leads-modal-body">{children}</div>
        {footer ? <div className="leads-modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

/** Stroke icon for lead row actions. */
function ActionIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="action-svg" focusable="false">
      {actionShapes[name].map((shape) => (
        <path key={shape} d={shape} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

/**
 * Action control with a portaled tooltip so `.data-wrap { overflow-x: auto }`
 * cannot clip the label (overflow-x non-visible forces overflow-y to auto).
 */
function LeadAction({ label, className = '', disabled = false, href, target, rel, onClick, children }) {
  const tipId = useId()
  const [tip, setTip] = useState(null)

  function placeTip(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const preferAbove = rect.top > 40
    setTip({
      text: label,
      x: rect.left + rect.width / 2,
      y: preferAbove ? rect.top - 8 : rect.bottom + 8,
      place: preferAbove ? 'above' : 'below',
    })
  }

  function clearTip() {
    setTip(null)
  }

  const shared = {
    className: `lead-action ${className}`.trim(),
    'aria-label': label,
    'aria-describedby': tip ? tipId : undefined,
    onMouseEnter: placeTip,
    onMouseLeave: clearTip,
    onFocus: placeTip,
    onBlur: clearTip,
  }

  const tooltip = tip
    ? createPortal(
      <span
        id={tipId}
        role="tooltip"
        className={`lead-action-tooltip is-${tip.place}`}
        style={{ left: `${tip.x}px`, top: `${tip.y}px` }}
      >
        {tip.text}
      </span>,
      document.body,
    )
    : null

  if (href && !disabled) {
    return (
      <>
        <a {...shared} href={href} target={target} rel={rel}>{children}</a>
        {tooltip}
      </>
    )
  }

  return (
    <>
      <button type="button" {...shared} disabled={disabled} onClick={onClick}>{children}</button>
      {tooltip}
    </>
  )
}

// Exists so the directory pager can show the current slice, such as 1–20 of 24.
function pageRange(page, limit, total) {
  if (total === 0) {
    return `0 ${messages.pageOf} 0`
  }
  const start = (page - 1) * limit + 1
  let end = page * limit
  if (end > total) {
    end = total
  }
  return `${start}–${end} ${messages.pageOf} ${total}`
}

// Exists so a stored choice can be shown with its readable label.
function labelFor(options, value) {
  const match = options.find((option) => option.value === value)
  if (!match) {
    return value
  }
  return match.label
}

// Exists so lead status and tag choices hide items that were turned off in settings.
function activeCatalogItems(items) {
  return items.filter((item) => item.isActive === true)
}

// Exists so a follow-up time can be shown without treating it as an activity record.
function formatFollowUp(value) {
  if (!value) {
    return messages.notScheduled
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return messages.notScheduled
  }
  const day = date.toISOString().slice(0, 10)
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${day} ${time} · ${messages.followUpLabel}`
}

// Exists so a saved note or activity can show its date and time.
function formatStamp(value) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const day = date.toISOString().slice(0, 10)
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${day} ${time}`
}

// Exists so the history filters skip transfers and scheduled activities.
function isLeadActivity(item) {
  if (item.kind === messages.historyKindTransfer) {
    return true
  }
  if (item.kind === messages.historyKindActivity) {
    return true
  }
  return false
}

// Exists so All shows saved notes and feedback, while Calls, WhatsApp, and Email stay empty.
function matchesHistoryFilter(item, filter) {
  if (isLeadActivity(item)) {
    return false
  }
  if (filter === messages.historyFilterAll) {
    return true
  }
  return item.kind === filter
}

// Exists so feedback history uses the same type labels as the feedback form.
function historyEntryText(item) {
  if (item.kind === messages.historyKindFeedback) {
    return `${labelFor(feedbackOptions, item.detail)}: ${item.text}`
  }
  return item.text
}

// Exists so an open tag menu closes when the pointer lands outside it.
function useCloseOnOutside(open, containerRef, onClose) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open) {
      return undefined
    }
    function onPointerDown(event) {
      const container = containerRef.current
      if (!container) {
        return
      }
      if (container.contains(event.target)) {
        return
      }
      onCloseRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, containerRef])
}

/**
 * Lead directory: filters, paging, create/edit, feedback, notes, history, schedule, transfer.
 * API responses use `{ data: { ... } }` from the Harmoniq client.
 */
export function LeadsPage() {
  const { user: viewer } = useAuth()
  const canView = hasPermission(viewer, perm.leadsView)
  const canCreate = hasPermission(viewer, perm.leadsCreate)
  const canEdit = hasPermission(viewer, perm.leadsEdit)
  const canAssign = hasPermission(viewer, perm.leadsAssign)
  const canDelete = hasPermission(viewer, perm.leadsDelete)

  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [search, setSearch] = useState('')
  const [statusId, setStatusId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [tagId, setTagId] = useState('')
  const [statuses, setStatuses] = useState([])
  const [tags, setTags] = useState([])
  const [activityTypes, setActivityTypes] = useState([])
  const [agents, setAgents] = useState([])
  const [companyCurrency, setCompanyCurrency] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [feedbackLead, setFeedbackLead] = useState(null)
  const [noteLead, setNoteLead] = useState(null)
  const [historyLead, setHistoryLead] = useState(null)
  const [scheduleLead, setScheduleLead] = useState(null)
  const [transferLead, setTransferLead] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [tagMenuId, setTagMenuId] = useState('')
  const tagMenuRef = useRef(null)
  useCloseOnOutside(tagMenuId !== '', tagMenuRef, () => setTagMenuId(''))

  // Exists so filters and paging reuse one lead request.
  function leadParams(nextPage) {
    const params = {
      page: nextPage,
      limit: pageSize,
    }
    if (search.trim()) {
      params.search = search.trim()
    }
    if (statusId) {
      params.statusId = statusId
    }
    if (agentId) {
      params.agentId = agentId
    }
    if (tagId) {
      params.tagId = tagId
    }
    return params
  }

  // Exists so the table reads one page from the server.
  async function loadLeads(nextPage) {
    const payload = await listLeads(leadParams(nextPage))
    setLeads(payload.data.leads || [])
    setTotal(payload.data.total || 0)
    setPageNumber(payload.data.page || nextPage)
  }

  useEffect(() => {
    let active = true
    async function start() {
      if (!canView) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const [statusPayload, tagPayload, activityPayload, companyPayload] = await Promise.all([
          listCatalog({ kind: messages.kindStatus }),
          listCatalog({ kind: messages.kindTag }),
          listCatalog({ kind: messages.kindActivity }),
          getCompany(),
        ])
        if (active) {
          setStatuses(activeCatalogItems(statusPayload.data.items || []))
          setTags(activeCatalogItems(tagPayload.data.items || []))
          setActivityTypes(activeCatalogItems(activityPayload.data.items || []))
          if (companyPayload.data.company && companyPayload.data.company.baseCurrency) {
            setCompanyCurrency(companyPayload.data.company.baseCurrency)
          }
        }
        try {
          const userPayload = await listUsers({ limit: 50 })
          const people = (userPayload.data.users || []).filter((user) => {
            if (user.recordType === 'invitation') {
              return false
            }
            return user.status === messages.statusActive
          })
          if (active) {
            setAgents(people)
          }
        } catch (userError) {
          if (userError?.response?.status !== 403) {
            throw userError
          }
        }
        await loadLeads(1)
      } catch (loadError) {
        if (active) {
          setError(readApiError(loadError))
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    start()
    return () => {
      active = false
    }
  }, [canView])

  // Exists so a filter search starts again at the first page.
  async function applyFilters(event) {
    event.preventDefault()
    setError('')
    try {
      await loadLeads(1)
    } catch (filterError) {
      setError(readApiError(filterError))
    }
  }

  // Exists so a status chosen in the row is saved and a failed save puts the old status back.
  async function changeStatus(lead, nextStatusId) {
    setError('')
    try {
      const payload = await updateLead(lead.id, { statusId: nextStatusId })
      setNotice(payload.data.message)
      await loadLeads(pageNumber)
    } catch (statusError) {
      setError(readApiError(statusError))
      await loadLeads(pageNumber)
    }
  }

  // Exists so choosing or clearing a tag in the row saves the full tag list.
  async function changeTags(lead, nextTagIds) {
    setError('')
    try {
      const payload = await updateLead(lead.id, { tagIds: nextTagIds })
      setNotice(payload.data.message)
      await loadLeads(pageNumber)
    } catch (tagError) {
      setError(readApiError(tagError))
    }
  }

  // Exists so Edit opens the create form with the lead loaded from the server.
  async function openEdit(lead) {
    setTagMenuId('')
    setError('')
    try {
      const payload = await getLead(lead.id)
      setCreateOpen(false)
      setEditing(payload.data.lead)
    } catch (editError) {
      setError(readApiError(editError))
    }
  }

  // Exists so confirming delete removes the lead from the current page.
  async function confirmDelete() {
    if (!deleteTarget) {
      return
    }
    setError('')
    try {
      const payload = await deleteLead(deleteTarget.id)
      const removedId = deleteTarget.id
      setDeleteTarget(null)
      setNotice(payload.data.message)
      let nextPage = pageNumber
      if (leads.length === 1) {
        if (pageNumber > 1) {
          nextPage = pageNumber - 1
        }
      }
      await loadLeads(nextPage)
      if (editing && editing.id === removedId) {
        setEditing(null)
      }
    } catch (deleteError) {
      setError(readApiError(deleteError))
    }
  }

  const hasPrevious = pageNumber > 1
  const hasNext = pageNumber * pageSize < total

  if (!viewer) {
    return <div className="admin-panel leads-page-shell"><p className="sub">{messages.signInRequired}</p></div>
  }

  if (!canView) {
    return <div className="admin-panel leads-page-shell"><p className="empty-state">{messages.noPermissionLeads}</p></div>
  }

  let body = <p className="sub">{messages.loading}</p>
  if (!loading) {
    if (leads.length === 0) {
      if (error) {
        body = (
          <button type="button" className="ghost-btn" onClick={() => loadLeads(pageNumber).catch((retryError) => setError(readApiError(retryError)))}>
            {messages.retry}
          </button>
        )
      } else {
        body = <p className="sub">{messages.noLeads}</p>
      }
    } else {
      body = (
        <div className="data-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th><input type="checkbox" disabled aria-label={messages.selectRows} /></th>
                <th>{messages.leadContact}</th>
                <th>{messages.propertyInterest}</th>
                <th>{messages.leadCreatedAt}</th>
                <th>{messages.leadCampaign}</th>
                <th>{messages.originallyAssignedTo}</th>
                <th>{messages.currentlyAssignedTo}</th>
                <th>{messages.leadStatus}</th>
                <th>{messages.tagsColumn}</th>
                <th>{messages.nextActivity}</th>
                <th>{messages.actionColumn}</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                let primaryName = messages.noneAgent
                if (lead.primaryAgent) {
                  primaryName = lead.primaryAgent.name
                }
                let originalName = messages.noneAgent
                if (lead.originalPrimaryAgent) {
                  originalName = lead.originalPrimaryAgent.name
                }
                let secondaryName = ''
                if (lead.secondaryAgent) {
                  secondaryName = `${messages.secondaryPrefix}: ${lead.secondaryAgent.name}`
                }
                let campaignName = '—'
                if (lead.campaignName) {
                  campaignName = lead.campaignName
                }
                let statusName = ''
                if (lead.status) {
                  statusName = lead.status.name
                }
                const propertyLine = [lead.location, labelFor(purposeOptions, lead.purpose)].filter((part) => part).join(' · ')
                const areaLine = [lead.builtUpArea, labelFor(readinessOptions, lead.readiness)].filter((part) => part).join(' · ')
                return (
                  <tr key={lead.id}>
                    <td><input type="checkbox" disabled aria-label={lead.name} /></td>
                    <td className="lead-contact">
                      <strong>{lead.name}</strong>
                      <div className="lead-sub">{lead.phone}</div>
                      <div className="lead-sub">{lead.email}</div>
                      <div className="lead-sub">{lead.label} · {labelFor(sourceOptions, lead.source)}</div>
                    </td>
                    <td className="lead-property">
                      <strong>{labelFor(propertyOptions, lead.propertyType)}</strong>
                      <div className="lead-sub">{propertyLine}</div>
                      <div className="lead-sub">{areaLine}</div>
                    </td>
                    <td>{formatStamp(lead.createdAt)}</td>
                    <td>{campaignName}</td>
                    <td>{originalName}</td>
                    <td>
                      <div>{primaryName}</div>
                      {secondaryName ? <div className="lead-sub">{secondaryName}</div> : null}
                    </td>
                    <td>
                      {canEdit ? (
                        <select aria-label={messages.leadStatus} value={lead.status ? lead.status.id : ''} onChange={(event) => changeStatus(lead, event.target.value)}>
                          {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                        </select>
                      ) : (
                        <select disabled value={statusName}>
                          <option>{statusName}</option>
                        </select>
                      )}
                    </td>
                    <td className="leads-tags-cell">
                      <div className="leads-tag-menu" ref={tagMenuId === lead.id ? tagMenuRef : null}>
                        <div className="chip-row">
                          {lead.tags.map((tag) => <span key={tag.id} className={`pill tone-${tag.tone || 'none'}`}>{tag.name}</span>)}
                          <button
                            type="button"
                            className="chip-remove"
                            disabled={!canEdit}
                            aria-label={messages.customerTags}
                            aria-expanded={tagMenuId === lead.id}
                            onClick={() => setTagMenuId(tagMenuId === lead.id ? '' : lead.id)}
                          >
                            +
                          </button>
                        </div>
                        {canEdit && tagMenuId === lead.id ? (
                          <ul className="tag-dropdown-menu" role="listbox" aria-multiselectable="true">
                            {tags.map((tag) => {
                              const selected = lead.tags.some((item) => item.id === tag.id)
                              return (
                                <li key={tag.id}>
                                  <button
                                    type="button"
                                    role="option"
                                    className={selected ? 'tag-option tag-option-selected' : 'tag-option'}
                                    aria-selected={selected}
                                    onClick={() => {
                                      const ids = lead.tags.map((item) => item.id)
                                      const nextIds = selected ? ids.filter((id) => id !== tag.id) : ids.concat(tag.id)
                                      changeTags(lead, nextIds)
                                    }}
                                  >
                                    {tag.name}
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        ) : null}
                      </div>
                    </td>
                    <td>{formatFollowUp(lead.nextFollowUpAt)}</td>
                    <td className="leads-actions-cell">
                      <LeadRowActions
                        lead={lead}
                        canEdit={canEdit}
                        canAssign={canAssign}
                        canDelete={canDelete}
                        onFeedback={(row) => {
                          setTagMenuId('')
                          setFeedbackLead(row)
                        }}
                        onNotes={(row) => {
                          setTagMenuId('')
                          setNoteLead(row)
                        }}
                        onHistory={(row) => {
                          setTagMenuId('')
                          setHistoryLead(row)
                        }}
                        onSchedule={(row) => {
                          setTagMenuId('')
                          setScheduleLead(row)
                        }}
                        onTransfer={(row) => {
                          setTagMenuId('')
                          setTransferLead(row)
                        }}
                        onEdit={openEdit}
                        onDelete={(row) => {
                          setTagMenuId('')
                          setDeleteTarget(row)
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
    }
  }

  return (
    <div className="leads-page-shell">
      <Toast notice={notice} error={error} onClear={() => { setNotice(''); setError('') }} />

      <div className="leads-page-head">
        <h1 className="leads-page-title">{messages.allLeads}</h1>
        <div className="leads-page-actions">
          <button type="button" className="ghost-btn" disabled>{messages.importCsv}</button>
          <button type="button" className="ghost-btn" disabled title="Phase 3 — export not implemented">{messages.exportCsv}</button>
          {canCreate ? <button type="button" className="primary-btn" onClick={() => setCreateOpen(true)}>{messages.addLead}</button> : null}
        </div>
      </div>

      <div className="admin-panel leads-filters-panel">
        <form className="filters" onSubmit={applyFilters}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={messages.searchLeads} />
          <select value={statusId} onChange={(event) => setStatusId(event.target.value)}>
            <option value="">{messages.allStatuses}</option>
            {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
          </select>
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            <option value="">{messages.allAgents}</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
          <select value={tagId} onChange={(event) => setTagId(event.target.value)}>
            <option value="">{messages.allTags}</option>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
          <button type="submit" className="ghost-btn">{messages.searchAction}</button>
        </form>
        <div className="leads-toolbar-row">
          <strong>{messages.allLeads} <span className="lead-count">{total}</span></strong>
          <span className="lead-muted">{messages.selectRows}</span>
        </div>
        {body}
        <div className="pager">
          <button type="button" className="ghost-btn" disabled={!hasPrevious} onClick={() => loadLeads(pageNumber - 1).catch((pageError) => setError(readApiError(pageError)))}>{messages.previousPage}</button>
          <span className="sub">{pageNumber}</span>
          <button type="button" className="ghost-btn" disabled={!hasNext} onClick={() => loadLeads(pageNumber + 1).catch((pageError) => setError(readApiError(pageError)))}>{messages.nextPage}</button>
          <span className="sub">{pageRange(pageNumber, pageSize, total)}</span>
        </div>
      </div>

      <CreateLeadDialog
        open={createOpen || Boolean(editing)}
        record={editing}
        statuses={statuses}
        tags={tags}
        agents={agents}
        companyCurrency={companyCurrency}
        onClose={() => {
          setCreateOpen(false)
          setEditing(null)
        }}
        onCreated={async (msg) => {
          const stayOnPage = Boolean(editing)
          setCreateOpen(false)
          setEditing(null)
          setNotice(msg)
          if (stayOnPage) {
            await loadLeads(pageNumber)
            return
          }
          await loadLeads(1)
        }}
      />
      <FeedbackDialog
        lead={feedbackLead}
        onClose={() => setFeedbackLead(null)}
        onSaved={async (msg, lead) => {
          setNotice(msg)
          setFeedbackLead(lead)
          await loadLeads(pageNumber)
        }}
      />
      <NoteDialog
        lead={noteLead}
        onClose={() => setNoteLead(null)}
        onSaved={async (msg, lead) => {
          setNotice(msg)
          setNoteLead(lead)
          await loadLeads(pageNumber)
        }}
      />
      <HistoryDialog
        lead={historyLead}
        onClose={() => setHistoryLead(null)}
      />
      <ScheduleDialog
        lead={scheduleLead}
        activityTypes={activityTypes}
        agents={agents}
        onClose={() => setScheduleLead(null)}
        onSaved={async (msg, lead) => {
          setNotice(msg)
          setScheduleLead(lead)
          await loadLeads(pageNumber)
        }}
      />
      <TransferDialog
        lead={transferLead}
        agents={agents}
        onClose={() => setTransferLead(null)}
        onSaved={async (msg) => {
          setTransferLead(null)
          setNotice(msg)
          await loadLeads(pageNumber)
        }}
      />
      <HarmoniqModal
        open={Boolean(deleteTarget)}
        title={messages.deleteLeadTitle}
        onClose={() => setDeleteTarget(null)}
        footer={(
          <>
            <button type="button" className="ghost-btn" onClick={() => setDeleteTarget(null)}>{messages.cancel}</button>
            <button type="button" className="primary-btn" onClick={confirmDelete}>{messages.deleteLeadAction}</button>
          </>
        )}
      >
        <p>{messages.deleteLeadWarning}</p>
      </HarmoniqModal>
    </div>
  )
}

// Exists so the closed tag control can show the names that are already chosen.
function selectedTagLabel(tagList, tagIds) {
  const names = []
  for (const tag of tagList) {
    if (tagIds.includes(tag.id)) {
      names.push(tag.name)
    }
  }
  if (names.length === 0) {
    return messages.selectTags
  }
  return names.join(', ')
}

// Exists so an existing follow-up can fill the date and time fields.
function splitFollowUp(value) {
  if (!value) {
    return { date: '', time: '' }
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return { date: '', time: '' }
  }
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  return {
    date: `${parsed.getFullYear()}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  }
}

// Exists so create and edit share one form, and edit does not change the assigned agents.
function CreateLeadDialog({ open, record, statuses, tags, agents, companyCurrency, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState(messages.sourceManualValue)
  const [statusId, setStatusId] = useState('')
  const [primaryAgentId, setPrimaryAgentId] = useState('')
  const [secondaryAgentId, setSecondaryAgentId] = useState('')
  const [tagIds, setTagIds] = useState([])
  const [tagsOpen, setTagsOpen] = useState(false)
  const tagMenuRef = useRef(null)
  useCloseOnOutside(tagsOpen, tagMenuRef, () => setTagsOpen(false))
  const [feedback, setFeedback] = useState('')
  const [feedbackType, setFeedbackType] = useState(messages.feedbackGeneralValue)
  const [propertyType, setPropertyType] = useState(messages.propertyApartmentValue)
  const [purpose, setPurpose] = useState(messages.purposeBuyValue)
  const [location, setLocation] = useState('')
  const [budget, setBudget] = useState('')
  const [builtUpArea, setBuiltUpArea] = useState('')
  const [carpetArea, setCarpetArea] = useState('')
  const [readiness, setReadiness] = useState(messages.readinessReadyValue)
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setTagsOpen(false)
    setFormError('')
    setSaving(false)
    setFeedback('')
    setFeedbackType(messages.feedbackGeneralValue)
    if (record) {
      setName(record.name)
      setPhone(record.phone)
      setEmail(record.email)
      setSource(record.source)
      if (record.status) {
        setStatusId(record.status.id)
      }
      setTagIds(record.tags.map((tag) => tag.id))
      setPropertyType(record.propertyType)
      setPurpose(record.purpose)
      setLocation(record.location)
      setBudget(record.budget)
      setBuiltUpArea(record.builtUpArea)
      setCarpetArea(record.carpetArea)
      setReadiness(record.readiness)
      const followUp = splitFollowUp(record.nextFollowUpAt)
      setFollowUpDate(followUp.date)
      setFollowUpTime(followUp.time)
      return
    }
    setName('')
    setPhone('')
    setEmail('')
    setPrimaryAgentId('')
    setSecondaryAgentId('')
    setTagIds([])
    setLocation('')
    setBudget('')
    setBuiltUpArea('')
    setCarpetArea('')
    setFollowUpDate('')
    setFollowUpTime('')
    setSource(messages.sourceManualValue)
    setPropertyType(messages.propertyApartmentValue)
    setPurpose(messages.purposeBuyValue)
    setReadiness(messages.readinessReadyValue)
    const initial = statuses.find((status) => status.key === messages.statusKeyNew)
    if (initial) {
      setStatusId(initial.id)
    } else if (statuses.length > 0) {
      setStatusId(statuses[0].id)
    }
  }, [open, record, statuses])

  // Exists so a tag name can be chosen or cleared without closing the menu.
  function toggleTag(id) {
    if (tagIds.includes(id)) {
      setTagIds(tagIds.filter((tid) => tid !== id))
      return
    }
    setTagIds(tagIds.concat(id))
  }

  // Exists so Save sends one create request after the required fields are checked.
  async function onSubmit(event) {
    event.preventDefault()
    if (saving) {
      return
    }
    if (!name.trim()) {
      setFormError(errors.nameRequired)
      return
    }
    if (!phone.trim()) {
      setFormError(errors.phoneRequired)
      return
    }
    const normalizedEmail = normalizeEmail(email)
    if (email.trim()) {
      if (!isEmail(normalizedEmail)) {
        setFormError(errors.emailInvalid)
        return
      }
    }
    const originalFollowUp = record ? splitFollowUp(record.nextFollowUpAt) : null
    let followUpChanged = true
    if (originalFollowUp) {
      if (followUpDate === originalFollowUp.date && followUpTime === originalFollowUp.time) {
        followUpChanged = false
      }
    }
    let nextFollowUpAt = ''
    if (followUpDate) {
      if (followUpChanged) {
        if (isPastDateValue(followUpDate)) {
          setFormError(errors.followUpPast)
          return
        }
      }
      let time = '00:00'
      if (followUpTime) {
        time = followUpTime
      }
      const parsed = new Date(`${followUpDate}T${time}`)
      if (Number.isNaN(parsed.getTime())) {
        setFormError(errors.followUpInvalid)
        return
      }
      nextFollowUpAt = parsed.toISOString()
    } else if (followUpTime) {
      setFormError(errors.followUpInvalid)
      return
    }
    const body = {
      name: name.trim(),
      phone: phone.trim(),
      email: normalizedEmail,
      source,
      statusId,
      tagIds,
      propertyType,
      purpose,
      location: location.trim(),
      budget: budget.trim(),
      builtUpArea: builtUpArea.trim(),
      carpetArea: carpetArea.trim(),
      readiness,
    }
    if (!record) {
      if (primaryAgentId) {
        body.primaryAgentId = primaryAgentId
      }
      if (secondaryAgentId) {
        body.secondaryAgentId = secondaryAgentId
      }
    }
    if (followUpChanged) {
      body.nextFollowUpAt = nextFollowUpAt
    }
    if (feedback.trim()) {
      body.feedback = {
        text: feedback.trim(),
        type: feedbackType,
      }
    }
    setSaving(true)
    setFormError('')
    try {
      let payload
      if (record) {
        payload = await updateLead(record.id, body)
      } else {
        payload = await createLead(body)
      }
      setName('')
      setPhone('')
      setEmail('')
      setTagIds([])
      setTagsOpen(false)
      setFeedback('')
      setFeedbackType(messages.feedbackGeneralValue)
      setLocation('')
      setBudget('')
      setBuiltUpArea('')
      setCarpetArea('')
      setFollowUpDate('')
      setFollowUpTime('')
      await onCreated(payload.data.message)
    } catch (submitError) {
      setFormError(readApiError(submitError))
    } finally {
      setSaving(false)
    }
  }

  const title = record ? messages.editLead : messages.createLead

  return (
    <HarmoniqModal
      open={open}
      title={title}
      onClose={onClose}
      wide
      footer={(
        <>
          <button type="button" className="ghost-btn" onClick={onClose}>{messages.cancel}</button>
          <button type="submit" form="create-lead-form" className="primary-btn" disabled={saving}>{messages.save}</button>
        </>
      )}
    >
      <form id="create-lead-form" onSubmit={onSubmit}>
        {formError ? <p className="auth-error">{formError}</p> : null}
        <h3>{messages.customerDetails}</h3>
        <div className="role-form-row">
          <div className="manage-field">
            <label htmlFor="lead-name">{messages.fullName}</label>
            <input id="lead-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="manage-field">
            <label htmlFor="lead-phone">{messages.leadPhone}</label>
            <input id="lead-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
        </div>
        <div className="role-form-row">
          <div className="manage-field">
            <label htmlFor="lead-email">{messages.leadEmail}</label>
            <input id="lead-email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="manage-field">
            <label htmlFor="lead-source">{messages.leadSource}</label>
            <select id="lead-source" value={source} onChange={(event) => setSource(event.target.value)}>
              {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        <div className="role-form-row">
          <div className="manage-field">
            <label htmlFor="lead-status">{messages.leadStatus}</label>
            <select id="lead-status" value={statusId} onChange={(event) => setStatusId(event.target.value)}>
              {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
            </select>
          </div>
          {record ? null : (
            <div className="manage-field">
              <label htmlFor="lead-primary">{messages.primaryAgent}</label>
              <select id="lead-primary" value={primaryAgentId} onChange={(event) => setPrimaryAgentId(event.target.value)}>
                <option value="">{messages.noneAgent}</option>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="role-form-row">
          {record ? null : (
            <div className="manage-field">
              <label htmlFor="lead-secondary">{messages.secondaryAgent}</label>
              <select id="lead-secondary" value={secondaryAgentId} onChange={(event) => setSecondaryAgentId(event.target.value)}>
                <option value="">{messages.noneAgent}</option>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </div>
          )}
          <div className="manage-field">
            <label id="lead-tags-label" htmlFor="lead-tags">{messages.customerTags}</label>
            <div className="tag-dropdown" ref={tagMenuRef}>
              <button
                id="lead-tags"
                type="button"
                className="tag-dropdown-button"
                aria-haspopup="listbox"
                aria-expanded={tagsOpen}
                onClick={() => setTagsOpen(!tagsOpen)}
              >
                {selectedTagLabel(tags, tagIds)}
              </button>
              {tagsOpen ? (
                <ul className="tag-dropdown-menu" role="listbox" aria-multiselectable="true" aria-labelledby="lead-tags-label">
                  {tags.map((tag) => (
                    <li key={tag.id}>
                      <button
                        type="button"
                        role="option"
                        className={tagIds.includes(tag.id) ? 'tag-option tag-option-selected' : 'tag-option'}
                        aria-selected={tagIds.includes(tag.id)}
                        onClick={() => toggleTag(tag.id)}
                      >
                        {tag.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
        <h3>{messages.realEstateRequirements}</h3>
        <div className="role-form-row">
          <div className="manage-field">
            <label htmlFor="lead-property">{messages.propertyType}</label>
            <select id="lead-property" value={propertyType} onChange={(event) => setPropertyType(event.target.value)}>
              {propertyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="manage-field">
            <label htmlFor="lead-purpose">{messages.buyRent}</label>
            <select id="lead-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)}>
              {purposeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        <div className="role-form-row">
          <div className="manage-field">
            <label htmlFor="lead-location">{messages.preferredLocation}</label>
            <input id="lead-location" value={location} onChange={(event) => setLocation(event.target.value)} />
          </div>
          <div className="manage-field">
            <label htmlFor="lead-budget">{messages.budget}</label>
            <input id="lead-budget" value={budget} placeholder={messages.budgetExample} onChange={(event) => setBudget(event.target.value)} />
            <div className="budget-currency-hint">
              {(record && record.currency) || companyCurrency || '—'}
              <span className="lead-sub"> (company base currency)</span>
            </div>
          </div>
        </div>
        <div className="role-form-row">
          <div className="manage-field">
            <label htmlFor="lead-built">{messages.builtUpArea}</label>
            <input id="lead-built" value={builtUpArea} placeholder={messages.areaExample} onChange={(event) => setBuiltUpArea(event.target.value)} />
          </div>
          <div className="manage-field">
            <label htmlFor="lead-carpet">{messages.carpetArea}</label>
            <input id="lead-carpet" value={carpetArea} placeholder={messages.areaExample} onChange={(event) => setCarpetArea(event.target.value)} />
          </div>
        </div>
        <div className="role-form-row">
          <div className="manage-field">
            <label htmlFor="lead-readiness">{messages.readiness}</label>
            <select id="lead-readiness" value={readiness} onChange={(event) => setReadiness(event.target.value)}>
              {readinessOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="manage-field">
            <label htmlFor="lead-follow-date">{messages.nextFollowUpDate}</label>
            <input id="lead-follow-date" type="date" min={todayDateValue()} value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
          </div>
        </div>
        <div className="manage-field">
          <label htmlFor="lead-follow-time">{messages.followUpTime}</label>
          <input id="lead-follow-time" type="time" value={followUpTime} onChange={(event) => setFollowUpTime(event.target.value)} />
        </div>
        <h3>{messages.customerFeedback}</h3>
        <div className="manage-field">
          <label htmlFor="lead-feedback">{messages.addFeedback}</label>
          <textarea id="lead-feedback" value={feedback} placeholder={messages.feedbackPlaceholder} onChange={(event) => setFeedback(event.target.value)} />
        </div>
        <div className="manage-field">
          <label htmlFor="lead-feedback-type">{messages.feedbackType}</label>
          <select id="lead-feedback-type" value={feedbackType} onChange={(event) => setFeedbackType(event.target.value)}>
            {feedbackOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="manage-field">
          <label>{messages.previousFeedback} ({record && record.feedbacks ? record.feedbacks.length : 0})</label>
          {record && record.feedbacks && record.feedbacks.length > 0 ? (
            <ul>
              {record.feedbacks.map((item) => (
                <li key={`${item.createdAt}-${item.text}`}>{labelFor(feedbackOptions, item.type)}: {item.text}</li>
              ))}
            </ul>
          ) : (
            <p className="feedback-empty">{messages.noFeedbackYet}</p>
          )}
        </div>
      </form>
    </HarmoniqModal>
  )
}

/** Row action strip: call / WA / email / feedback / notes / history / schedule / transfer / edit / delete. */
function LeadRowActions({ lead, canEdit, canAssign, canDelete, onFeedback, onNotes, onHistory, onSchedule, onTransfer, onEdit, onDelete }) {
  const phoneDigits = String(lead.phone || '').replace(/\D/g, '')
  return (
    <div className="leads-icon-actions" role="group" aria-label={messages.actionColumn}>
      <LeadAction label={messages.actionCall} className="is-green" href={lead.phone ? `tel:${lead.phone}` : undefined} disabled={!lead.phone}>
        <ActionIcon name="call" />
      </LeadAction>
      <LeadAction
        label={messages.actionWhatsApp}
        className="is-green"
        href={phoneDigits ? `https://wa.me/${phoneDigits}` : undefined}
        target="_blank"
        rel="noreferrer"
        disabled={!phoneDigits}
      >
        <ActionIcon name="whatsapp" />
      </LeadAction>
      <LeadAction label={messages.leadEmail} href={lead.email ? `mailto:${lead.email}` : undefined} disabled={!lead.email}>
        <ActionIcon name="email" />
      </LeadAction>
      <LeadAction label={messages.actionFeedback} disabled={!canEdit} onClick={() => onFeedback(lead)}>
        <ActionIcon name="feedback" />
      </LeadAction>
      <LeadAction label={messages.leadNotes} disabled={!canEdit} onClick={() => onNotes(lead)}>
        <ActionIcon name="notes" />
      </LeadAction>
      <LeadAction label={messages.actionHistory} onClick={() => onHistory(lead)}>
        <ActionIcon name="history" />
      </LeadAction>
      <LeadAction label={messages.actionSchedule} disabled={!canEdit} onClick={() => onSchedule(lead)}>
        <ActionIcon name="schedule" />
      </LeadAction>
      <LeadAction label={messages.actionTransfer} disabled={!canAssign} onClick={() => onTransfer(lead)}>
        <ActionIcon name="transfer" />
      </LeadAction>
      <LeadAction label={messages.actionEdit} disabled={!canEdit} onClick={() => onEdit(lead)}>
        <ActionIcon name="edit" />
      </LeadAction>
      <LeadAction label={messages.actionDelete} className="is-red" disabled={!canDelete} onClick={() => onDelete(lead)}>
        <ActionIcon name="delete" />
      </LeadAction>
    </div>
  )
}

// Exists so feedback already stored on the lead can be read and one new note can be added.
function FeedbackDialog({ lead, onClose, onSaved }) {
  const [text, setText] = useState('')
  const [feedbackType, setFeedbackType] = useState(messages.feedbackGeneralValue)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!lead) {
      return
    }
    setText('')
    setFeedbackType(messages.feedbackGeneralValue)
    setFormError('')
    setSaving(false)
  }, [lead])

  // Exists so Save feedback appends one note without replacing the notes already stored.
  async function onSubmit(event) {
    event.preventDefault()
    if (!lead) {
      return
    }
    if (saving) {
      return
    }
    if (!text.trim()) {
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = await updateLead(lead.id, {
        feedback: { text: text.trim(), type: feedbackType },
      })
      setText('')
      await onSaved(payload.data.message, payload.data.lead)
    } catch (submitError) {
      setFormError(readApiError(submitError))
    } finally {
      setSaving(false)
    }
  }

  let notes = []
  if (lead && Array.isArray(lead.feedbacks)) {
    notes = lead.feedbacks
  }
  return (
    <HarmoniqModal
      open={Boolean(lead)}
      title={messages.feedbackFor}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="ghost-btn" onClick={onClose}>{messages.cancel}</button>
          <button type="submit" form="lead-feedback-form" className="primary-btn" disabled={saving}>{messages.saveFeedback}</button>
        </>
      )}
    >
      <form id="lead-feedback-form" onSubmit={onSubmit}>
        {formError ? <p className="auth-error">{formError}</p> : null}
        {notes.length === 0 ? <p className="feedback-empty">{messages.noFeedbackRecorded}</p> : (
          <ul>
            {notes.map((item) => (
              <li key={`${item.createdAt}-${item.text}`}>{labelFor(feedbackOptions, item.type)}: {item.text}</li>
            ))}
          </ul>
        )}
        <div className="manage-field">
          <label htmlFor="row-feedback">{messages.addFeedback}</label>
          <textarea id="row-feedback" value={text} placeholder={messages.feedbackPlaceholder} onChange={(event) => setText(event.target.value)} />
        </div>
        <div className="manage-field">
          <label htmlFor="row-feedback-type">{messages.feedbackType}</label>
          <select id="row-feedback-type" value={feedbackType} onChange={(event) => setFeedbackType(event.target.value)}>
            {feedbackOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </form>
    </HarmoniqModal>
  )
}

// Exists so a lead can move to another agent only after the transfer is confirmed.
function TransferDialog({ lead, agents, onClose, onSaved }) {
  const [primaryAgentId, setPrimaryAgentId] = useState('')
  const [secondaryAgentId, setSecondaryAgentId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!lead) {
      return
    }
    setPrimaryAgentId('')
    setSecondaryAgentId('')
    if (lead.secondaryAgent) {
      setSecondaryAgentId(lead.secondaryAgent.id)
    }
    setConfirmed(false)
    setReason('')
    setFormError('')
    setSaving(false)
  }, [lead])

  // Exists so Save sends the new agents and the reason only after the confirmation is checked.
  async function onSubmit(event) {
    event.preventDefault()
    if (!lead) {
      return
    }
    if (saving) {
      return
    }
    if (!confirmed) {
      return
    }
    if (!primaryAgentId) {
      return
    }
    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      setFormError(errors.transferReasonRequired)
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = await assignLead(lead.id, {
        primaryAgentId,
        secondaryAgentId,
        reason: trimmedReason,
      })
      await onSaved(payload.data.message)
    } catch (submitError) {
      setFormError(readApiError(submitError))
    } finally {
      setSaving(false)
    }
  }

  let currentName = messages.noneAgent
  if (lead && lead.primaryAgent) {
    currentName = lead.primaryAgent.name
  }
  return (
    <HarmoniqModal
      open={Boolean(lead)}
      title={messages.transferLead}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="ghost-btn" onClick={onClose}>{messages.cancel}</button>
          <button type="submit" form="lead-transfer-form" className="primary-btn" disabled={saving || !confirmed || !primaryAgentId}>{messages.save}</button>
        </>
      )}
    >
      <form id="lead-transfer-form" onSubmit={onSubmit}>
        {formError ? <p className="auth-error">{formError}</p> : null}
        <div className="manage-field">
          <label htmlFor="transfer-current">{messages.currentPrimary}</label>
          <input id="transfer-current" value={currentName} readOnly />
        </div>
        <div className="manage-field">
          <label htmlFor="transfer-primary">{messages.newPrimary}</label>
          <select id="transfer-primary" value={primaryAgentId} onChange={(event) => setPrimaryAgentId(event.target.value)}>
            <option value="">{messages.noneAgent}</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
        </div>
        <div className="manage-field">
          <label htmlFor="transfer-secondary">{messages.secondaryAgent}</label>
          <select id="transfer-secondary" value={secondaryAgentId} onChange={(event) => setSecondaryAgentId(event.target.value)}>
            <option value="">{messages.noneAgent}</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
        </div>
        <div className="manage-field">
          <label htmlFor="transfer-reason">{messages.transferReason}</label>
          <textarea id="transfer-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        <label className="check-line">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          {messages.transferConfirm}
        </label>
      </form>
    </HarmoniqModal>
  )
}

// Exists so a call note can be saved on the lead and read again later.
function NoteDialog({ lead, onClose, onSaved }) {
  const [text, setText] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!lead) {
      return
    }
    setText('')
    setFormError('')
    setSaving(false)
  }, [lead])

  // Exists so Save sends one note and leaves the notes already stored in place.
  async function onSubmit(event) {
    event.preventDefault()
    if (!lead) {
      return
    }
    if (saving) {
      return
    }
    const trimmed = text.trim()
    if (!trimmed) {
      setFormError(errors.noteRequired)
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = await updateLead(lead.id, { note: trimmed })
      setText('')
      await onSaved(payload.data.message, payload.data.lead)
    } catch (submitError) {
      setFormError(readApiError(submitError))
    } finally {
      setSaving(false)
    }
  }

  let notes = []
  if (lead) {
    if (Array.isArray(lead.notes)) {
      notes = lead.notes
    }
  }
  let title = messages.leadNotes
  if (lead) {
    title = `${messages.leadNotes} — ${lead.name}`
  }
  return (
    <HarmoniqModal
      open={Boolean(lead)}
      title={title}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="ghost-btn" onClick={onClose}>{messages.cancel}</button>
          <button type="submit" form="lead-note-form" className="primary-btn" disabled={saving}>{messages.saveNote}</button>
        </>
      )}
    >
      <form id="lead-note-form" onSubmit={onSubmit}>
        {formError ? <p className="auth-error">{formError}</p> : null}
        {notes.length === 0 ? <p className="feedback-empty">{messages.noNotesYet}</p> : (
          <ul>
            {notes.map((item) => (
              <li key={`${item.createdAt}-${item.text}`}>
                {item.text}
                <span className="sub"> {formatStamp(item.createdAt)} · {item.createdByName}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="manage-field">
          <label htmlFor="lead-note">{messages.callNote}</label>
          <textarea id="lead-note" value={text} onChange={(event) => setText(event.target.value)} />
        </div>
      </form>
    </HarmoniqModal>
  )
}

// Exists so history shows saved records and leaves Calls, WhatsApp, and Email empty.
function HistoryDialog({ lead, onClose }) {
  const [filter, setFilter] = useState(messages.historyFilterAll)

  useEffect(() => {
    if (!lead) {
      return
    }
    setFilter(messages.historyFilterAll)
  }, [lead])

  let history = []
  if (lead) {
    if (Array.isArray(lead.history)) {
      history = lead.history
    }
  }
  const entries = history.filter((item) => matchesHistoryFilter(item, filter))
  const activities = history.filter((item) => isLeadActivity(item))
  let title = messages.leadHistory
  if (lead) {
    title = `${messages.leadHistory} — ${lead.name}`
  }
  return (
    <HarmoniqModal
      open={Boolean(lead)}
      title={title}
      onClose={onClose}
      footer={<button type="button" className="ghost-btn" onClick={onClose}>{messages.close}</button>}
    >
      <div className="history-filters">
        {historyFilters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {entries.length === 0 ? <p className="feedback-empty">{messages.historyEmpty}</p> : (
        entries.map((item) => (
          <div className="history-entry" key={`${item.kind}-${item.createdAt}-${item.text}`}>
            <strong>{historyEntryText(item)}</strong>
            <p className="sub">{formatStamp(item.createdAt)}</p>
          </div>
        ))
      )}
      <h3>{messages.leadActivity}</h3>
      {activities.length === 0 ? <p className="feedback-empty">{messages.noLeadActivity}</p> : (
        activities.map((item) => (
          <div className="history-entry" key={`${item.kind}-${item.createdAt}-${item.text}`}>
            <strong>{item.text}</strong>
            {item.overdue ? <span className="sub"> {messages.overdue}</span> : null}
            <p className="sub">{formatStamp(item.scheduledAt ? item.scheduledAt : item.createdAt)}</p>
          </div>
        ))
      )}
    </HarmoniqModal>
  )
}

// Exists so a callback, meeting, site visit, or follow-up can be stored on the lead.
function ScheduleDialog({ lead, activityTypes, agents, onClose, onSaved }) {
  const [activityTypeId, setActivityTypeId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [activityDate, setActivityDate] = useState('')
  const [activityTime, setActivityTime] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!lead) {
      return
    }
    setActivityTypeId('')
    setAgentId('')
    if (lead.primaryAgent) {
      setAgentId(lead.primaryAgent.id)
    }
    setActivityDate('')
    setActivityTime('')
    setFormError('')
    setSaving(false)
  }, [lead])

  // Exists so Save stores one activity and moves the lead follow-up to that time.
  async function onSubmit(event) {
    event.preventDefault()
    if (!lead) {
      return
    }
    if (saving) {
      return
    }
    if (!activityTypeId) {
      setFormError(errors.scheduleRequired)
      return
    }
    if (!agentId) {
      setFormError(errors.scheduleRequired)
      return
    }
    if (!activityDate) {
      setFormError(errors.scheduleRequired)
      return
    }
    if (!activityTime) {
      setFormError(errors.scheduleRequired)
      return
    }
    if (isPastDateValue(activityDate)) {
      setFormError(errors.followUpPast)
      return
    }
    const parsed = new Date(`${activityDate}T${activityTime}`)
    if (Number.isNaN(parsed.getTime())) {
      setFormError(errors.followUpInvalid)
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = await updateLead(lead.id, {
        activity: {
          activityTypeId,
          agentId,
          scheduledAt: parsed.toISOString(),
        },
      })
      setActivityTypeId('')
      setActivityDate('')
      setActivityTime('')
      await onSaved(payload.data.message, payload.data.lead)
    } catch (submitError) {
      setFormError(readApiError(submitError))
    } finally {
      setSaving(false)
    }
  }

  let saved = []
  if (lead) {
    if (Array.isArray(lead.activities)) {
      saved = lead.activities
    }
  }
  let title = messages.scheduleActivity
  if (lead) {
    title = `${messages.scheduleActivity} — ${lead.name}`
  }
  return (
    <HarmoniqModal
      open={Boolean(lead)}
      title={title}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="ghost-btn" onClick={onClose}>{messages.cancel}</button>
          <button type="submit" form="lead-schedule-form" className="primary-btn" disabled={saving}>{messages.saveActivity}</button>
        </>
      )}
    >
      <form id="lead-schedule-form" onSubmit={onSubmit}>
        {formError ? <p className="auth-error">{formError}</p> : null}
        <div className="role-form-row">
          <div className="manage-field">
            <label htmlFor="activity-type">{messages.activityType}</label>
            <select id="activity-type" value={activityTypeId} onChange={(event) => setActivityTypeId(event.target.value)}>
              <option value="">{messages.chooseOne}</option>
              {activityTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="manage-field">
            <label htmlFor="activity-agent">{messages.assignedAgent}</label>
            <select id="activity-agent" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
              <option value="">{messages.chooseOne}</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </div>
        </div>
        <div className="role-form-row">
          <div className="manage-field">
            <label htmlFor="activity-date">{messages.activityDate}</label>
            <input id="activity-date" type="date" min={todayDateValue()} value={activityDate} onChange={(event) => setActivityDate(event.target.value)} />
          </div>
          <div className="manage-field">
            <label htmlFor="activity-time">{messages.activityTime}</label>
            <input id="activity-time" type="time" value={activityTime} onChange={(event) => setActivityTime(event.target.value)} />
          </div>
        </div>
        {saved.length === 0 ? null : (
          <ul>
            {saved.map((item) => (
              <li key={`${item.createdAt}-${item.scheduledAt}`}>
                {item.activityTypeName} · {item.agentName} · {formatStamp(item.scheduledAt)}
                {item.overdue ? ` · ${messages.overdue}` : ''}
              </li>
            ))}
          </ul>
        )}
      </form>
    </HarmoniqModal>
  )
}
