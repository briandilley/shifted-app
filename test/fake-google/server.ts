/**
 * The fake Google test server.
 *
 * It serves fake pages in place of Gmail, Calendar, Google sign-in, and the Atom feed.
 * Shifted uses it when the environment variable `SHIFTED_TEST_SERVER` holds its URL.
 *
 * To add a route, add an entry to `routes` (or call `server.addRoute`).
 *
 * Sign-in: the fake sign-in page has an email field, filled with the `Email` parameter of
 * the URL (which it also shows in `#email-param`), else with `state.address`. Its
 * "Sign in" button sets the session cookie `FAKE_SID` with a new session ID and goes to
 * `/gmail/`. Each session belongs to the address that signed in, so each account of
 * Shifted, with its own cookie, sees its own fake address. Without a valid cookie,
 * `/gmail/` and `/calendar/` go to `/signin`, and the feed answers 401. The control route
 * `POST /control/sign-out` ends every fake session, so a test can sign an account out.
 *
 * The fake Gmail page shows the profile photo `/avatar.png` where `src/main/gmail-page.ts`
 * looks for it. The photo is a square in a color that depends on the address.
 *
 * The fake Atom feed: `/feed/atom/` (whole inbox), `/feed/atom/%5Esq_ig_i_personal`
 * (Primary), and `/feed/atom/%5Eiim` (Important). A test sets the count and the entries
 * of each feed, for each address or for every address, with the control route
 * `POST /control/feed` (or `server.setFeed`). The title of the fake Gmail page follows
 * the Primary count of its address, for example `Inbox (3) - test@example.com - Gmail`,
 * or `Inbox - test@example.com - Gmail` for 0. The control route
 * `POST /control/feed-failure` (or `server.setFeedFailure`) makes every feed answer
 * HTTP 500 until a test turns it off again.
 *
 * The control route `POST /control/feed-entry` (or `server.addFeedEntry`) adds one new
 * message to the fake feeds of an address, as when a new email arrives.
 *
 * The cookie hop: a signed-in Gmail session also passes through Google's sign-in host,
 * for example when Google sets the cookies of Gmail. `/gmail/?hop=<kind>` imitates it for
 * a signed-in session. `redirect` answers with a redirect to `/signin`, which redirects
 * straight back to `/gmail/`. `script` and `meta` redirect to `/signin/check-cookie`, a
 * page on the fake sign-in path that goes back to `/gmail/` by script or by meta refresh.
 * `stuck` goes to the same page, which never goes back. `state.signInHops` counts the
 * visits of a signed-in session to the fake sign-in path.
 *
 * The fake Calendar page has a button `#notify` that calls
 * `new Notification('Meeting in 10 minutes', ...)`, like a Calendar reminder. The fake
 * Gmail page has a button `#chat-notify` that makes a web notification, like a Google
 * Chat message. A click on either notification writes "clicked" into `#notification-status`.
 *
 * The fake Gmail page also has the links that the link rules handle: a pop-out that opens
 * `about:blank` and writes a fake compose form into it, a link to a fake Calendar event,
 * links to an outside page, a `mailto:` link, a button that asks for the microphone, and
 * a file download. With `?extsrc=mailto&url=<mailto URL>`, it shows the `mailto:` URL in
 * `#compose-url`, like a new message in Gmail.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { crc32, deflateSync } from 'node:zlib'
import { FEED_LABELS } from '../../src/main/google-urls'

export const FAKE_ADDRESS = 'test@example.com'
export const SESSION_COOKIE = 'FAKE_SID'

/** The context that each route handler gets. */
export interface RouteContext {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  /** The cookies of the request, by name. */
  cookies: Record<string, string>
  /** The state of the fake server. Tests and later routes can change it. */
  state: FakeGoogleState
}

export type RouteHandler = (context: RouteContext) => void | Promise<void>

/** One route: an HTTP method (or `*` for all) and an exact path. */
export interface Route {
  method: string
  path: string
  handler: RouteHandler
}

