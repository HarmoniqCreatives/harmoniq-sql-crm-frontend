const kpis = [
  { label: 'Total leads', value: '—', meta: 'Connect auth to load live counts' },
  { label: 'New leads', value: '—', meta: 'Last 7 days' },
  { label: 'Converted', value: '—', meta: 'Won pipeline' },
  { label: 'Pending activities', value: '—', meta: 'Due soon' },
  { label: 'Overdue activities', value: '—', meta: 'Needs attention' },
]

const recent = [
  { title: 'Shell ready', detail: 'Dashboard layout and KPI cards are live', time: 'Just now' },
  { title: 'Prisma schema drafted', detail: 'Tenant-aware MySQL tables prepared', time: 'Phase 2' },
  { title: 'Next up', detail: 'Auth, invitations, and leads modules', time: 'Awaiting approval' },
]

const sources = [
  { name: 'Facebook Lead Ads', share: 'Pending module' },
  { name: 'Website', share: 'Pending module' },
  { name: 'Manual', share: 'Pending module' },
]

export function DashboardPage() {
  return (
    <div className="page-grid">
      <section className="kpi-grid" aria-label="Key performance indicators">
        {kpis.map((item) => (
          <article className="kpi-card" key={item.label}>
            <p className="kpi-label">{item.label}</p>
            <p className="kpi-value">{item.value}</p>
            <p className="kpi-meta">{item.meta}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-split">
        <article className="panel-card">
          <h2>Lead conversion</h2>
          <p className="sub">Chart shell for company-scoped conversion trends.</p>
          <div className="chart-placeholder" aria-hidden="true">
            <div className="chart-bars">
              <span style={{ height: '42%' }} />
              <span style={{ height: '58%' }} />
              <span style={{ height: '36%' }} />
              <span style={{ height: '72%' }} />
              <span style={{ height: '64%' }} />
              <span style={{ height: '80%' }} />
              <span style={{ height: '54%' }} />
            </div>
          </div>
        </article>

        <article className="panel-card">
          <h2>Lead sources</h2>
          <p className="sub">Summary placeholders until reporting is wired.</p>
          <ul className="source-list">
            {sources.map((item) => (
              <li key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.share}</span>
                </div>
                <span className="badge badge-navy">Soon</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <article className="panel-card">
        <h2>Recent activity</h2>
        <p className="sub">Company-wise feed will show notes, transfers, and callbacks.</p>
        <ul className="activity-list">
          {recent.map((item) => (
            <li key={item.title}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
              <span>{item.time}</span>
            </li>
          ))}
        </ul>
      </article>
    </div>
  )
}
