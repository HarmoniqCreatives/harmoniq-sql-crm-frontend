export function Topbar({ title, subtitle, onOpenMobile, apiStatus }) {
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
        <button type="button" className="ghost-btn" title="Notifications coming in a later phase">
          Alerts
        </button>
        <button type="button" className="primary-btn" title="Lead create arrives with the Leads module">
          New lead
        </button>
      </div>
    </header>
  )
}