/** One signed-in fake session. */
export interface FakeSession {
  /** The address that signed in. */
  address: string
}

/** The feeds of the fake server: the names of `FEED_LABELS` in `src/main/google-urls.ts`. */
export type FakeFeedName = keyof typeof FEED_LABELS

export const FAKE_FEED_NAMES = Object.keys(FEED_LABELS) as FakeFeedName[]

/** One message in a fake feed. */
export interface FakeFeedEntry {
  id: string
  title: string
  authorName: string
  authorEmail: string
  /** ISO 8601 time. */
  issued: string
}

/** What one fake feed of one address says. */
export interface FakeFeed {
  count: number
  entries: FakeFeedEntry[]
}

/** The value that sets one fake feed (see `POST /control/feed`). */
export interface FakeFeedSetting {
  /** The address of the account. Without it, the feed of every address that has no own value. */
  address?: string
  feed: FakeFeedName
  count: number
  entries?: FakeFeedEntry[]
}

/**
 * How the fake feeds fail: HTTP 500, or a redirect to the fake sign-in page, as Google
 * can do for a session that is signed out.
 */
export type FakeFeedFailure = 'http-500' | 'sign-in-redirect'

/** The address key of the feeds that every address uses when it has no own value. */
const EVERY_ADDRESS = '*'

/** The state of the fake server. Later prompts add fields here. */
export interface FakeGoogleState {
  /** The address that the email field of the fake sign-in page shows first. */
  address: string
  /** The fake feeds, by `<address or *> <feed name>`. A missing feed has count 0 and no entries. */
  feeds: Map<string, FakeFeed>
  /** How every feed fails now, or `null` while the feeds work. */
  feedFailure: FakeFeedFailure | null
  /** The sessions that are signed in, by session ID. A `FAKE_SID` cookie with another value is not. */
  sessions: Map<string, FakeSession>
  /** How many times a signed-in session came to the fake sign-in path (the cookie hop). */
  signInHops: number
}

/** The value that adds one message to the fake feeds (see `POST /control/feed-entry`). */
export interface FakeFeedEntrySetting {
  /** The address of the account. Without it, the feeds of every address with no own value. */
  address?: string
  /** The feeds that get the message. Without it, the "Whole inbox" and "Primary" feeds. */
  feeds?: FakeFeedName[]
  entry: FakeFeedEntry
}

export interface FakeGoogleServer {
  /** The base URL, with no trailing slash, for example `http://127.0.0.1:4555`. */
  url: string
  state: FakeGoogleState
  /** Call the control route that ends every fake session. */
  signOut(): Promise<void>
  /** Call the control route that sets the count and the entries of a fake feed. */
  setFeed(setting: FakeFeedSetting): Promise<void>
  /**
   * Call the control route that adds one message to the fake feeds of an address: the
   * entry goes first in each feed, and the count of each feed goes up by 1.
   */
  addFeedEntry(setting: FakeFeedEntrySetting): Promise<void>
  /**
   * Call the control route that makes every feed fail: `true` or `'http-500'` answers
   * HTTP 500, `'sign-in-redirect'` goes to the sign-in page, and `false` makes it work again.
   */
  setFeedFailure(fail: boolean | FakeFeedFailure): Promise<void>
  addRoute(route: Route): void
  close(): Promise<void>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function sendHtml(res: ServerResponse, title: string, body: string, status = 200): void {
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>
  <body>
${body}
  </body>
</html>
`
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(html)
}

export function sendPng(res: ServerResponse, png: Buffer): void {
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
  res.end(png)
}

export function sendXml(res: ServerResponse, xml: string, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/atom+xml; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(xml)
}

export function redirect(
  res: ServerResponse,
  location: string,
  headers: Record<string, string | string[]> = {}
): void {
  res.writeHead(302, { Location: location, ...headers })
  res.end()
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return cookies
}

/** The session cookie lasts one year, so that it persists on disk like Google's. */
const SESSION_COOKIE_MAX_AGE = 365 * 24 * 60 * 60

/** The signed-in session of the request, or `undefined` if the request is not signed in. */
function currentSession({ cookies, state }: RouteContext): FakeSession | undefined {
  const sessionId = cookies[SESSION_COOKIE]
  return sessionId === undefined ? undefined : state.sessions.get(sessionId)
}

/** Read the body of a request as text. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

/** A PNG image of one color, `size` by `size` pixels. */
export function solidPng(red: number, green: number, blue: number, size = 64): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // color type: RGB
  const row = Buffer.alloc(1 + size * 3)
  for (let x = 0; x < size; x++) row.set([red, green, blue], 1 + x * 3)
  const pixels = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

/** The fake profile photo of an address: a square in a color made from the address. */
export function avatarPng(address: string): Buffer {
  const [red = 0, green = 0, blue = 0] = createHash('sha256').update(address).digest()
  return solidPng(red, green, blue)
}

/** A `Set-Cookie` header that clears the session cookie, if the request has one. */
function clearCookieHeaders({ cookies }: RouteContext): Record<string, string> {
  if (cookies[SESSION_COOKIE] === undefined) return {}
  return { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` }
}

