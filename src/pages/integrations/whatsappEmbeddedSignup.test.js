import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isFacebookMessageOrigin,
  parseWhatsAppEmbeddedSignupEvent,
  summarizeEmbeddedSignupEvent,
} from './whatsappEmbeddedSignup.js'

describe('whatsappEmbeddedSignup helpers', () => {
  it('accepts facebook.com message origins only', () => {
    assert.equal(isFacebookMessageOrigin('https://www.facebook.com'), true)
    assert.equal(isFacebookMessageOrigin('https://web.facebook.com'), true)
    assert.equal(isFacebookMessageOrigin('https://evil.example.com'), false)
    assert.equal(isFacebookMessageOrigin('https://facebook.com.evil.example'), false)
  })

  it('parses WA_EMBEDDED_SIGNUP events and ignores unrelated payloads', () => {
    const finish = parseWhatsAppEmbeddedSignupEvent(JSON.stringify({
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'FINISH',
      data: {
        waba_id: '111',
        phone_number_id: '222',
        business_id: '333',
      },
    }))
    assert.equal(finish.type, 'WA_EMBEDDED_SIGNUP')
    assert.equal(parseWhatsAppEmbeddedSignupEvent('not-json'), null)
    assert.equal(parseWhatsAppEmbeddedSignupEvent({ type: 'OTHER' }), null)
  })

  it('summarizes finish, cancel, and error events', () => {
    const finish = summarizeEmbeddedSignupEvent({
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'FINISH',
      data: {
        waba_id: 'waba-1',
        phone_number_id: 'phone-1',
        business_id: 'biz-1',
      },
    })
    assert.equal(finish.status, 'finish')
    assert.equal(finish.wabaId, 'waba-1')
    assert.equal(finish.phoneNumberId, 'phone-1')

    const cancel = summarizeEmbeddedSignupEvent({
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'CANCEL',
      data: { current_step: 'PHONE_NUMBER_SETUP' },
    })
    assert.equal(cancel.status, 'cancel')
    assert.equal(cancel.step, 'PHONE_NUMBER_SETUP')

    const error = summarizeEmbeddedSignupEvent({
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'ERROR',
      data: { error_message: 'Name rejected' },
    })
    assert.equal(error.status, 'error')
    assert.match(error.message, /Name rejected/)
  })
})
