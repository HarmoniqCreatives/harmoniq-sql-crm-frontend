/**
 * Facebook JS SDK loader + Embedded Signup v4 helpers (page-scoped only).
 * Official flow: config_id + response_type code; extras.setup only (no sessionInfoVersion).
 */

const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'
const FACEBOOK_ORIGIN_SUFFIX = 'facebook.com'

/**
 * @param {string} appId
 * @param {string} graphApiVersion
 * @returns {Promise<typeof window.FB>}
 */
export function loadFacebookSdk(appId, graphApiVersion) {
  if (!appId || !graphApiVersion) {
    return Promise.reject(new Error('WhatsApp Embedded Signup is not configured.'))
  }

  return new Promise((resolve, reject) => {
    const init = () => {
      try {
        window.FB.init({
          appId,
          autoLogAppEvents: true,
          xfbml: false,
          version: graphApiVersion,
        })
        resolve(window.FB)
      } catch (error) {
        reject(error)
      }
    }

    if (window.FB) {
      init()
      return
    }

    const previous = window.fbAsyncInit
    window.fbAsyncInit = function fbAsyncInit() {
      if (typeof previous === 'function') {
        previous()
      }
      init()
    }

    const existing = document.querySelector(`script[src="${SDK_SRC}"]`)
    if (existing) {
      return
    }

    const script = document.createElement('script')
    script.src = SDK_SRC
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onerror = () => reject(new Error('Could not load the Facebook SDK.'))
    document.body.appendChild(script)
  })
}

/**
 * @param {MessageEvent} event
 * @returns {boolean}
 */
export function isFacebookMessageOrigin(origin) {
  if (!origin || typeof origin !== 'string') {
    return false
  }
  try {
    const host = new URL(origin).hostname
    return host === FACEBOOK_ORIGIN_SUFFIX || host.endsWith(`.${FACEBOOK_ORIGIN_SUFFIX}`)
  } catch {
    return false
  }
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
export function parseWhatsAppEmbeddedSignupEvent(raw) {
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object' || data.type !== 'WA_EMBEDDED_SIGNUP') {
    return null
  }
  return data
}

/**
 * @param {object} event
 * @returns {{ status: 'finish'|'cancel'|'error'|'unknown', wabaId: string|null, phoneNumberId: string|null, businessId: string|null, step: string|null, message: string|null }}
 */
export function summarizeEmbeddedSignupEvent(event) {
  const payload = event?.data && typeof event.data === 'object' ? event.data : {}
  const finishType = String(event?.event || '')
  if (finishType === 'CANCEL') {
    return {
      status: 'cancel',
      wabaId: null,
      phoneNumberId: null,
      businessId: null,
      step: payload.current_step ? String(payload.current_step) : null,
      message: 'WhatsApp signup was cancelled.',
    }
  }
  if (finishType === 'ERROR') {
    return {
      status: 'error',
      wabaId: null,
      phoneNumberId: null,
      businessId: null,
      step: null,
      message: payload.error_message
        ? String(payload.error_message)
        : 'WhatsApp signup reported an error.',
    }
  }
  if (finishType.startsWith('FINISH')) {
    return {
      status: 'finish',
      wabaId: payload.waba_id ? String(payload.waba_id) : null,
      phoneNumberId: payload.phone_number_id ? String(payload.phone_number_id) : null,
      businessId: payload.business_id ? String(payload.business_id) : null,
      step: null,
      message: null,
    }
  }
  return {
    status: 'unknown',
    wabaId: null,
    phoneNumberId: null,
    businessId: null,
    step: null,
    message: null,
  }
}

/**
 * Launches Facebook Login for Business Embedded Signup v4.
 *
 * @param {object} options
 * @param {string} options.configId
 * @param {{ setup?: object }} [options.extras]
 * @param {{ responseType?: string, overrideDefaultResponseType?: boolean }} [options.loginOptions]
 * @returns {Promise<{ code: string|null, cancelled: boolean }>}
 */
export function launchEmbeddedSignupLogin(options) {
  const FB = window.FB
  if (!FB || typeof FB.login !== 'function') {
    return Promise.reject(new Error('Facebook SDK is not ready.'))
  }
  const responseType = options.loginOptions?.responseType || 'code'
  const overrideDefaultResponseType = options.loginOptions?.overrideDefaultResponseType !== false
  return new Promise((resolve) => {
    FB.login(
      (response) => {
        if (response?.authResponse?.code) {
          resolve({ code: String(response.authResponse.code), cancelled: false })
          return
        }
        resolve({ code: null, cancelled: true })
      },
      {
        config_id: options.configId,
        response_type: responseType,
        override_default_response_type: overrideDefaultResponseType,
        extras: options.extras && typeof options.extras === 'object'
          ? options.extras
          : { setup: {} },
      },
    )
  })
}
