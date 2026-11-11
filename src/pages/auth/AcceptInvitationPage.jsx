import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { acceptInvitation, previewInvitation, readApiError } from '../../api/client'
import { AuthCard, AuthLinks } from '../../components/AuthCard'
import { PasswordInput } from '../../components/PasswordInput'

/**
 * Public invitation acceptance page (`/accept-invitation?token=`).
 *
 * Invalid, expired, and used tokens share the generic API error message so
 * tokens cannot be probed. On success the user sets their own password and is
 * redirected to login.
 */
export function AcceptInvitationPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''
  const [preview, setPreview] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!token) {
        setInvalid(true)
        setError('This invitation link is not valid.')
        return
      }
      setBusy(true)
      try {
        const payload = await previewInvitation(token)
        if (active) {
          setPreview(payload.data.invitation)
        }
      } catch (previewError) {
        if (active) {
          setInvalid(true)
          setError(readApiError(previewError))
        }
      } finally {
        if (active) {
          setBusy(false)
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [token])

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const payload = await acceptInvitation({ token, password, confirmPassword })
      setNotice(payload.data.message)
      setTimeout(() => navigate('/login'), 1000)
    } catch (submitError) {
      setError(readApiError(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Accept invitation" subtitle="Choose a password to join your company workspace.">
      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="auth-success">{notice}</p> : null}
      {preview && !invalid ? (
        <p className="sub" style={{ marginBottom: '1rem' }}>
          {preview.name} · {preview.email}<br />
          {preview.companyName} · {preview.roleName}
        </p>
      ) : null}
      {!invalid ? (
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required disabled={busy || !preview} />
          </div>
          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <PasswordInput id="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required disabled={busy || !preview} />
          </div>
          <div className="auth-actions">
            <button type="submit" className="primary-btn" disabled={busy || !preview}>
              {busy ? 'Saving…' : 'Accept invitation'}
            </button>
          </div>
        </form>
      ) : (
        <p className="sub">Ask your administrator for a new invitation link.</p>
      )}
      <AuthLinks items={[
        { to: '/login', label: 'Back to sign in' },
      ]} />
      {!token ? <p className="sub"><Link to="/login">Sign in</Link></p> : null}
    </AuthCard>
  )
}
