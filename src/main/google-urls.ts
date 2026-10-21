/**
 * Every Google URL of Shifted, and nothing else.
 *
 * No other file in `src/` may contain a Google host name. A unit test checks this.
 *
 * Test mode: if the environment variable `SHIFTED_TEST_SERVER` is set (for example
 * `http://127.0.0.1:4555`), every function returns a URL on that local fake Google
 * server in place of the Google URL.
 */

const GMAIL_URL = 'https://mail.google.com/mail/u/0/'
const CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r'
const SIGN_IN_URL =
  'https://accounts.google.com/ServiceLogin?service=mail&continue=https://mail.google.com/mail/u/0/'
const FEED_URL_BASE = 'https://mail.google.com/mail/u/0/feed/atom/'

/** The URL of the fake Google test server, with no trailing slash, or `undefined`. */
export function testServerUrl(): string | undefined {
  const value = process.env['SHIFTED_TEST_SERVER']?.trim()
  if (!value) return undefined
  return value.replace(/\/+$/, '')
}

/** True when Shifted runs against the fake Google test server. */
export function isTestMode(): boolean {
  return testServerUrl() !== undefined
}

/** The URL of the Gmail Google app. */
export function gmailUrl(): string {
  const server = testServerUrl()
  return server ? `${server}/gmail/` : GMAIL_URL
}

/** The URL of the Calendar Google app. */
export function calendarUrl(): string {
  const server = testServerUrl()
  return server ? `${server}/calendar/` : CALENDAR_URL
}

/** The URL of Google's sign-in page. After sign-in, Google goes to Gmail. */
export function signInUrl(): string {
  const server = testServerUrl()
  return server ? `${server}/signin` : SIGN_IN_URL
}

/**
 * The URL of the Gmail Atom feed for one label.
 *
 * @param label The feed label, already in URL form (for example `%5Esq_ig_i_personal`).
 *   An empty label gives the feed of the whole inbox.
 */
export function feedUrl(label = ''): string {
  const server = testServerUrl()
  return server ? `${server}/feed/atom/${label}` : `${FEED_URL_BASE}${label}`
}

const GMAIL_ORIGIN = 'https://mail.google.com'
const GMAIL_PATH_PREFIX = '/mail/u/'
const SIGN_IN_HOST = 'accounts.google.com'

const TEST_GMAIL_PATH_PREFIX = '/gmail/'
const TEST_SIGN_IN_PATH = '/signin'

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

/**
 * True when the URL is a page of the Gmail Google app (`https://mail.google.com/mail/u/`).
 * In test mode, true for the fake Gmail (`<server>/gmail/`).
 */
export function isGmailUrl(url: string): boolean {
  const parsed = parseUrl(url)
  if (!parsed) return false
  const server = testServerUrl()
  if (server) {
    return (
      parsed.origin === new URL(server).origin && parsed.pathname.startsWith(TEST_GMAIL_PATH_PREFIX)
    )
  }
  return parsed.origin === GMAIL_ORIGIN && parsed.pathname.startsWith(GMAIL_PATH_PREFIX)
}

/**
 * True when the URL is a page of Google's sign-in (`accounts.google.com`).
 * In test mode, true for the fake sign-in page (`<server>/signin`).
 */
export function isSignInPageUrl(url: string): boolean {
  const parsed = parseUrl(url)
  if (!parsed) return false
  const server = testServerUrl()
  if (server) {
    return (
      parsed.origin === new URL(server).origin &&
      (parsed.pathname === TEST_SIGN_IN_PATH || parsed.pathname.startsWith(`${TEST_SIGN_IN_PATH}/`))
    )
  }
  return (
    (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
    parsed.hostname === SIGN_IN_HOST
  )
}

/** The hosts that serve Google profile photos, and every host below them. */
const PROFILE_PHOTO_HOSTS = ['googleusercontent.com', 'gstatic.com', 'google.com']

/**
 * True when Shifted may download a profile photo from this URL: an `https:` URL on a
 * Google host that serves profile photos. In test mode, true for a URL on the fake server.
 */
export function isProfilePhotoUrl(url: string): boolean {
  const parsed = parseUrl(url)
  if (!parsed) return false
  const server = testServerUrl()
  if (server) return parsed.origin === new URL(server).origin
  if (parsed.protocol !== 'https:') return false
  return PROFILE_PHOTO_HOSTS.some(
    (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
  )
}
