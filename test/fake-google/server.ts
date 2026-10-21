/**
 * The fake Google test server.
 *
 * It serves fake pages in place of Gmail, Calendar, Google sign-in, and the Atom feed.
 * Shifted uses it when the environment variable `SHIFTED_TEST_SERVER` holds its URL.
 *
 * To add a route, add an entry to `routes` (or call `server.addRoute`).
 *
 * Sign-in: the fake sign-in page has an email field, filled with `state.address`. Its
 * "Sign in" button sets the session cookie `FAKE_SID` with a new session ID and goes to
 * `/gmail/`. Each session belongs to the address that signed in, so each account of
 * Shifted, with its own cookie, sees its own fake address. Without a valid cookie,
 * `/gmail/` and `/calendar/` go to `/signin`, and the feed answers 401. The control route
 * `POST /control/sign-out` ends every fake session, so a test can sign an account out.
 *
 * The fake Gmail page shows the profile photo `/avatar.png` where `src/main/gmail-page.ts`
 * looks for it. The photo is a square in a color that depends on the address.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { crc32, deflateSync } from 'node:zlib'

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

/** The state of the fake server. Later prompts add fields here. */
export interface FakeGoogleState {
  /** The address that the email field of the fake sign-in page shows first. */
  address: string
  unreadCount: number
  /** The sessions that are signed in, by session ID. A `FAKE_SID` cookie with another value is not. */
  sessions: Map<string, FakeSession>
}

export interface FakeGoogleServer {
  /** The base URL, with no trailing slash, for example `http://127.0.0.1:4555`. */
  url: string
  state: FakeGoogleState
  /** Call the control route that ends every fake session. */
  signOut(): Promise<void>
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

function gmailTitle(state: FakeGoogleState, address: string): string {
  return `Inbox (${state.unreadCount}) - ${address} - Gmail`
}

function atomFeed(state: FakeGoogleState, address: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
  <title>Gmail - Inbox for ${escapeHtml(address)}</title>
  <tagline>New messages in your Gmail Inbox</tagline>
  <fullcount>${state.unreadCount}</fullcount>
  <link rel="alternate" href="/gmail/" type="text/html" />
  <modified>${new Date().toISOString()}</modified>
</feed>
`
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
      // Like Gmail, the account button links to "SignOutOptions" and holds the photo.
      sendHtml(
        res,
        gmailTitle(state, session.address),
        `    <header>
      <a href="/SignOutOptions" aria-label="Google Account: ${escapeHtml(session.address)}"><img class="gbii" src="/avatar.png" alt="" width="32" height="32" /></a>
    </header>
    <h1>Fake Gmail</h1>
    <p id="address">${escapeHtml(session.address)}</p>`
      )
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
        `    <h1>Fake Calendar</h1>\n    <p id="address">${escapeHtml(session.address)}</p>`
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
      const { res, state } = context
      // Like Google, the sign-in page goes straight to Gmail when the session is signed in.
      if (currentSession(context)) {
        redirect(res, '/gmail/')
        return
      }
      sendHtml(
        res,
        'Sign in - Google Accounts',
        `    <h1>Fake Google sign-in</h1>
    <form method="post" action="/signin">
      <label>Email <input type="email" name="email" value="${escapeHtml(state.address)}" /></label>
      <button type="submit">Sign in</button>
    </form>`
      )
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
  {
    method: 'GET',
    path: '/feed/atom/',
    handler: (context) => {
      const { res, state } = context
      const session = currentSession(context)
      if (!session) {
        res.writeHead(401, {
          'Content-Type': 'text/plain; charset=utf-8',
          ...clearCookieHeaders(context)
        })
        res.end('Unauthorized')
        return
      }
      sendXml(res, atomFeed(state, session.address))
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
    unreadCount: 0,
    sessions: new Map(),
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
