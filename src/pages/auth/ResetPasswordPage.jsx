import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { readApiError, resetPassword } from '../../api/client'
import { AuthCard, AuthLinks } from '../../components/AuthCard'
import { PasswordInput } from '../../components/PasswordInput'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [token, setToken] = useState(params.get('token') || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const payload = await resetPassword({ token, password, confirmPassword })
      setNotice(payload.data.message)
      setTimeout(() => navigate('/login'), 1000)
    } catch (submitError) {
      setError(readApiError(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Reset password" subtitle="Choose a new password for your account.">
      <form className="auth-form" onSubmit={onSubmit}>
        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-success">{notice}</p> : null}
        <div className="auth-field">
          <label htmlFor="token">Reset token</label>
          <input id="token" value={token} onChange={(e) => setToken(e.target.value)} required disabled={busy} />
        </div>
        <div className="auth-field">
          <label htmlFor="password">New password</label>
          <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required disabled={busy} />
        </div>
        <div className="auth-field">
          <label htmlFor="confirmPassword">Confirm password</label>
          <PasswordInput id="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required disabled={busy} />
        </div>
        <div className="auth-actions">
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>
      <AuthLinks items={[
        { to: '/login', label: 'Back to sign in' },
      ]} />
    </AuthCard>
  )
}
