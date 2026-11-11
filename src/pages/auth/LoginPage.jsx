import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCompanies, readApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { AuthCard, AuthLinks } from '../../components/AuthCard'
import { PasswordInput } from '../../components/PasswordInput'

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn, user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [companies, setCompanies] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true })
    }
  }, [user, navigate])

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
        setCompanies(payload.data.companies || [])
        if (payload.data.companies?.length === 1) {
          setCompanyId(payload.data.companies[0].id)
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
    if (busy) {
      return
    }
    setError('')
    setBusy(true)
    try {
      const body = { email, password }
      if (companies.length > 1 || companyId) {
        body.companyId = companyId
      }
      await signIn(body)
      navigate('/', { replace: true })
    } catch (submitError) {
      setError(readApiError(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Access your Harmoniq Creative CRM workspace.">
      <form className="auth-form" onSubmit={onSubmit}>
        {error ? <p className="auth-error">{error}</p> : null}
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
        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required disabled={busy} />
        </div>
        <div className="auth-actions">
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
      <AuthLinks items={[
        { to: '/register', label: 'Create a company' },
        { to: '/forgot-password', label: 'Forgot password' },
        { to: '/verify-email', label: 'Verify email' },
      ]} />
    </AuthCard>
  )
}
