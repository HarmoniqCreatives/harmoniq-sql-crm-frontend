import { Link } from 'react-router-dom'
import { BrandLockup } from './BrandLockup'

/**
 * Shared Melo auth layout card for register/login/verify/reset/accept flows.
 *
 * @param {{ title: string, subtitle?: string, children: import('react').ReactNode, wide?: boolean }} props
 */
export function AuthCard({ title, subtitle, children, wide }) {
  return (
    <div className="auth-shell">
      <div className={wide ? 'auth-card wide' : 'auth-card'}>
        <div className="auth-brand">
          <BrandLockup />
        </div>
        <h1>{title}</h1>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  )
}

/**
 * Footer navigation links under an auth card.
 *
 * @param {{ items: Array<{ to: string, label: string }> }} props
 */
export function AuthLinks({ items }) {
  return (
    <div className="auth-links">
      {items.map((item) => (
        <Link key={item.to} to={item.to}>{item.label}</Link>
      ))}
    </div>
  )
}
