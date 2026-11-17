import { useEffect, useState } from 'react'
import { api, readApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { hasPermission, perm } from '../../auth/permissions'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function connectionStatusLabel(status) {
  if (status === 'connected') return 'Connected'
  if (status === 'configured') return 'Configured (not verified)'
  if (status === 'error') return 'Error'
  return 'Not connected'
}

function workflowStatusLabel(workflow) {
  if (!workflow) return 'Not ready'
  if (workflow.ready) return `Ready · ${workflow.templateName || 'template bound'}`
  if (!workflow.enabled) return 'Disabled'
  if (workflow.reason === 'binding_missing') return 'Enabled · bind an approved template'
  if (workflow.reason === 'template_not_approved') return 'Enabled · template not approved'
  if (workflow.reason === 'whatsapp_not_ready') return 'Enabled · finish connection first'
  if (workflow.reason === 'sample_template_forbidden') {
    const name = workflow.templateName ? ` (${workflow.templateName})` : ''
    return `Enabled · hello_world cannot be used for W1/W2${name}`
  }
  if (workflow.reason === 'variable_keys_invalid') {
    return 'Enabled · map template variables before use'
  }
  return workflow.reason || 'Not ready'
}

function isWorkflowBindableTemplate(template) {
  if (!template || !template.isEnabled || template.status !== 'APPROVED') {
    return false
  }
  if (String(template.name || '').trim().toLowerCase() === 'hello_world') {
    return false
  }
  const keys = Array.isArray(template.bodyVariableKeys) ? template.bodyVariableKeys : []
  return keys.length === Number(template.placeholderCount || 0)
}

/**
 * Integrations → WhatsApp Integration (Manual Cloud API configuration).
 */
export function WhatsAppIntegrationPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, perm.whatsappManage)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [testing, setTesting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [savingWorkflows, setSavingWorkflows] = useState(false)
  const [syncingTemplates, setSyncingTemplates] = useState(false)
  const [savingTemplateId, setSavingTemplateId] = useState('')
  const [savingBindingKey, setSavingBindingKey] = useState('')
  const [config, setConfig] = useState(null)
  const [templates, setTemplates] = useState([])
  const [allowedVariableKeys, setAllowedVariableKeys] = useState([])
  const [bindings, setBindings] = useState([])
  const [variableDrafts, setVariableDrafts] = useState({})
  const [wabaId, setWabaId] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [testRecipient, setTestRecipient] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  function applyConfig(next) {
    setConfig(next || null)
    setWabaId(next?.wabaId || '')
    setPhoneNumberId(next?.phoneNumberId || '')
    setAccessToken('')
  }

  async function refreshCatalog() {
    const [templatesResponse, bindingsResponse] = await Promise.all([
      api.get('/whatsapp/templates'),
      api.get('/whatsapp/workflow-bindings'),
    ])
    const nextTemplates = templatesResponse.data?.data?.templates || []
    setTemplates(nextTemplates)
    setAllowedVariableKeys(templatesResponse.data?.data?.allowedVariableKeys || [])
    setBindings(bindingsResponse.data?.data?.bindings || [])
    const drafts = {}
    for (const template of nextTemplates) {
      const count = Number(template.placeholderCount || 0)
      const existing = Array.isArray(template.bodyVariableKeys) ? template.bodyVariableKeys : []
      drafts[template.id] = Array.from({ length: count }, (_, index) => existing[index] || '')
    }
    setVariableDrafts(drafts)
  }

  async function refreshConfig() {
    const response = await api.get('/whatsapp/config')
    applyConfig(response.data?.data?.config || null)
  }

  async function refreshAll() {
    await refreshConfig()
    await refreshCatalog()
  }

  useEffect(() => {
    if (!canView) {
      setLoading(false)
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        await refreshAll()
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(readApiError(error))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canView])

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setErrorMessage('')
    setStatusMessage('')
    try {
      const body = {
        wabaId: wabaId.trim(),
        phoneNumberId: phoneNumberId.trim(),
        isActive: true,
      }
      if (accessToken.trim()) {
        body.accessToken = accessToken.trim()
      }
      const response = await api.put('/whatsapp/config/manual', body)
      applyConfig(response.data?.data?.config || null)
      setStatusMessage(response.data?.data?.message || 'WhatsApp configuration saved.')
    } catch (error) {
      setErrorMessage(readApiError(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleVerify() {
    setVerifying(true)
    setErrorMessage('')
    setStatusMessage('')
    try {
      const response = await api.post('/whatsapp/config/verify', {})
      applyConfig(response.data?.data?.config || null)
      setStatusMessage(response.data?.data?.message || 'WhatsApp connection verified.')
    } catch (error) {
      setErrorMessage(readApiError(error))
      try {
        await refreshConfig()
      } catch (_ignore) {
        // Keep form state if refresh fails.
      }
    } finally {
      setVerifying(false)
    }
  }

  async function handleTestMessage() {
    setTesting(true)
    setErrorMessage('')
    setStatusMessage('')
    try {
      const response = await api.post('/whatsapp/config/test-message', {
        recipientPhone: testRecipient.trim(),
      })
      setStatusMessage(response.data?.data?.message || 'WhatsApp test message sent.')
    } catch (error) {
      setErrorMessage(readApiError(error))
    } finally {
      setTesting(false)
    }
  }

  async function handleDisconnect() {
    const confirmed = window.confirm(
      'Disconnect WhatsApp for this company? Message history and audit logs are kept, but the connection will be removed.',
    )
    if (!confirmed) {
      return
    }
    setDisconnecting(true)
    setErrorMessage('')
    setStatusMessage('')
    try {
      const response = await api.post('/whatsapp/disconnect')
      applyConfig(response.data?.data?.config || null)
      setStatusMessage(response.data?.data?.message || 'WhatsApp disconnected.')
    } catch (error) {
      setErrorMessage(readApiError(error))
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleSyncTemplates() {
    setSyncingTemplates(true)
    setErrorMessage('')
    setStatusMessage('Syncing WhatsApp templates from Meta…')
    try {
      const response = await api.post('/whatsapp/templates/sync')
      setStatusMessage(response.data?.data?.message || 'WhatsApp template catalog synced.')
      if (response.data?.data?.config) {
        applyConfig(response.data.data.config)
      } else {
        await refreshConfig()
      }
      await refreshCatalog()
    } catch (error) {
      setStatusMessage('')
      setErrorMessage(readApiError(error))
    } finally {
      setSyncingTemplates(false)
    }
  }

  async function handleSaveTemplate(template, options = {}) {
    setSavingTemplateId(template.id)
    setErrorMessage('')
    setStatusMessage('')
    try {
      const body = {
        bodyVariableKeys: variableDrafts[template.id] || [],
      }
      if (Object.prototype.hasOwnProperty.call(options, 'enable')) {
        body.isEnabled = Boolean(options.enable)
      }
      const response = await api.patch(`/whatsapp/templates/${template.id}`, body)
      setStatusMessage(response.data?.data?.message || 'WhatsApp template settings saved.')
      await refreshCatalog()
      await refreshConfig()
    } catch (error) {
      setErrorMessage(readApiError(error))
    } finally {
      setSavingTemplateId('')
    }
  }

  async function handleSaveBinding(workflowKey, templateId) {
    setSavingBindingKey(workflowKey)
    setErrorMessage('')
    setStatusMessage('')
    try {
      const response = await api.put(`/whatsapp/workflow-bindings/${workflowKey}`, {
        templateId: templateId || null,
      })
      setStatusMessage(response.data?.data?.message || 'WhatsApp workflow binding saved.')
      await refreshCatalog()
      await refreshConfig()
    } catch (error) {
      setErrorMessage(readApiError(error))
    } finally {
      setSavingBindingKey('')
    }
  }

  async function handleWorkflowToggle(field, checked) {
    setSavingWorkflows(true)
    setErrorMessage('')
    setStatusMessage('')
    try {
      const response = await api.patch('/whatsapp/config', { [field]: checked })
      applyConfig(response.data?.data?.config || null)
      setStatusMessage(response.data?.data?.message || 'WhatsApp notification settings updated.')
    } catch (error) {
      setErrorMessage(readApiError(error))
    } finally {
      setSavingWorkflows(false)
    }
  }

  function bindableTemplates() {
    return templates.filter((item) => isWorkflowBindableTemplate(item))
  }

  if (!canView) {
    return (
      <div className="integrations-page">
        <header className="integration-hero">
          <p className="integration-eyebrow">Integrations</p>
          <h1>WhatsApp Integration</h1>
        </header>
        <p className="empty-state">You do not have permission to view WhatsApp integration.</p>
      </div>
    )
  }

  const connectionStatus = config?.connectionStatus || 'not_configured'
  const messagingReady = Boolean(config?.messagingReady)
  const credentialsReady = Boolean(config?.credentialsReady || config?.connected)
  const displayPhone = config?.displayPhoneNumber || ''
  const busy = loading || saving || verifying || testing || disconnecting

  return (
    <div className="integrations-page">
      <header className="integration-hero">
        <div>
          <p className="integration-eyebrow">Integrations</p>
          <h1>WhatsApp Business Cloud API</h1>
          <p className="sub">
            Enter your WhatsApp Business account details manually. Meta Developer App credentials
            stay on the server. Messages always send from your connected Phone Number ID.
          </p>
        </div>
      </header>

      {statusMessage ? <p className="integration-feedback is-info">{statusMessage}</p> : null}
      {errorMessage ? <p className="integration-feedback is-error">{errorMessage}</p> : null}

      <section className="admin-panel integration-section" aria-labelledby="wa-status-heading">
        <h2 id="wa-status-heading" className="integration-section-title">Connection status</h2>
        {loading ? (
          <p className="sub">Loading connection status…</p>
        ) : (
          <div className="integration-status-card integration-status-card--wide">
            <p className={`integration-status-badge ${messagingReady ? 'is-connected' : connectionStatus === 'error' ? 'is-pending' : 'is-idle'}`}>
              {connectionStatusLabel(connectionStatus)}
            </p>
            <dl className="integration-meta-list">
              <div>
                <dt>Messaging ready</dt>
                <dd>{messagingReady ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Last error</dt>
                <dd>{config?.lastError || config?.phoneRegistrationError || '—'}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(config?.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      <section className="admin-panel integration-section" aria-labelledby="wa-manual-heading">
        <h2 id="wa-manual-heading" className="integration-section-title">WhatsApp Business Configuration</h2>
        <form className="integration-register-form" onSubmit={handleSave}>
          <label htmlFor="wa-display-phone">
            Connected WhatsApp Business Number
            <input
              id="wa-display-phone"
              value={displayPhone}
              readOnly
              disabled={busy}
              placeholder="Verify connection to load the connected number"
              aria-readonly="true"
            />
          </label>
          <p className="sub">Loaded from Meta when you verify the Phone Number ID. Not editable.</p>

          <label htmlFor="wa-phone-number-id">
            Phone Number ID
            <input
              id="wa-phone-number-id"
              value={phoneNumberId}
              onChange={(event) => setPhoneNumberId(event.target.value)}
              disabled={busy}
              autoComplete="off"
              required
            />
          </label>

          <label htmlFor="wa-waba-id">
            WhatsApp Business Account ID (WABA ID)
            <input
              id="wa-waba-id"
              value={wabaId}
              onChange={(event) => setWabaId(event.target.value)}
              disabled={busy}
              autoComplete="off"
              required
            />
          </label>

          <label htmlFor="wa-access-token">
            Access Token
            <input
              id="wa-access-token"
              type="password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              disabled={busy}
              autoComplete="new-password"
              placeholder={config?.tokenStored ? '••••••••' : ''}
            />
          </label>
          {config?.tokenStored ? (
            <p className="sub">Stored securely. Leave blank to keep the current value.</p>
          ) : null}

          <div className="integration-actions">
            <button type="submit" className="primary-btn" disabled={busy}>
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={handleVerify}
              disabled={busy || !credentialsReady}
            >
              {verifying ? 'Verifying…' : 'Verify Connection'}
            </button>
            {credentialsReady ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={handleDisconnect}
                disabled={busy}
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="admin-panel integration-section" aria-labelledby="wa-test-heading">
        <h2 id="wa-test-heading" className="integration-section-title">Test Message</h2>
        <div className="integration-register-form">
          <label htmlFor="wa-test-recipient">
            Test Recipient Phone Number (destination)
            <input
              id="wa-test-recipient"
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
              disabled={busy}
              placeholder="+919876543210"
            />
          </label>
          <p className="sub">
            Messages are always sent from your connected WhatsApp Business number. Enter only the recipient&apos;s number here.
          </p>
          <div className="integration-actions">
            <button
              type="button"
              className="primary-btn"
              onClick={handleTestMessage}
              disabled={busy || !messagingReady || !testRecipient.trim()}
            >
              {testing ? 'Sending…' : 'Test Message'}
            </button>
          </div>
          <p className="sub">
            Uses Meta&apos;s hello_world template (en_US). Sending never runs on save.
          </p>
        </div>
      </section>

      {credentialsReady ? (
        <section className="admin-panel integration-section" aria-labelledby="wa-templates-heading">
          <h2 id="wa-templates-heading" className="integration-section-title">Template catalog</h2>
          <div className="integration-status-card integration-status-card--wide">
            <dl className="integration-meta-list">
              <div>
                <dt>Last successful sync</dt>
                <dd>{formatDate(config?.templatesLastSyncedAt)}</dd>
              </div>
              <div>
                <dt>Last sync error</dt>
                <dd>{config?.templatesSyncError || '—'}</dd>
              </div>
            </dl>
            <div className="integration-actions" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="primary-btn"
                onClick={handleSyncTemplates}
                disabled={loading || syncingTemplates || !messagingReady}
              >
                {syncingTemplates ? 'Syncing…' : 'Sync templates'}
              </button>
            </div>
            {templates.length === 0 ? (
              <p className="sub" style={{ marginTop: '0.85rem', marginBottom: 0 }}>
                No templates synced yet. Verify connection, then sync from Meta.
              </p>
            ) : (
              <div className="integration-table-wrap">
                <table className="integration-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Language</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Variables</th>
                      <th>Enabled</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map((template) => {
                      const draft = variableDrafts[template.id] || []
                      const canEnable = template.status === 'APPROVED'
                        && draft.length === Number(template.placeholderCount || 0)
                        && draft.every((item) => item)
                      return (
                        <tr key={template.id}>
                          <td>{template.name}</td>
                          <td>{template.language}</td>
                          <td>{template.category || '—'}</td>
                          <td>{template.status}</td>
                          <td>
                            {Number(template.placeholderCount || 0) === 0 ? (
                              <span className="sub">None</span>
                            ) : (
                              <div className="integration-var-map">
                                {draft.map((value, index) => (
                                  <label key={`${template.id}-var-${index}`}>
                                    {`{{${template.placeholders?.[index] || index + 1}}}`}
                                    <select
                                      value={value}
                                      disabled={savingTemplateId === template.id}
                                      onChange={(event) => {
                                        const next = [...draft]
                                        next[index] = event.target.value
                                        setVariableDrafts((prev) => ({
                                          ...prev,
                                          [template.id]: next,
                                        }))
                                      }}
                                    >
                                      <option value="">Select CRM field</option>
                                      {allowedVariableKeys.map((key) => (
                                        <option key={key} value={key}>{key}</option>
                                      ))}
                                    </select>
                                  </label>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>{template.isEnabled ? 'Enabled' : 'Disabled'}</td>
                          <td>
                            <div className="integration-actions" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                              <button
                                type="button"
                                className="ghost-btn"
                                disabled={savingTemplateId === template.id}
                                onClick={() => handleSaveTemplate(template)}
                              >
                                Save mapping
                              </button>
                              <button
                                type="button"
                                className="ghost-btn"
                                disabled={savingTemplateId === template.id || (!template.isEnabled && !canEnable)}
                                onClick={() => handleSaveTemplate(template, { enable: !template.isEnabled })}
                              >
                                {template.isEnabled ? 'Disable' : 'Enable'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {credentialsReady ? (
        <section className="admin-panel integration-section" aria-labelledby="wa-bindings-heading">
          <h2 id="wa-bindings-heading" className="integration-section-title">Workflow bindings</h2>
          <div className="integration-binding-grid">
            {[
              { key: 'meta_assign', title: 'W1 — New lead assignment', workflow: config?.workflows?.metaAssign },
              { key: 'transfer', title: 'W2 — Lead transfer', workflow: config?.workflows?.transfer },
            ].map((item) => {
              const current = bindings.find((row) => row.workflowKey === item.key)
              const selectedId = current?.templateId || ''
              return (
                <div key={item.key} className="integration-status-card integration-binding-card">
                  <h3>{item.title}</h3>
                  <p className="sub">{workflowStatusLabel(item.workflow)}</p>
                  <label>
                    Bound template
                    <select
                      value={selectedId}
                      disabled={savingBindingKey === item.key || !messagingReady}
                      onChange={(event) => handleSaveBinding(item.key, event.target.value)}
                    >
                      <option value="">Not bound</option>
                      {bindableTemplates().map((template) => (
                        <option key={template.id} value={template.id}>
                          {`${template.name} (${template.language})`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {credentialsReady ? (
        <section className="admin-panel integration-section" aria-labelledby="wa-workflows-heading">
          <h2 id="wa-workflows-heading" className="integration-section-title">Agent notifications</h2>
          <div className="integration-status-card integration-status-card--wide">
            <p className="sub" style={{ marginTop: 0 }}>
              Notify only the assigned primary agent&apos;s registered WhatsApp number.
              Bind an approved, enabled template above before enabling a workflow.
            </p>
            <div className="integration-actions" style={{ marginTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <label className="sub" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={Boolean(config?.metaAssignEnabled)}
                  disabled={loading || savingWorkflows || !messagingReady}
                  onChange={(event) => handleWorkflowToggle('metaAssignEnabled', event.target.checked)}
                />
                Enable W1 — new-lead WhatsApp notifications
              </label>
              <label className="sub" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={Boolean(config?.transferEnabled)}
                  disabled={loading || savingWorkflows || !messagingReady}
                  onChange={(event) => handleWorkflowToggle('transferEnabled', event.target.checked)}
                />
                Enable W2 — transfer WhatsApp notifications
              </label>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