/** The fake feed of an address: its own value, else the value for every address, else empty. */
export function fakeFeed(state: FakeGoogleState, address: string, feed: FakeFeedName): FakeFeed {
  return (
    state.feeds.get(`${address} ${feed}`) ??
    state.feeds.get(`${EVERY_ADDRESS} ${feed}`) ?? { count: 0, entries: [] }
  )
}

/** Like Gmail, the title shows the Primary count next to Inbox, and no number for 0. */
function gmailTitle(state: FakeGoogleState, address: string): string {
  const count = fakeFeed(state, address, 'primary').count
  return count > 0 ? `Inbox (${count}) - ${address} - Gmail` : `Inbox - ${address} - Gmail`
}

function atomEntry(entry: FakeFeedEntry): string {
  return `  <entry>
    <title>${escapeHtml(entry.title)}</title>
    <summary></summary>
    <link rel="alternate" href="/gmail/?message_id=${encodeURIComponent(entry.id)}&amp;view=conv&amp;extsrc=atom" type="text/html" />
    <modified>${escapeHtml(entry.issued)}</modified>
    <issued>${escapeHtml(entry.issued)}</issued>
    <id>tag:gmail.google.com,2004:${escapeHtml(entry.id)}</id>
    <author>
      <name>${escapeHtml(entry.authorName)}</name>
      <email>${escapeHtml(entry.authorEmail)}</email>
    </author>
  </entry>
`
}

function atomFeed(state: FakeGoogleState, address: string, feed: FakeFeedName): string {
  const { count, entries } = fakeFeed(state, address, feed)
  // The fake label feeds get another title, so that Shifted cannot depend on their title.
  const label = decodeURIComponent(FEED_LABELS[feed])
  const title =
    feed === 'whole-inbox'
      ? `Gmail - Inbox for ${address}`
      : `Gmail - Label '${label}' for ${address}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
  <title>${escapeHtml(title)}</title>
  <tagline>New messages in your Gmail Inbox</tagline>
  <fullcount>${count}</fullcount>
  <link rel="alternate" href="/gmail/" type="text/html" />
  <modified>${new Date().toISOString()}</modified>
${entries.map(atomEntry).join('')}</feed>
`
}

function isFakeFeedName(value: unknown): value is FakeFeedName {
  return typeof value === 'string' && (FAKE_FEED_NAMES as string[]).includes(value)
}

function isFakeFeedEntry(value: unknown): value is FakeFeedEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return ['id', 'title', 'authorName', 'authorEmail', 'issued'].every(
    (key) => typeof entry[key] === 'string'
  )
}

