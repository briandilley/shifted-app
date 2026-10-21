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

/**
 * The URL of Google's sign-in page. After sign-in, Google goes to Gmail.
 *
 * @param address The address of the account. With an address, the URL gets
 *   `&Email=<encoded address>`, and Google's sign-in page fills in the address. In test
 *   mode, the fake sign-in page gets `?Email=<encoded address>`.
 */
export function signInUrl(address?: string): string {
  const server = testServerUrl()
  const base = server ? `${server}/signin` : SIGN_IN_URL
  if (!address) return base
  return `${base}${server ? '?' : '&'}Email=${encodeURIComponent(address)}`
}

/**
 * The feed label of each feed that the unread count can come from, in URL form.
 *
 * - Whole inbox: the plain feed, with no label.
 * - Primary: the Primary category tab (`^sq_ig_i_personal`).
 * - Important: the messages that Gmail marks important (`^iim`).
 */
export const FEED_LABELS: Readonly<Record<'whole-inbox' | 'primary' | 'important', string>> = {
  'whole-inbox': '',
  primary: '%5Esq_ig_i_personal',
  important: '%5Eiim'
}

/**
 * The URL of the Gmail Atom feed for one label.
 *
 * @param label The feed label, already in URL form (for example `%5Esq_ig_i_personal`).
 *   An empty label gives the feed of the whole inbox. See `FEED_LABELS`.
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

const GMAIL_HOST = 'mail.google.com'
const CALENDAR_HOST = 'calendar.google.com'
const GMAIL_COMPOSE_URL = 'https://mail.google.com/mail/u/0/?extsrc=mailto&url='
const REDIRECT_HOST = 'www.google.com'
const REDIRECT_PATH = '/url'

const TEST_CALENDAR_PATH_PREFIX = '/calendar/'

/** True when the URL is on the fake server and its path starts with the prefix. */
function isTestServerPath(parsed: URL, server: string, prefix: string): boolean {
  return parsed.origin === new URL(server).origin && parsed.pathname.startsWith(prefix)
}

/**
 * True when the URL is a Gmail link: an `https:` URL on the Gmail host
 * (`mail.google.com`), with any path. The link rules use it (see `link-rules.ts`).
 * In test mode, true for a URL under the fake Gmail (`<server>/gmail/`).
 */
export function isGmailLink(url: string): boolean {
  const parsed = parseUrl(url)
  if (!parsed) return false
  const server = testServerUrl()
  if (server) return isTestServerPath(parsed, server, TEST_GMAIL_PATH_PREFIX)
  return parsed.protocol === 'https:' && parsed.hostname === GMAIL_HOST
}

/**
 * True when the URL is a Calendar link: an `https:` URL on the Calendar host
 * (`calendar.google.com`), with any path. In test mode, true for a URL under the fake
 * Calendar (`<server>/calendar/`).
 */
export function isCalendarLink(url: string): boolean {
  const parsed = parseUrl(url)
  if (!parsed) return false
  const server = testServerUrl()
  if (server) return isTestServerPath(parsed, server, TEST_CALENDAR_PATH_PREFIX)
  return parsed.protocol === 'https:' && parsed.hostname === CALENDAR_HOST
}

/**
 * The URL of a new message in Gmail for a `mailto:` link:
 * `https://mail.google.com/mail/u/0/?extsrc=mailto&url=<encoded mailto URL>`.
 * In test mode, the same query on the fake Gmail (`<server>/gmail/`).
 */
export function gmailComposeUrl(mailtoUrl: string): string {
  const server = testServerUrl()
  const base = server ? `${server}/gmail/?extsrc=mailto&url=` : GMAIL_COMPOSE_URL
  return `${base}${encodeURIComponent(mailtoUrl)}`
}

/**
 * The target of a link that goes through Google's redirect page
 * (`https://www.google.com/url?q=<target>`), or `undefined` if the URL is not such a
 * link or its target is not an `http:` or `https:` URL. Gmail sends some links in
 * messages through this page. In test mode, the redirect page is `<server>/url`.
 */
export function googleRedirectTarget(url: string): string | undefined {
  const parsed = parseUrl(url)
  if (!parsed) return undefined
  const server = testServerUrl()
  const isRedirect = server
    ? parsed.origin === new URL(server).origin && parsed.pathname === REDIRECT_PATH
    : parsed.protocol === 'https:' &&
      parsed.hostname === REDIRECT_HOST &&
      parsed.pathname === REDIRECT_PATH
  if (!isRedirect) return undefined
  const target = parsed.searchParams.get('q') ?? parsed.searchParams.get('url')
  if (!target) return undefined
  const parsedTarget = parseUrl(target)
  if (!parsedTarget) return undefined
  return parsedTarget.protocol === 'https:' || parsedTarget.protocol === 'http:'
    ? target
    : undefined
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

/**
 * The URL that opens one message of the feed in the Gmail Google app.
 *
 * The `link` of a feed entry goes to the message in Gmail. Shifted reads it relative to
 * the URL of the feed, and changes `http:` on the Gmail host to `https:`. If the link is
 * empty, or the result is not a Gmail link (see `isGmailLink`), Shifted opens the inbox.
 *
 * @param link The `href` of the `alternate` link of the feed entry.
 */
export function gmailMessageUrl(link: string): string {
  if (link.trim() === '') return gmailUrl()
  let url: URL
  try {
    url = new URL(link, feedUrl())
  } catch {
    return gmailUrl()
  }
  if (!testServerUrl() && url.protocol === 'http:' && url.hostname === GMAIL_HOST) {
    url.protocol = 'https:'
  }
  return isGmailLink(url.href) ? url.href : gmailUrl()
}

/**
 * Where Chromium downloads the spell check dictionaries on Windows and Linux, or
 * `undefined` for Chromium's own place, a Google server. In test mode, the fake server,
 * which has no dictionaries, so that the tests send nothing to Google.
 */
export function spellCheckDictionaryUrl(): string | undefined {
  const server = testServerUrl()
  return server ? `${server}/spellcheck/` : undefined
}
