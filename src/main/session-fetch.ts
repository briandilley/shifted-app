/**
 * A GET request with the cookies of one session, for the Atom feed.
 *
 * Shifted does not use `session.fetch` here: after a redirect, its response has an empty
 * `url`, and with `redirect: 'manual'` it throws. The feed reader must know when Google
 * sends the request to the sign-in page, also when the sign-in page sends it on to
 * another page. `net.request` reports each redirect.
 */
import { net, type Session } from 'electron'
import type { FeedResponse } from './feed'

/** How long a request may take before Shifted gives up. */
export const REQUEST_TIMEOUT_MS = 30_000

/** The largest answer that Shifted reads. A feed is much smaller. */
const MAX_BODY_BYTES = 5 * 1024 * 1024

/**
 * Send a GET request with the cookies of the session, and follow redirects.
 *
 * @returns The status, the URL of each redirect, and the body. The promise fails
 *   on a network error, after the timeout, or for an answer larger than 5 MB.
 */
export function sessionGet(
  session: Session,
  url: string,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<FeedResponse> {
  return new Promise((resolve, reject) => {
    const redirects: string[] = []
    let done = false
    const request = net.request({
      url,
      method: 'GET',
      session,
      useSessionCookies: true,
      credentials: 'include',
      redirect: 'manual'
    })
    const fail = (error: Error): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      request.abort()
      reject(error)
    }
    const timer = setTimeout(() => fail(new Error('The request timed out.')), timeoutMs)

    request.on('redirect', (_statusCode, _method, redirectUrl) => {
      redirects.push(redirectUrl)
      request.followRedirect()
    })
    request.on('response', (response) => {
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) fail(new Error('The answer is too large.'))
        else chunks.push(chunk)
      })
      response.on('end', () => {
        if (done) return
        done = true
        clearTimeout(timer)
        const body = Buffer.concat(chunks).toString('utf8')
        resolve({ status: response.statusCode, redirects, text: () => Promise.resolve(body) })
      })
      response.on('error', fail)
    })
    request.on('error', fail)
    request.end()
  })
}