/** The route of one fake feed. */
function feedRoute(feed: FakeFeedName): Route {
  return {
    method: 'GET',
    path: `/feed/atom/${FEED_LABELS[feed]}`,
    handler: (context) => {
      const { res, state } = context
      if (state.feedFailure === 'http-500') {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Fake feed failure')
        return
      }
      if (state.feedFailure === 'sign-in-redirect') {
        redirect(res, '/signin')
        return
      }
      const session = currentSession(context)
      if (!session) {
        res.writeHead(401, {
          'Content-Type': 'text/plain; charset=utf-8',
          ...clearCookieHeaders(context)
        })
        res.end('Unauthorized')
        return
      }
      sendXml(res, atomFeed(state, session.address, feed))
    }
  }
}

/**
 * The file that the fake Gmail page offers for download. Like a Gmail attachment, the
 * download starts on a Gmail page, so that the link rules keep it in Shifted.
 */
export const FAKE_DOWNLOAD_NAME = 'report.txt'
export const FAKE_DOWNLOAD_PATH = '/gmail/attachment'
export const FAKE_DOWNLOAD_CONTENT = 'A fake report from the fake Gmail.\n'
/** The outside pages that the fake Gmail page links to. */
export const OUTSIDE_LINK = 'https://example.com/doc'
export const OUTSIDE_NEW_WINDOW_LINK = 'https://example.com/new-window'
export const MAILTO_LINK = 'mailto:friend@example.com?subject=Hello'
/** The path of the fake Calendar event that the fake Gmail page links to. */
export const CALENDAR_EVENT_PATH = '/calendar/event?eid=fake-event'

/** The script of the fake Gmail page: the pop-out and the microphone button. */
const FAKE_GMAIL_SCRIPT = `
document.getElementById('pop-out').addEventListener('click', () => {
  const popOut = window.open('about:blank', '_blank', 'width=520,height=480')
  if (!popOut) return
  popOut.document.write('<!doctype html><title>Compose</title><h1 id="compose-title">Fake compose</h1>' +
    '<form id="compose"><label>To <input name="to"></label> <label>Subject <input name="subject"></label>' +
    '<textarea name="body"></textarea><button type="submit">Send</button></form>')
  popOut.document.close()
})
document.getElementById('microphone').addEventListener('click', () => {
  const status = document.getElementById('microphone-status')
  navigator.mediaDevices.getUserMedia({ audio: true }).then(
    (stream) => {
      stream.getTracks().forEach((track) => track.stop())
      status.textContent = 'allowed'
    },
    (error) => {
      status.textContent = error.name
    }
  )
})
`

/** The title of the fake Calendar reminder. */
export const FAKE_REMINDER_TITLE = 'Meeting in 10 minutes'
/** The title of the fake Chat message. */
export const FAKE_CHAT_TITLE = 'Alex Example'

/**
 * A script that makes a web notification when the button `buttonId` is clicked. A click
 * on the notification writes "clicked" into `#notification-status`.
 */
function notificationScript(buttonId: string, title: string, options: object): string {
  return `
document.getElementById(${JSON.stringify(buttonId)}).addEventListener('click', () => {
  const notification = new Notification(${JSON.stringify(title)}, ${JSON.stringify(options)})
  window.shiftedTestNotification = notification
  notification.onclick = () => {
    document.getElementById('notification-status').textContent = 'clicked'
  }
})
`
}

