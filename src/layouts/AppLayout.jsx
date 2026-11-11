import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { getHealth } from '../api/client'
import { Sidebar, getGroupIds } from '../components/Sidebar'
import { Topbar } from '../components/Topbar'
import { findNavItem, getPage, navigation } from '../navigation'

/**
 * Application shell: permission-aware sidebar with expandable groups + topbar.
 */
export function AppLayout() {
  const location = useLocation()
  const current = findNavItem(location.pathname)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [apiStatus, setApiStatus] = useState('')
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(getGroupIds()))

  useEffect(() => {
    let active = true
    getHealth()
      .then((payload) => {
        if (active) {
          setApiStatus(payload?.data?.status || 'ok')
        }
      })
      .catch(() => {
        if (active) {
          setApiStatus('offline')
        }
      })
    return () => {
      active = false
    }
  }, [])

  // Keep the parent group open when a child route is active.
  useEffect(() => {
    for (const item of navigation) {
      if (!item.children) {
        continue
      }
      const match = item.children.some((child) => {
        if (child.path === '/') {
          return location.pathname === '/'
        }
        return location.pathname === child.path || location.pathname.startsWith(`${child.path}/`)
      })
      if (match) {
        setExpandedGroups((currentSet) => {
          if (currentSet.has(item.id)) {
            return currentSet
          }
          const next = new Set(currentSet)
          next.add(item.id)
          return next
        })
      }
    }
  }, [location.pathname])

  function onToggleGroup(groupId) {
    setExpandedGroups((currentSet) => {
      const next = new Set(currentSet)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  const shellClass = [
    'app-shell',
    collapsed ? 'is-collapsed' : '',
    mobileOpen ? 'is-mobile-open' : '',
  ].filter(Boolean).join(' ')

  const title = current.title || current.label || getPage('dashboard').title
  const subtitle = current.subtitle || ''

  return (
    <div className={shellClass}>
      <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        onCloseMobile={() => setMobileOpen(false)}
        expandedGroups={expandedGroups}
        onToggleGroup={onToggleGroup}
      />
      <div className="main-panel">
        <Topbar
          title={title}
          subtitle={subtitle}
          apiStatus={apiStatus}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
