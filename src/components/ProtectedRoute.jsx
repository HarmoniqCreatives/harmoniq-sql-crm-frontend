import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/**
 * Guards authenticated app-shell routes. Unauthenticated users are sent to `/login`
 * with `state.from` so post-login navigation can return them.
 *
 * @param {{ children: import('react').ReactNode }} props
 */
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return <div className="content"><p className="sub">Loading workspace…</p></div>
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}