/** The links of the fake Gmail page. */
function fakeGmailLinks(url: URL): string {
  const compose =
    url.searchParams.get('extsrc') === 'mailto'
      ? `\n    <p id="compose-url">${escapeHtml(url.searchParams.get('url') ?? '')}</p>`
      : ''
  return `${compose}
    <nav>
      <button id="pop-out" type="button">Pop out</button>
      <a id="calendar-link" href="${escapeHtml(CALENDAR_EVENT_PATH)}" target="_blank">Fake invitation</a>
      <a id="outside-link" href="${OUTSIDE_LINK}">Outside document</a>
      <a id="outside-new-window-link" href="${OUTSIDE_NEW_WINDOW_LINK}" target="_blank">Outside page in a new window</a>
      <a id="mailto-link" href="${escapeHtml(MAILTO_LINK)}">Write to a friend</a>
      <button id="microphone" type="button">Use the microphone</button>
      <span id="microphone-status"></span>
      <a id="download-link" href="${FAKE_DOWNLOAD_PATH}">Download the report</a>
      <a id="download-new-window-link" href="${FAKE_DOWNLOAD_PATH}" target="_blank">Download the report in a new window</a>
      <button id="chat-notify" type="button">Fake Chat message</button>
      <span id="notification-status"></span>
    </nav>
    <script>${FAKE_GMAIL_SCRIPT}${notificationScript('chat-notify', FAKE_CHAT_TITLE, { body: 'Are you free for lunch?', tag: 'chat-1' })}</script>`
}

/** The kinds of cookie hop of `/gmail/?hop=<kind>`. */
export type FakeCookieHop = 'redirect' | 'script' | 'meta' | 'stuck'

/** The page on the fake sign-in path that a cookie hop shows. */
export const FAKE_COOKIE_CHECK_PATH = '/signin/check-cookie'

/** Where `/gmail/?hop=<kind>` sends a signed-in session first. */
function cookieHopLocation(hop: string | null): string | undefined {
  switch (hop) {
    case 'redirect':
      return '/signin?continue=%2Fgmail%2F'
    case 'script':
    case 'meta':
    case 'stuck':
      return `${FAKE_COOKIE_CHECK_PATH}?back=${hop}`
    default:
      return undefined
  }
}

