import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasPermission, perm } from '../auth/permissions'
import { NotificationBell } from './NotificationBell'

export function Topbar({ title, subtitle, onOpenMobile, apiStatus }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canCreateLead = hasPermission(user, perm.leadsCreate)

  function onNewLead() {
    if (!canCreateLead) {
      return
    }
    navigate('/leads', { state: { openCreate: true } })
  }

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="topbar-actions">
        <button type="button" className="icon-btn mobile-toggle" onClick={onOpenMobile} aria-label="Open navigation">
          Menu
        </button>
        <span className={apiStatus === 'ok' ? 'badge badge-gold' : 'badge badge-navy'} title="Backend health">
          API {apiStatus || '…'}
        </span>
        <NotificationBell />
        {canCreateLead ? (
          <button
            type="button"
            className="primary-btn"
            onClick={onNewLead}
            title="Create a new lead"
          >
            New lead
          </button>
        ) : null}
      </div>
    </header>
  )
}
