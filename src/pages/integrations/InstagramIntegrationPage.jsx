import { useAuth } from '../../auth/AuthContext'
import { hasPermission, perm } from '../../auth/permissions'

/**
 * Integrations → Instagram Integration (placeholder landing).
 * Accurate not-configured state only — no fake accounts or messaging.
 */
export function InstagramIntegrationPage() {
  const { user } = useAuth()
  const canView = hasPermission(user, perm.settingsManage)

  if (!canView) {
    return (
      <div className="integrations-page">
        <header className="integration-hero">
          <p className="integration-eyebrow">Integrations</p>
          <h1>Instagram Integration</h1>
        </header>
        <p className="empty-state">You do not have permission to view Instagram integration.</p>
      </div>
    )
  }

  return (
    <div className="integrations-page">
      <header className="integration-hero">
        <div>
          <p className="integration-eyebrow">Integrations</p>
          <h1>Instagram Business</h1>
          <p className="sub">
            Connect Instagram Business for company messaging and lead workflows.
            OAuth and messaging are not implemented in this phase.
          </p>
        </div>
      </header>

      <section className="admin-panel integration-section" aria-labelledby="ig-status-heading">
        <h2 id="ig-status-heading" className="integration-section-title">Connection status</h2>
        <div className="integration-status-card integration-status-card--wide">
          <p className="integration-status-badge is-idle">Not configured</p>
          <p className="sub" style={{ marginBottom: 0 }}>
            No Instagram Business account is connected for this company yet.
            Connected accounts and messaging settings will appear here after setup.
          </p>
        </div>
      </section>

      <section className="admin-panel integration-section" aria-labelledby="ig-next-heading">
        <h2 id="ig-next-heading" className="integration-section-title">Coming next</h2>
        <ul className="integration-roadmap">
          <li>Instagram Business account connection</li>
          <li>Page and asset linking</li>
          <li>Messaging and lead capture hooks</li>
        </ul>
      </section>
    </div>
  )
}
