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
