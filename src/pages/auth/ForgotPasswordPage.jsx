import { useEffect, useState } from 'react'
import { forgotPassword, listCompanies, readApiError } from '../../api/client'
import { AuthCard, AuthLinks } from '../../components/AuthCard'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [companies, setCompanies] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    async function loadCompanies() {
      if (!email.includes('@')) {
        setCompanies([])
        setCompanyId('')
        return
      }
      try {
        const payload = await listCompanies(email.trim().toLowerCase())
        if (!active) {
          return
        }
        const next = payload.data.companies || []
        setCompanies(next)
        if (next.length === 1) {
          setCompanyId(next[0].id)
        } else if (next.length !== 1) {
          setCompanyId('')
        }
      } catch {
        if (active) {
          setCompanies([])
        }
      }
    }
    const timer = setTimeout(loadCompanies, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [email])

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const body = { email }
      if (companies.length > 1 || companyId) {
        body.companyId = companyId
      }
      const payload = await forgotPassword(body)
      setNotice(payload.data.message)
    } catch (submitError) {
      setError(readApiError(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Forgot password" subtitle="We will email a reset link if the account exists.">
      <form className="auth-form" onSubmit={onSubmit}>
        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-success">{notice}</p> : null}
        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
        </div>
        {companies.length > 1 ? (
          <div className="auth-field">
            <label htmlFor="companyId">Company</label>
            <select id="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required disabled={busy}>
              <option value="">Select company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="auth-actions">
          <button type="submit" className="primary-btn" disabled={busy || (companies.length > 1 && !companyId)}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </div>
      </form>
      <AuthLinks items={[
        { to: '/login', label: 'Back to sign in' },
      ]} />
    </AuthCard>
  )
}
