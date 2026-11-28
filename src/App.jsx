import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { resolveLoginReturnPath } from './auth/loginReturn'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { LeadsPage } from './pages/LeadsPage'
import { MetaIntegrationsPage } from './pages/MetaIntegrationsPage'
import { EmailIntegrationPage } from './pages/integrations/EmailIntegrationPage'
import { InstagramIntegrationPage } from './pages/integrations/InstagramIntegrationPage'
import { WhatsAppIntegrationPage } from './pages/integrations/WhatsAppIntegrationPage'
import { ModuleStubPage } from './pages/ModuleStubPage'
import { ReportsPage } from './pages/ReportsPage'
import { MetaSyncToasts } from './components/MetaSyncToasts'
import { PermissionsPage } from './pages/PermissionsPage'
import { RecycleBinPage } from './pages/RecycleBinPage'
import { RolesPage } from './pages/RolesPage'
import { SettingsPage } from './pages/SettingsPage'
import { UsersPage } from './pages/UsersPage'
import { AcceptInvitationPage } from './pages/auth/AcceptInvitationPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage'

function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return <div className="auth-shell"><p className="sub">Loading…</p></div>
  }
  if (user) {
    return <Navigate to={resolveLoginReturnPath(location.state?.from)} replace />
  }
  return children
}

/** Preserves OAuth query params when moving /meta → Facebook Integration. */
function MetaLegacyRedirect() {
  const location = useLocation()
  return (
    <Navigate
      to={{ pathname: '/integrations/facebook', search: location.search, hash: location.hash }}
      replace
    />
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="activities" element={<ModuleStubPage title="Activities & Overdue" description="Callbacks, client meetings, site visits and follow-up tasks." />} />
            <Route path="properties" element={<ModuleStubPage title="Property Requirements" description="Real estate preferences captured on each lead." />} />
            <Route path="templates" element={<ModuleStubPage title="Email Templates" description="Admin-managed dynamic messages with customer and agent placeholders." />} />
            <Route path="whatsapp" element={<ModuleStubPage title="WhatsApp Templates" description="Admin-managed dynamic messages with customer and agent placeholders." />} />
            <Route path="history" element={<ModuleStubPage title="Communication History" description="Call, WhatsApp and email activity will appear here." />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="roles/:id" element={<RolesPage />} />
            <Route path="permissions" element={<PermissionsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="integrations/facebook" element={<MetaIntegrationsPage />} />
            <Route path="integrations/whatsapp" element={<WhatsAppIntegrationPage />} />
            <Route path="integrations/instagram" element={<InstagramIntegrationPage />} />
            <Route path="integrations/email" element={<EmailIntegrationPage />} />
            <Route path="recycle-bin" element={<RecycleBinPage />} />
            {/* Backward-compatible Meta bookmark + OAuth return URL */}
            <Route path="meta" element={<MetaLegacyRedirect />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <MetaSyncToasts />
      </BrowserRouter>
    </AuthProvider>
  )
}
