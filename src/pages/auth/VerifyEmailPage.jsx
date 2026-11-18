import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { listCompanies, readApiError, resendVerification, verifyEmail } from '../../api/client'
import { AuthCard, AuthLinks } from '../../components/AuthCard'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState(params.get('email') || '')
  const [token, setToken] = useState(params.get('token') || '')
  const [companyId, setCompanyId] = useState(location.state?.companyId || '')
  const [companies, setCompanies] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(location.state?.notice || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    async function autoVerify() {
      const linkToken = params.get('token')
      if (!linkToken) {
        return
      }
      setBusy(true)
      try {
        const payload = await verifyEmail(linkToken)
        if (active) {
          setNotice(payload.data.message)
          setTimeout(() => navigate('/login'), 1200)
        }
      } catch (verifyError) {
        if (active) {
          setError(readApiError(verifyError))
        }
      } finally {
        if (active) {
          setBusy(false)
        }
      }
    }
    autoVerify()
    return () => {
      active = false
    }
  }, [params, navigate])

  useEffect(() => {
    let active = true
    async function loadCompanies() {
      if (!email.includes('@')) {
        setCompanies([])
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
        } else if (location.state?.companyId && next.some((company) => company.id === location.state.companyId)) {
          setCompanyId(location.state.companyId)
        } else {
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
  }, [email, location.state?.companyId])

  async function onVerify(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const payload = await verifyEmail(token)
      setNotice(payload.data.message)
      setTimeout(() => navigate('/login'), 1000)
    } catch (verifyError) {
      setError(readApiError(verifyError))
    } finally {
      setBusy(false)
    }
  }

  async function onResend(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const body = { email }
      if (companies.length > 1 || companyId) {
        body.companyId = companyId
      }
      const payload = await resendVerification(body)
      setNotice(payload.data.message)
    } catch (resendError) {
      setError(readApiError(resendError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Verify email" subtitle="Open the link from your inbox or paste the token below.">
      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="auth-success">{notice}</p> : null}
      <form className="auth-form" onSubmit={onVerify}>
        <div className="auth-field">
          <label htmlFor="token">Verification token</label>
          <input id="token" value={token} onChange={(e) => setToken(e.target.value)} disabled={busy} />
        </div>
        <div className="auth-actions">
          <button type="submit" className="primary-btn" disabled={busy || !token}>
            {busy ? 'Working…' : 'Verify email'}
          </button>
        </div>
      </form>
      <form className="auth-form" style={{ marginTop: '1rem' }} onSubmit={onResend}>
        <div className="auth-field">
          <label htmlFor="email">Resend to email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
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
          <button
            type="submit"
            className="ghost-btn"
            disabled={busy || !email || (companies.length > 1 && !companyId)}
          >
            Resend verification
          </button>
        </div>
      </form>
      <AuthLinks items={[
        { to: '/login', label: 'Back to sign in' },
        { to: '/register', label: 'Create company' },
      ]} />
    </AuthCard>
  )
}
