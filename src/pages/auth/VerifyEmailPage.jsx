import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { readApiError, resendVerification, verifyEmail } from '../../api/client'
import { AuthCard, AuthLinks } from '../../components/AuthCard'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState(params.get('email') || '')
  const [token, setToken] = useState(params.get('token') || '')
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
      const payload = await resendVerification({
        email,
        companyId: location.state?.companyId || undefined,
      })
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
        <div className="auth-actions">
          <button type="submit" className="ghost-btn" disabled={busy || !email}>Resend verification</button>
        </div>
      </form>
      <AuthLinks items={[
        { to: '/login', label: 'Back to sign in' },
        { to: '/register', label: 'Create company' },
      ]} />
    </AuthCard>
  )
}
