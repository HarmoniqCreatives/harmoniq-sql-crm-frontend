import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listDialCountries, readApiError, registerCompany } from '../../api/client'
import { AuthCard, AuthLinks } from '../../components/AuthCard'
import { PasswordInput } from '../../components/PasswordInput'

/**
 * Company registration with DB-driven country dial codes and PasswordInput.
 */
export function RegisterPage() {
  const navigate = useNavigate()
  const [companyName, setCompanyName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [email, setEmail] = useState('')
  const [countries, setCountries] = useState([])
  const [country, setCountry] = useState('')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [countriesLoading, setCountriesLoading] = useState(true)

  useEffect(() => {
    let active = true
    listDialCountries()
      .then((payload) => {
        if (!active) {
          return
        }
        const rows = payload.data.countries || []
        setCountries(rows)
        const india = rows.find((row) => row.name === 'India')
        setCountry(india?.name || rows[0]?.name || '')
      })
      .catch((loadError) => {
        if (active) {
          setError(readApiError(loadError))
        }
      })
      .finally(() => {
        if (active) {
          setCountriesLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  const selectedCode = useMemo(() => {
    const match = countries.find((row) => row.name === country)
    return match?.code || ''
  }, [countries, country])

  async function onSubmit(event) {
    event.preventDefault()
    if (busy) {
      return
    }
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const payload = await registerCompany({
        companyName,
        adminName,
        email,
        country,
        countryCode: selectedCode,
        mobile,
        password,
        confirmPassword,
      })
      setNotice(payload.data.message)
      navigate(`/verify-email?email=${encodeURIComponent(email)}`, {
        state: { notice: payload.data.message, companyId: payload.data.companyId },
      })
    } catch (submitError) {
      setError(readApiError(submitError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard
      wide
      title="Create your company"
      subtitle="Register Harmoniq Creative CRM for your organization."
    >
      <form className="auth-form" onSubmit={onSubmit}>
        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-success">{notice}</p> : null}
        <div className="auth-field">
          <label htmlFor="companyName">Company name</label>
          <input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required disabled={busy} />
        </div>
        <div className="auth-field">
          <label htmlFor="adminName">Admin name</label>
          <input id="adminName" value={adminName} onChange={(e) => setAdminName(e.target.value)} required disabled={busy} />
        </div>
        <div className="auth-field">
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
        </div>
        <div className="auth-grid-2">
          <div className="auth-field">
            <label htmlFor="country">Country</label>
            <select
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
              disabled={busy || countriesLoading || countries.length === 0}
            >
              {countries.length === 0 ? <option value="">Loading…</option> : null}
              {countries.map((item) => (
                <option key={item.id} value={item.name}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="auth-field">
            <label htmlFor="countryCode">Country code</label>
            <select id="countryCode" value={selectedCode} disabled>
              <option value={selectedCode}>{selectedCode || '—'}</option>
            </select>
          </div>
        </div>
        <div className="auth-field">
          <label htmlFor="mobile">Mobile number</label>
          <input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} required disabled={busy} autoComplete="tel" />
          <p className="sub">Enter the national number without the country code.</p>
        </div>
        <div className="auth-grid-2">
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required disabled={busy} />
          </div>
          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <PasswordInput id="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required disabled={busy} />
          </div>
        </div>
        <div className="auth-actions">
          <button type="submit" className="primary-btn" disabled={busy || countriesLoading}>
            {busy ? 'Creating…' : 'Create company'}
          </button>
        </div>
      </form>
      <AuthLinks items={[
        { to: '/login', label: 'Already have an account? Sign in' },
      ]} />
    </AuthCard>
  )
}
