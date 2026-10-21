/**
 * The fake Google test server.
 *
 * It serves fake pages in place of Gmail, Calendar, Google sign-in, and the Atom feed.
 * Shifted uses it when the environment variable `SHIFTED_TEST_SERVER` holds its URL.
 *
 * To add a route, add an entry to `routes` (or call `server.addRoute`). Later prompts add
 * control routes, for example to sign an account out.
 */
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
}

export interface FakeGoogleServer {
  /** The base URL, with no trailing slash, for example `http://127.0.0.1:4555`. */
  url: string
  state: FakeGoogleState
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
    handler: ({ res, state }) => {
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
    handler: ({ res }) => {
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
    handler: ({ res }) => {
      redirect(res, '/gmail/', {
        'Set-Cookie': `${SESSION_COOKIE}=signed-in; Path=/; HttpOnly; SameSite=Lax`
      })
    }
  },
  {
    method: 'GET',
    path: '/feed/atom/',
    handler: ({ res, state }) => {
      sendXml(res, atomFeed(state))
    }
  }
]

/** Start the fake server on a free port of 127.0.0.1. */
export async function startFakeGoogle(
  initialState: Partial<FakeGoogleState> = {}
): Promise<FakeGoogleServer> {
  const state: FakeGoogleState = { address: FAKE_ADDRESS, unreadCount: 0, ...initialState }
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

  return {
    url: `http://127.0.0.1:${port}`,
    state,
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