/** The page of a cookie hop on the fake sign-in path. It goes back to Gmail, or never. */
function cookieCheckPage(res: ServerResponse, back: string | null): void {
  const goBack =
    back === 'script'
      ? `<script>setTimeout(() => location.replace('/gmail/'), 200)</script>`
      : back === 'meta'
        ? `<meta http-equiv="refresh" content="0;url=/gmail/" />`
        : ''
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Fake cookie check</title>${goBack}</head>
  <body><h1 id="cookie-check">Fake cookie check</h1></body>
</html>
`)
}

/** The routes of the fake server. */
export const routes: Route[] = [
  {
    method: 'GET',
    path: '/gmail/',
    handler: (context) => {
      const { res, state } = context
      const session = currentSession(context)
      if (!session) {
        redirect(res, '/signin', clearCookieHeaders(context))
        return
      }
      const hop = cookieHopLocation(context.url.searchParams.get('hop'))
      if (hop) {
        redirect(res, hop)
        return
      }
      // Like Gmail, the account button links to "SignOutOptions" and holds the photo.
      sendHtml(
        res,
        gmailTitle(state, session.address),
        `    <header>
      <a href="/SignOutOptions" aria-label="Google Account: ${escapeHtml(session.address)}"><img class="gbii" src="/avatar.png" alt="" width="32" height="32" /></a>
    </header>
    <h1>Fake Gmail</h1>
    <p id="address">${escapeHtml(session.address)}</p>${fakeGmailLinks(context.url)}`
      )
    }
  },
  {
    method: 'GET',
    path: '/calendar/event',
    handler: (context) => {
      const { res, url } = context
      const session = currentSession(context)
      if (!session) {
        redirect(res, '/signin', clearCookieHeaders(context))
        return
      }
      sendHtml(
        res,
        'Calendar event',
        `    <h1>Fake Calendar event</h1>
    <p id="event">${escapeHtml(url.searchParams.get('eid') ?? '')}</p>
    <p id="address">${escapeHtml(session.address)}</p>`
      )
    }
  },
  {
    method: 'GET',
    path: FAKE_DOWNLOAD_PATH,
    handler: (context) => {
      const { res } = context
      if (!currentSession(context)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('No file')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${FAKE_DOWNLOAD_NAME}"`,
        'Cache-Control': 'no-store'
      })
      res.end(FAKE_DOWNLOAD_CONTENT)
    }
  },
  {
    method: 'GET',
    path: '/calendar/',
    handler: (context) => {
      const { res } = context
      const session = currentSession(context)
      if (!session) {
        redirect(res, '/signin', clearCookieHeaders(context))
        return
      }
      sendHtml(
        res,
        'Calendar',
        `    <h1>Fake Calendar</h1>
    <p id="address">${escapeHtml(session.address)}</p>
    <button id="notify" type="button">Fake reminder</button>
    <span id="notification-status"></span>
    <script>${notificationScript('notify', FAKE_REMINDER_TITLE, { body: 'Planning, 10:00 to 10:30', tag: 'reminder-1' })}</script>`
      )
    }
  },
  {
    method: 'GET',
    path: '/avatar.png',
    handler: (context) => {
      const { res } = context
      const session = currentSession(context)
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('No photo')
        return
      }
      sendPng(res, avatarPng(session.address))
    }
  },
  {
    method: 'GET',
    path: '/signin',
    handler: (context) => {
      const { res, state, url } = context
      // Like Google, the sign-in page goes straight to Gmail when the session is signed in.
      if (currentSession(context)) {
        state.signInHops += 1
        redirect(res, '/gmail/')
        return
      }
      // Like Google, the `Email` parameter fills in the address. The page also shows the
      // parameter in `#email-param`, so that a test can read it.
      const emailParam = url.searchParams.get('Email')
      sendHtml(
        res,
        'Sign in - Google Accounts',
        `    <h1>Fake Google sign-in</h1>
    <p>Email parameter: <span id="email-param">${escapeHtml(emailParam ?? '')}</span></p>
    <form method="post" action="/signin">
      <label>Email <input type="email" name="email" value="${escapeHtml(emailParam || state.address)}" /></label>
      <button type="submit">Sign in</button>
    </form>`
      )
    }
  },
  {
    // The page of a cookie hop. A session that is not signed in goes to the sign-in page.
    method: 'GET',
    path: FAKE_COOKIE_CHECK_PATH,
    handler: (context) => {
      const { res, state, url } = context
      if (!currentSession(context)) {
        redirect(res, '/signin', clearCookieHeaders(context))
        return
      }
      state.signInHops += 1
      cookieCheckPage(res, url.searchParams.get('back'))
    }
  },
  {
    // The "Sign in" button posts here. It sets the session cookie and goes to Gmail.
    method: 'POST',
    path: '/signin',
    handler: async ({ req, res, state }) => {
      const email = new URLSearchParams(await readBody(req)).get('email')?.trim()
      const sessionId = randomUUID()
      state.sessions.set(sessionId, { address: email || state.address })
      redirect(res, '/gmail/', {
        'Set-Cookie': `${SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`
      })
    }
  },
  ...FAKE_FEED_NAMES.map(feedRoute),
  {
    // Control route for tests: set the count and the entries of one fake feed. The body
    // is JSON: { address?, feed: "whole-inbox" | "primary" | "important", count, entries? }.
    method: 'POST',
    path: '/control/feed',
    handler: async ({ req, res, state }) => {
      const body = JSON.parse(await readBody(req)) as Record<string, unknown>
      const { address, feed, count } = body
      const entries = body['entries'] ?? []
      if (
        (address !== undefined && typeof address !== 'string') ||
        !isFakeFeedName(feed) ||
        typeof count !== 'number' ||
        !Number.isInteger(count) ||
        count < 0 ||
        !Array.isArray(entries) ||
        !entries.every(isFakeFeedEntry)
      ) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Bad feed setting')
        return
      }
      state.feeds.set(`${address ?? EVERY_ADDRESS} ${feed}`, { count, entries })
      res.writeHead(204)
      res.end()
    }
  },
  {
    // Control route for tests: add one new message to the fake feeds of an address. The
    // body is JSON: { address?, feeds?: ["whole-inbox" | "primary" | "important"], entry }.
    // The entry goes first in each feed, and the count of each feed goes up by 1.
    method: 'POST',
    path: '/control/feed-entry',
    handler: async ({ req, res, state }) => {
      const body = JSON.parse(await readBody(req)) as Record<string, unknown>
      const { address, entry } = body
      const feeds = body['feeds'] ?? ['whole-inbox', 'primary']
      if (
        (address !== undefined && typeof address !== 'string') ||
        !Array.isArray(feeds) ||
        !feeds.every(isFakeFeedName) ||
        !isFakeFeedEntry(entry)
      ) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Bad feed entry')
        return
      }
      for (const feed of feeds) {
        const current = fakeFeed(state, address ?? EVERY_ADDRESS, feed)
        state.feeds.set(`${address ?? EVERY_ADDRESS} ${feed}`, {
          count: current.count + 1,
          entries: [entry, ...current.entries]
        })
      }
      res.writeHead(204)
      res.end()
    }
  },
  {
    // Control route for tests: make every feed fail, or work again. The body is JSON:
    // { fail: true | "http-500" | "sign-in-redirect" | false }. `true` means HTTP 500.
    method: 'POST',
    path: '/control/feed-failure',
    handler: async ({ req, res, state }) => {
      const { fail } = JSON.parse(await readBody(req)) as Record<string, unknown>
      if (typeof fail !== 'boolean' && fail !== 'http-500' && fail !== 'sign-in-redirect') {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Bad feed failure setting')
        return
      }
      state.feedFailure = fail === true ? 'http-500' : fail === false ? null : fail
      res.writeHead(204)
      res.end()
    }
  },
  {
    // Control route for tests: end every fake session. The next request of each
    // session gets a response that clears its cookie.
    method: 'POST',
    path: '/control/sign-out',
    handler: ({ res, state }) => {
      state.sessions.clear()
      res.writeHead(204)
      res.end()
    }
  }
]

