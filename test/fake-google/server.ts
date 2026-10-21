/**
 * The fake Google test server.
 *
 * It serves fake pages in place of Gmail, Calendar, Google sign-in, and the Atom feed.
 * Shifted uses it when the environment variable `SHIFTED_TEST_SERVER` holds its URL.
 *
 * To add a route, add an entry to `routes` (or call `server.addRoute`).
 *
 * Sign-in: the fake sign-in page sets the session cookie `FAKE_SID` with a new session ID
 * and goes to `/gmail/`. Without a valid cookie, `/gmail/` goes to `/signin`, and the
 * feed answers 401. The control route `POST /control/sign-out` ends every fake session,
 * so a test can sign an account out.
 */
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

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

/** The state of the fake server. Later prompts add fields here. */
export interface FakeGoogleState {
  address: string
  unreadCount: number
  /** The session IDs that are signed in. A `FAKE_SID` cookie with another value is not. */
  sessionIds: Set<string>
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

function isSignedIn({ cookies, state }: RouteContext): boolean {
  const sessionId = cookies[SESSION_COOKIE]
  return sessionId !== undefined && state.sessionIds.has(sessionId)
}

/** A `Set-Cookie` header that clears the session cookie, if the request has one. */
function clearCookieHeaders({ cookies }: RouteContext): Record<string, string> {
  if (cookies[SESSION_COOKIE] === undefined) return {}
  return { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` }
}

function gmailTitle(state: FakeGoogleState): string {
  return `Inbox (${state.unreadCount}) - ${state.address} - Gmail`
}

function atomFeed(state: FakeGoogleState): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
  <title>Gmail - Inbox for ${escapeHtml(state.address)}</title>
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
      if (!isSignedIn(context)) {
        redirect(res, '/signin', clearCookieHeaders(context))
        return
      }
      sendHtml(
        res,
        gmailTitle(state),
        `    <h1>Fake Gmail</h1>\n    <p id="address">${escapeHtml(state.address)}</p>`
      )
    }
  },
  {
    method: 'GET',
    path: '/calendar/',
    handler: ({ res }) => {
      sendHtml(res, 'Calendar', '    <h1>Fake Calendar</h1>')
    }
  },
  {
    method: 'GET',
    path: '/signin',
    handler: (context) => {
      const { res } = context
      // Like Google, the sign-in page goes straight to Gmail when the session is signed in.
      if (isSignedIn(context)) {
        redirect(res, '/gmail/')
        return
      }
      sendHtml(
        res,
        'Sign in - Google Accounts',
        `    <h1>Fake Google sign-in</h1>
    <form method="post" action="/signin">
      <button type="submit">Sign in</button>
    </form>`
      )
    }
  },
  {
    // The "Sign in" button posts here. It sets the session cookie and goes to Gmail.
    method: 'POST',
    path: '/signin',
    handler: ({ res, state }) => {
      const sessionId = randomUUID()
      state.sessionIds.add(sessionId)
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
      if (!isSignedIn(context)) {
        res.writeHead(401, {
          'Content-Type': 'text/plain; charset=utf-8',
          ...clearCookieHeaders(context)
        })
        res.end('Unauthorized')
        return
      }
      sendXml(res, atomFeed(state))
    }
  },
  {
    // Control route for tests: end every fake session. The next request of each
    // session gets a response that clears its cookie.
    method: 'POST',
    path: '/control/sign-out',
    handler: ({ res, state }) => {
      state.sessionIds.clear()
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
    sessionIds: new Set(),
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
