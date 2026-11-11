import { useState } from 'react'
import { forgotPassword, readApiError } from '../../api/client'
import { AuthCard, AuthLinks } from '../../components/AuthCard'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const payload = await forgotPassword({ email })
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
        <div className="auth-actions">
          <button type="submit" className="primary-btn" disabled={busy}>
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
