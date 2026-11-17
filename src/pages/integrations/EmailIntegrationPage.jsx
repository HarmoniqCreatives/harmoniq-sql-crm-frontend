import { useCallback, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { hasPermission, perm } from '../../auth/permissions'
import { Toast } from '../../components/Toast'
import { AutomaticEmailReportsPanel } from './AutomaticEmailReportsPanel'

/**
 * Integrations → Email Integration.
 * Section A: honest provider status (no invented OAuth connections).
 * Section B: Automatic Email Reports (relocated from Settings).
 */
export function EmailIntegrationPage() {
  const { user } = useAuth()
  const canManage = hasPermission(user, perm.settingsManage)
  const canView = canManage || hasPermission(user, perm.leadsView)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const onNotice = useCallback((message) => {
    setError('')
    setNotice(message || '')
  }, [])

  const onError = useCallback((message) => {
    setNotice('')
    setError(message || '')
  }, [])

  if (!canView) {
    return (
      <div className="integrations-page">
        <header className="integration-hero">
          <p className="integration-eyebrow">Integrations</p>
          <h1>Email Integration</h1>
        </header>
        <p className="empty-state">You do not have permission to view email integration.</p>
      </div>
    )
  }

  return (
    <div className="integrations-page">
      <Toast notice={notice} error={error} onClear={() => { setNotice(''); setError('') }} />
      <header className="integration-hero">
        <div>
          <p className="integration-eyebrow">Integrations</p>
          <h1>Email Integration</h1>
          <p className="sub">
            Company email delivery settings and automatic Lead Report schedules.
          </p>
        </div>
      </header>

      <section className="admin-panel integration-section" aria-labelledby="email-config-heading">
        <h2 id="email-config-heading" className="integration-section-title">Email Configuration</h2>
        <p className="sub">
          Outbound CRM email (invites, assignment notices, and report delivery) uses the
          server mail provider configured for this deployment. Company-level Gmail and
          Microsoft Outlook OAuth are not available yet.
        </p>
        <div className="integration-status-grid">
          <article className="integration-status-card">
            <h3>Provider</h3>
            <p className="integration-status-badge is-pending">Server mail</p>
            <p className="sub">Managed by deployment environment. No company OAuth connection is configured.</p>
          </article>
          <article className="integration-status-card">
            <h3>Gmail</h3>
            <p className="integration-status-badge is-idle">Not configured</p>
            <p className="sub">OAuth mailbox connection will appear here in a later phase.</p>
          </article>
          <article className="integration-status-card">
            <h3>Microsoft Outlook</h3>
            <p className="integration-status-badge is-idle">Not configured</p>
            <p className="sub">OAuth mailbox connection will appear here in a later phase.</p>
          </article>
        </div>
      </section>

      <AutomaticEmailReportsPanel
        canManage={canManage}
        onNotice={onNotice}
        onError={onError}
      />
    </div>
  )
}
