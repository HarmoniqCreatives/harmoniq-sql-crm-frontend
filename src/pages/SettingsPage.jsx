import { useEffect, useState } from 'react'
import {
  createCatalogItem,
  deleteCatalogItem,
  getCompany,
  listCatalog,
  readApiError,
  updateCatalogItem,
  updateCompany,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, perm } from '../auth/permissions'
import { Toast } from '../components/Toast'

const KIND = {
  status: 'STATUS',
  tag: 'TAG',
  activity: 'ACTIVITY',
}

const TONE_CHOICES = [
  { value: 'green', label: 'Green' },
  { value: 'red', label: 'Red' },
  { value: 'amber', label: 'Amber' },
  { value: 'blue', label: 'Blue' },
]

const TIMEZONES = [
  { value: 'Asia/Dubai', label: 'Asia/Dubai' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata' },
  { value: 'Asia/Karachi', label: 'Asia/Karachi' },
]

/**
 * Company Settings: catalog chips (status / tag / activity) + timezone / base currency.
 * Workflows mirror legacy SettingsPage; styling uses Harmoniq admin tokens.
 */
export function SettingsPage() {
  const { user: viewer } = useAuth()
  const canManage = hasPermission(viewer, perm.settingsManage)
  const canView = canManage || hasPermission(viewer, perm.leadsView)

  const [items, setItems] = useState([])
  const [company, setCompany] = useState(null)
  const [timezone, setTimezone] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState(null)

  async function load() {
    const [statusPayload, tagPayload, activityPayload, companyPayload] = await Promise.all([
      listCatalog({ kind: KIND.status, includeInactive: canManage ? true : undefined }),
      listCatalog({ kind: KIND.tag, includeInactive: canManage ? true : undefined }),
      listCatalog({ kind: KIND.activity, includeInactive: canManage ? true : undefined }),
      getCompany(),
    ])
    setItems([
      ...(statusPayload.data.items || []),
      ...(tagPayload.data.items || []),
      ...(activityPayload.data.items || []),
    ])
    setCompany(companyPayload.data.company)
    setTimezone(companyPayload.data.company.timezone)
    setBaseCurrency(companyPayload.data.company.baseCurrency)
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
        await load()
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
  }, [canView, canManage])

  async function saveCompany(event) {
    event.preventDefault()
    if (!canManage) {
      return
    }
    setError('')
    try {
      const payload = await updateCompany({ timezone, baseCurrency })
      setCompany(payload.data.company)
      setNotice(payload.data.message)
    } catch (saveError) {
      setError(readApiError(saveError))
    }
  }

  async function setActive(item, isActive) {
    if (!canManage) {
      return
    }
    setError('')
    try {
      await updateCatalogItem(item.id, { isActive })
      await load()
    } catch (activeError) {
      setError(readApiError(activeError))
    }
  }

  async function removeItem(item) {
    if (!canManage || item.isSystem) {
      return
    }
    if (!window.confirm(`Delete “${item.name}”? This cannot be undone.`)) {
      return
    }
    setError('')
    try {
      const payload = await deleteCatalogItem(item.id)
      setNotice(payload.data.message)
      await load()
    } catch (deleteError) {
      setError(readApiError(deleteError))
    }
  }

  if (!canView) {
    return <div className="admin-panel"><p className="empty-state">You do not have permission to view settings.</p></div>
  }

  return (
    <div>
      <Toast notice={notice} error={error} onClear={() => { setNotice(''); setError('') }} />
      <div className="admin-toolbar">
        <div>
          <h3 style={{ margin: 0 }}>Settings</h3>
          <p className="sub" style={{ margin: '0.25rem 0 0' }}>
            Manage shared statuses, tags, activity types and company defaults.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="admin-panel">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : (
        <div className="settings-grid">
          <CatalogCard
            title="Lead statuses"
            kind={KIND.status}
            items={items}
            canManage={canManage}
            actionLabel="Add status"
            note="System statuses can be deactivated but not deleted."
            onAdd={() => setEditor({ kind: KIND.status, item: null })}
            onEdit={(item) => setEditor({ kind: KIND.status, item })}
            onActive={setActive}
            onDelete={removeItem}
          />
          <CatalogCard
            title="Lead tags"
            kind={KIND.tag}
            items={items}
            canManage={canManage}
            actionLabel="Add tag"
            note=""
            onAdd={() => setEditor({ kind: KIND.tag, item: null })}
            onEdit={(item) => setEditor({ kind: KIND.tag, item })}
            onActive={setActive}
            onDelete={removeItem}
          />
          <CatalogCard
            title="Activity types"
            kind={KIND.activity}
            items={items}
            canManage={canManage}
            actionLabel="Add activity type"
            note=""
            onAdd={() => setEditor({ kind: KIND.activity, item: null })}
            onEdit={(item) => setEditor({ kind: KIND.activity, item })}
            onActive={setActive}
            onDelete={removeItem}
          />
          <div className="admin-panel">
            <h3 style={{ marginTop: 0 }}>Company defaults</h3>
            <form className="form-grid" onSubmit={saveCompany}>
              <div className="field">
                <label htmlFor="company-timezone">Timezone</label>
                <select
                  id="company-timezone"
                  value={timezone}
                  disabled={!canManage}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {TIMEZONES.map((row) => (
                    <option key={row.value} value={row.value}>{row.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="company-currency">Base currency</label>
                <select
                  id="company-currency"
                  value={baseCurrency}
                  disabled={!canManage}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                >
                  {(company?.enabledCurrencies || []).map((code) => (
                    <option key={code} value={code}>{currencyLabel(code)}</option>
                  ))}
                </select>
              </div>
              {canManage ? (
                <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
                  <button type="submit" className="primary-btn">Save settings</button>
                </div>
              ) : (
                <p className="sub">You can view company defaults but cannot change them.</p>
              )}
            </form>
          </div>
        </div>
      )}

      {editor && canManage ? (
        <CatalogDialog
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={async (message) => {
            setEditor(null)
            setNotice(message)
            await load()
          }}
          onError={setError}
        />
      ) : null}
    </div>
  )
}

function CatalogCard({
  title,
  kind,
  items,
  canManage,
  actionLabel,
  note,
  onAdd,
  onEdit,
  onActive,
  onDelete,
}) {
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const query = search.trim().toLowerCase()
  const visible = items.filter((item) => {
    if (item.kind !== kind) {
      return false
    }
    if (!showInactive && !item.isActive) {
      return false
    }
    if (!query) {
      return true
    }
    return item.name.toLowerCase().includes(query)
  })

  return (
    <div className="admin-panel">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div className="field" style={{ marginBottom: '0.75rem' }}>
        <label htmlFor={`${kind}-search`}>Search</label>
        <input
          id={`${kind}-search`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name"
        />
      </div>
      <label className="sub" style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Show inactive
      </label>
      <div className="chip-row">
        {visible.length === 0 ? <p className="empty-state">No items.</p> : null}
        {visible.map((item) => (
          <span key={item.id} className={item.isActive ? 'chip' : 'chip chip-inactive'}>
            <button
              type="button"
              className="chip-name"
              onClick={() => canManage && onEdit(item)}
              disabled={!canManage}
              title={canManage ? 'Edit' : item.name}
            >
              {kind === KIND.tag ? <span className={`pill tone-${item.tone || 'none'}`}>{item.name}</span> : item.name}
            </button>
            {canManage && item.isActive ? (
              <button type="button" className="chip-remove" aria-label="Deactivate" onClick={() => onActive(item, false)}>×</button>
            ) : null}
            {canManage && !item.isActive ? (
              <button type="button" className="ghost-btn" onClick={() => onActive(item, true)}>Activate</button>
            ) : null}
            {canManage && !item.isSystem ? (
              <button type="button" className="danger-btn" onClick={() => onDelete(item)}>Delete</button>
            ) : null}
          </span>
        ))}
      </div>
      {canManage ? (
        <button type="button" className="primary-btn" style={{ marginTop: '0.75rem' }} onClick={onAdd}>
          {actionLabel}
        </button>
      ) : null}
      {note ? <p className="sub" style={{ marginTop: '0.75rem' }}>{note}</p> : null}
    </div>
  )
}

function CatalogDialog({ editor, onClose, onSaved, onError }) {
  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState('1')
  const [tone, setTone] = useState('green')
  const [busy, setBusy] = useState(false)
  const isTag = editor.kind === KIND.tag
  const isEdit = Boolean(editor.item)

  useEffect(() => {
    if (editor.item) {
      setName(editor.item.name)
      setSortOrder(String(editor.item.sortOrder))
      setTone(editor.item.tone || 'green')
    } else {
      setName('')
      setSortOrder('1')
      setTone('green')
    }
  }, [editor])

  async function onSubmit(event) {
    event.preventDefault()
    if (!name.trim()) {
      onError('Name is required.')
      return
    }
    setBusy(true)
    try {
      if (isEdit) {
        const order = Number(sortOrder)
        if (!Number.isInteger(order) || order < 1) {
          onError('Enter a display order of 1 or more.')
          return
        }
        const body = { name: name.trim(), sortOrder: order }
        if (isTag) {
          body.tone = tone
        }
        const payload = await updateCatalogItem(editor.item.id, body)
        await onSaved(payload.data.message)
        return
      }
      const body = { kind: editor.kind, name: name.trim() }
      if (isTag) {
        body.tone = tone
      }
      const payload = await createCatalogItem(body)
      await onSaved(payload.data.message)
    } catch (submitError) {
      onError(readApiError(submitError))
    } finally {
      setBusy(false)
    }
  }

  let title = isEdit ? 'Edit status' : 'Add status'
  if (editor.kind === KIND.tag) {
    title = isEdit ? 'Edit tag' : 'Add tag'
  } else if (editor.kind === KIND.activity) {
    title = isEdit ? 'Edit activity type' : 'Add activity type'
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3>{title}</h3>
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="catalog-name">Name</label>
            <input id="catalog-name" value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
          </div>
          {isEdit ? (
            <div className="field">
              <label htmlFor="catalog-order">Display order</label>
              <input id="catalog-order" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} disabled={busy} />
            </div>
          ) : null}
          {isTag ? (
            <div className="field">
              <label htmlFor="catalog-tone">Tag color</label>
              <select id="catalog-tone" value={tone} onChange={(e) => setTone(e.target.value)} disabled={busy}>
                {TONE_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>{choice.label}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function currencyLabel(code) {
  if (code === 'AED') return 'AED — UAE Dirham'
  if (code === 'INR') return 'INR — Indian Rupee'
  if (code === 'PKR') return 'PKR — Pakistani Rupee'
  if (code === 'USD') return 'USD — US Dollar'
  if (code === 'EUR') return 'EUR — Euro'
  return code
}