/** Start the fake server on a free port of 127.0.0.1. */
export async function startFakeGoogle(
  initialState: Partial<FakeGoogleState> = {}
): Promise<FakeGoogleServer> {
  const state: FakeGoogleState = {
    address: FAKE_ADDRESS,
    feeds: new Map(),
    feedFailure: null,
    sessions: new Map(),
    signInHops: 0,
    ...initialState
  }
  const serverRoutes = [...routes]

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const method = req.method ?? 'GET'
    const route = serverRoutes.find(
      (candidate) =>
        candidate.path === url.pathname && (candidate.method === '*' || candidate.method === method)
    )
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`Not found: ${method} ${url.pathname}`)
      return
    }
    const context: RouteContext = {
      req,
      res,
      url,
      cookies: parseCookies(req.headers.cookie),
      state
    }
    Promise.resolve(route.handler(context)).catch((error: unknown) => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(String(error))
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  const url = `http://127.0.0.1:${port}`

  return {
    url,
    state,
    async signOut(): Promise<void> {
      const response = await fetch(`${url}/control/sign-out`, { method: 'POST' })
      if (!response.ok) throw new Error(`The fake sign-out failed: HTTP ${response.status}`)
    },
    async setFeed(setting: FakeFeedSetting): Promise<void> {
      const response = await fetch(`${url}/control/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setting)
      })
      if (!response.ok) throw new Error(`The fake feed setting failed: HTTP ${response.status}`)
    },
    async addFeedEntry(setting: FakeFeedEntrySetting): Promise<void> {
      const response = await fetch(`${url}/control/feed-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setting)
      })
      if (!response.ok) throw new Error(`The fake feed entry failed: HTTP ${response.status}`)
    },
    async setFeedFailure(fail: boolean | FakeFeedFailure): Promise<void> {
      const response = await fetch(`${url}/control/feed-failure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fail })
      })
      if (!response.ok) throw new Error(`The fake feed failure failed: HTTP ${response.status}`)
    },
    addRoute(route: Route): void {
      serverRoutes.unshift(route)
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  }
}
