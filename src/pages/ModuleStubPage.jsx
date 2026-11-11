export function ModuleStubPage({ title, description }) {
  return (
    <article className="panel-card module-stub">
      <div>
        <span className="badge badge-gold">Phase pending</span>
        <h2>{title}</h2>
        <p className="sub">{description}</p>
        <p className="empty-state">
          Business logic will be ported from the existing Harmoniq/Faloniq CRM workflows
          after you approve the next implementation phase.
        </p>
      </div>
    </article>
  )
}
