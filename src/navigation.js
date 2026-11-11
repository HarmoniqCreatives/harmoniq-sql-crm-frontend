/**
 * Sidebar navigation mirrors legacy faloniq-crm parent/child hierarchy and labels.
 * Paths map to React Router; stubs remain until later modules ship.
 * Permission keys use the Harmoniq registry (`users.invite` etc.) with legacy aliases.
 */

export const navigation = [
  {
    id: 'dashboard',
    path: '/',
    label: 'Dashboard',
    icon: '▦',
    title: 'CRM Overview',
    subtitle: 'Your sales overview at a glance.',
  },
  { type: 'label', label: 'Workspace' },
  {
    id: 'leads-group',
    label: 'Leads',
    icon: '▤',
    children: [
      {
        id: 'leads',
        path: '/leads',
        permission: 'leads.view',
        label: 'All Leads',
        title: 'All Leads',
        subtitle: 'Manage customers, property requirements, activities and communication.',
      },
      {
        id: 'activities',
        path: '/activities',
        permission: 'activities.manage',
        label: 'Activities & Overdue',
        title: 'Activities & Overdue',
        subtitle: 'Callbacks, client meetings, site visits and follow-up tasks.',
      },
    ],
  },
  {
    id: 'properties-group',
    label: 'Properties',
    icon: '⌂',
    children: [
      {
        id: 'properties',
        path: '/properties',
        permission: 'leads.view',
        label: 'Property Requirements',
        title: 'Property Requirements',
        subtitle: 'Real estate preferences captured on each lead.',
      },
    ],
  },
  {
    id: 'communication-group',
    label: 'Communication',
    icon: '✉',
    children: [
      {
        id: 'templates',
        path: '/templates',
        permission: 'templates.manage',
        label: 'Email Templates',
        title: 'Email Templates',
        subtitle: 'Admin-managed dynamic messages with customer and agent placeholders.',
      },
      {
        id: 'whatsapp',
        path: '/whatsapp',
        permission: 'templates.manage',
        label: 'WhatsApp Templates',
        title: 'WhatsApp Templates',
        subtitle: 'Admin-managed dynamic messages with customer and agent placeholders.',
      },
      {
        id: 'history',
        path: '/history',
        permission: 'leads.view',
        label: 'Communication History',
        title: 'Communication History',
        subtitle: 'Call, WhatsApp and email activity will appear here.',
      },
    ],
  },
  { type: 'label', label: 'Administration' },
  {
    id: 'users-group',
    label: 'Users & Teams',
    icon: '♙',
    children: [
      {
        id: 'users',
        path: '/users',
        anyOf: ['users.view', 'users.manage', 'users.invite', 'users.create', 'users.edit'],
        label: 'Users & Invitations',
        title: 'Users & Invitations',
        subtitle: 'Invite users and assign a role at invitation time.',
      },
    ],
  },
  {
    id: 'access-group',
    label: 'Roles & Permissions',
    icon: '⚿',
    children: [
      {
        id: 'roles',
        path: '/roles',
        permission: 'roles.view',
        label: 'Role List',
        title: 'Roles & Permissions',
        subtitle: 'Create reusable roles and control access by module and action.',
      },
      {
        id: 'permissions',
        path: '/permissions',
        permission: 'roles.view',
        label: 'Manage Permissions',
        title: 'Manage Permissions',
        subtitle: 'Select a role, then enable only the permissions it needs.',
      },
    ],
  },
  {
    id: 'settings',
    path: '/settings',
    permission: 'settings.manage',
    label: 'Settings',
    icon: '⚙',
    title: 'Settings',
    subtitle: 'Manage shared statuses, tags, activity types and company defaults.',
  },
  {
    id: 'meta',
    path: '/meta',
    permission: 'meta.manage',
    label: 'Integrations',
    icon: '◎',
    title: 'Integrations',
    subtitle: 'Meta app setup, Facebook accounts, Pages, Sync Now, and lead import counts.',
  },
  {
    id: 'reports',
    path: '/reports',
    permission: 'reports.view',
    label: 'Reports',
    icon: '▥',
    title: 'Reports',
    subtitle: 'Lead distribution, status and activity summaries.',
  },
]

/**
 * @param {string} pageId
 * @returns {object}
 */
export function getPage(pageId) {
  for (const item of navigation) {
    if (item.id === pageId) {
      return item
    }
    const child = item.children?.find((entry) => entry.id === pageId)
    if (child) {
      return child
    }
  }
  return navigation[0]
}

/**
 * Resolves the nav page for a pathname (exact match preferred).
 *
 * @param {string} pathname
 * @returns {object}
 */
export function findNavItem(pathname) {
  const normalized = pathname === '' ? '/' : pathname
  for (const item of navigation) {
    if (item.path === normalized) {
      return item
    }
    if (item.children) {
      for (const child of item.children) {
        if (child.path === normalized || (child.path !== '/' && normalized.startsWith(`${child.path}/`))) {
          return child
        }
      }
    }
  }
  return navigation[0]
}

export function getGroupIds() {
  return navigation.filter((item) => item.children).map((item) => item.id)
}

/**
 * Whether the viewer may open a page. Protected Super Admin sees everything.
 *
 * @param {object|null} viewer
 * @param {string} pageId
 * @returns {boolean}
 */
export function canOpenPage(viewer, pageId) {
  if (!viewer) {
    return pageId === 'dashboard'
  }
  if (!viewer.role) {
    return pageId === 'dashboard'
  }
  if (viewer.role.isProtected) {
    return true
  }
  const permissions = viewer.role.permissions || []
  const page = getPage(pageId)
  if (page.anyOf) {
    return page.anyOf.some((key) => permissions.includes(key))
  }
  if (!page.permission) {
    return true
  }
  return permissions.includes(page.permission)
}

/**
 * Filters labels/groups so empty sections disappear from the sidebar.
 *
 * @param {object|null} viewer
 * @returns {object[]}
 */
export function visibleNavigation(viewer) {
  const visible = []
  for (const item of navigation) {
    if (item.type === 'label') {
      visible.push(item)
      continue
    }
    if (item.children) {
      const children = item.children.filter((child) => canOpenPage(viewer, child.id))
      if (children.length === 0) {
        continue
      }
      visible.push({ ...item, children })
      continue
    }
    if (canOpenPage(viewer, item.id)) {
      visible.push(item)
    }
  }
  const cleaned = []
  for (let index = 0; index < visible.length; index += 1) {
    const item = visible[index]
    if (item.type === 'label') {
      const next = visible[index + 1]
      if (!next || next.type === 'label') {
        continue
      }
    }
    cleaned.push(item)
  }
  return cleaned
}
