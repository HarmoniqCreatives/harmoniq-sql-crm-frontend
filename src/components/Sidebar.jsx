import { useMemo } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getGroupIds, visibleNavigation } from '../navigation'

/**
 * Harmoniq-styled sidebar with legacy parent/child hierarchy, expand/collapse,
 * and permission-based visibility.
 *
 * @param {{
 *   collapsed: boolean,
 *   onToggleCollapse: () => void,
 *   mobileOpen: boolean,
 *   onCloseMobile: () => void,
 *   expandedGroups: Set<string>,
 *   onToggleGroup: (id: string) => void,
 * }} props
 */
export function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  expandedGroups,
  onToggleGroup,
}) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const items = useMemo(() => visibleNavigation(user), [user])
  const initials = (user?.name || 'SA').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  function openPath(path) {
    navigate(path)
    onCloseMobile?.()
  }

  function isActivePath(path) {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  return (
    <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Primary">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">H</div>
        <div className="brand-copy">
          <strong>Harmoniq Creative</strong>
          <span>{user?.company?.name || 'CRM Workspace'}</span>
        </div>
      </div>

      <nav className="nav-section" aria-label="Primary">
        {items.map((item) => {
          if (item.type === 'label') {
            return <p key={item.label} className="nav-label">{item.label}</p>
          }

          if (item.children) {
            const expanded = expandedGroups.has(item.id)
            const childActive = item.children.some((child) => isActivePath(child.path))
            return (
              <div key={item.id} className="nav-group">
                <button
                  type="button"
                  className={`nav-item parent ${childActive ? 'has-active-child' : ''}`}
                  aria-expanded={expanded}
                  onClick={() => onToggleGroup(item.id)}
                >
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-text">{item.label}</span>
                  <span className="nav-chevron" aria-hidden="true">{expanded ? '⌄' : '›'}</span>
                </button>
                {expanded ? (
                  <div className="nav-children">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.id}
                        to={child.path}
                        className={() => (isActivePath(child.path) ? 'nav-child is-active' : 'nav-child')}
                        onClick={onCloseMobile}
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          }

          return (
            <button
              key={item.id}
              type="button"
              className={isActivePath(item.path) ? 'nav-item is-active' : 'nav-item'}
              aria-current={isActivePath(item.path) ? 'page' : undefined}
              onClick={() => openPath(item.path)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-text">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-chip" title={user?.email || 'Signed-in user'}>
          <div className="user-avatar" aria-hidden="true">{initials}</div>
          <div>
            <strong>{user?.name || 'User'}</strong>
            <span>{user?.role?.name || 'Member'}</span>
          </div>
        </div>
        <button
          type="button"
          className="collapse-btn"
          onClick={onToggleCollapse}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span>{collapsed ? 'Expand' : 'Collapse'} sidebar</span>
          {collapsed ? '»' : '«'}
        </button>
        <button type="button" className="collapse-btn" onClick={() => signOut()}>
          <span>Sign out</span>
        </button>
        {mobileOpen ? (
          <button type="button" className="collapse-btn" onClick={onCloseMobile}>
            Close menu
          </button>
        ) : null}
      </div>
    </aside>
  )
}

export { getGroupIds }
