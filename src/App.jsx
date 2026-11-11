import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { LeadsPage } from './pages/LeadsPage'
import { MetaIntegrationsPage } from './pages/MetaIntegrationsPage'
import { ModuleStubPage } from './pages/ModuleStubPage'
import { MetaSyncToasts } from './components/MetaSyncToasts'
import { PermissionsPage } from './pages/PermissionsPage'
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
  if (loading) {
    return <div className="auth-shell"><p className="sub">Loading…</p></div>
  }
  if (user) {
    return <Navigate to="/" replace />
  }
  return children
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
            <Route path="reports" element={<ModuleStubPage title="Reports" description="Lead distribution, status and activity summaries." />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="roles/:id" element={<RolesPage />} />
            <Route path="permissions" element={<PermissionsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="meta" element={<MetaIntegrationsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <MetaSyncToasts />
      </BrowserRouter>
    </AuthProvider>
  )
}
