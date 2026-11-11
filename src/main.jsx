import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/auth.css'
import './styles/admin.css'
import './styles/leads.css'
import './styles/meta.css'
import './styles/password-input.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
