import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canOpenPage,
  findNavItem,
  getGroupIds,
  navigation,
  visibleNavigation,
} from './navigation.js'

function viewerWith(...permissions) {
  return {
    role: {
      isProtected: false,
      permissions,
    },
  }
}

describe('integrations navigation', () => {
  it('exposes Integrations parent with four submenus in order', () => {
    const group = navigation.find((item) => item.id === 'integrations-group')
    assert.ok(group)
    assert.equal(group.label, 'Integrations')
    assert.deepEqual(
      group.children.map((child) => child.label),
      [
        'Facebook Integration',
        'WhatsApp Integration',
        'Instagram Integration',
        'Email Integration',
      ],
    )
    assert.deepEqual(
      group.children.map((child) => child.path),
      [
        '/integrations/facebook',
        '/integrations/whatsapp',
        '/integrations/instagram',
        '/integrations/email',
      ],
    )
    assert.equal(navigation.some((item) => item.id === 'meta' && item.path === '/meta'), false)
  })

  it('resolves routes and expands group ids', () => {
    assert.equal(findNavItem('/integrations/facebook').id, 'integrations-facebook')
    assert.equal(findNavItem('/integrations/email').id, 'integrations-email')
    assert.ok(getGroupIds().includes('integrations-group'))
  })

  it('hides inaccessible integration items by permission', () => {
    const metaOnly = visibleNavigation(viewerWith('meta.view'))
    const integrations = metaOnly.find((item) => item.id === 'integrations-group')
    assert.ok(integrations)
    assert.deepEqual(
      integrations.children.map((child) => child.id),
      ['integrations-facebook'],
    )

    const settingsOnly = visibleNavigation(viewerWith('settings.manage'))
    const settingsGroup = settingsOnly.find((item) => item.id === 'integrations-group')
    assert.ok(settingsGroup)
    assert.deepEqual(
      settingsGroup.children.map((child) => child.id),
      ['integrations-instagram', 'integrations-email'],
    )

    const whatsappOnly = visibleNavigation(viewerWith('whatsapp.manage'))
    const whatsappGroup = whatsappOnly.find((item) => item.id === 'integrations-group')
    assert.ok(whatsappGroup)
    assert.deepEqual(
      whatsappGroup.children.map((child) => child.id),
      ['integrations-whatsapp'],
    )

    assert.equal(canOpenPage(viewerWith('leads.view'), 'integrations-email'), true)
    assert.equal(canOpenPage(viewerWith('leads.view'), 'integrations-whatsapp'), false)
    assert.equal(canOpenPage(viewerWith('whatsapp.manage'), 'integrations-whatsapp'), true)
  })
})
