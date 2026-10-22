import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SIGN_IN_CHECK_LIMIT_MS,
  SIGN_IN_FEED_DELAY_MS,
  SignInCheck,
  signInPageForLog,
  type FeedCheck
} from '../../src/main/sign-in-check'

const GMAIL = 'https://mail.google.com/mail/u/0/'
const SERVICE_LOGIN =
  'https://accounts.google.com/ServiceLogin?service=mail&passive=true&continue=https://mail.google.com/mail/u/0/'
const CHECK_COOKIE =
  'https://accounts.google.com/CheckCookie?continue=https%3A%2F%2Fmail.google.com'
const SIGN_IN_PAGE = 'https://accounts.google.com/v3/signin/identifier?continue=x'

interface Setup {
  check: SignInCheck
  /** What the check did, in order. */
  events: string[]
  /** Set the URL of the fake page. */
  setUrl(next: string): void
  /** Answer a feed read that waits (`pending`). */
  answerFeed(answer: FeedCheck): void
}

/**
 * A fake page and a fake feed, with a record of what the check did.
 *
 * @param feedAnswers The answer of each feed read, in order. `pending` waits for
 *   `answerFeed`. An error makes the read fail.
 */
function setup(feedAnswers: (FeedCheck | 'pending' | Error)[] = ['signed-in']): Setup {
  const events: string[] = []
  let url = GMAIL
  const answers = [...feedAnswers]
  let resolveFeed: ((answer: FeedCheck) => void) | null = null
  const check = new SignInCheck({
    page: {
      hide: () => events.push('hide'),
      show: () => events.push('show'),
      url: () => url,
      restart: () => events.push('restart'),
      stop: () => {
        events.push('stop')
      }
    },
    isSignInPageUrl: (candidate) => new URL(candidate).hostname === 'accounts.google.com',
    readFeed: () => {
      events.push('read feed')
      const answer = answers.shift() ?? 'pending'
      if (answer instanceof Error) return Promise.reject(answer)
      if (answer === 'pending') {
        return new Promise<FeedCheck>((resolve) => {
          resolveFeed = resolve
        })
      }
      return Promise.resolve(answer)
    },
    signedOut: (signInUrl) => events.push(`signed out ${signInUrl}`)
  })
  return {
    check,
    events,
    setUrl: (next: string) => {
      url = next
    },
    answerFeed: (answer: FeedCheck) => resolveFeed?.(answer)
  }
}

/** Let the promises of the feed and of the stop run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('SignInCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lets a redirect pass through the sign-in host, and reads no feed', async () => {
    // After a restart, the feed of a signed-in account answers 401 until Gmail has its
    // cookies again. So a redirect through the sign-in host must not read the feed.
    const { check, events } = setup(['signed-out'])
    check.signInPage('redirect', SERVICE_LOGIN)
    check.signInPage('redirect', CHECK_COOKIE)
    expect(check.isHidden()).toBe(true)
    check.pageCommitted()
    expect(check.isHidden()).toBe(false)
    await vi.advanceTimersByTimeAsync(SIGN_IN_CHECK_LIMIT_MS * 2)
    expect(events).toEqual(['hide', 'show'])
  })

  it('reads no feed for a page of the sign-in host that goes back within the delay', async () => {
    const { check, events, setUrl } = setup(['signed-out'])
    setUrl(CHECK_COOKIE)
    check.signInPage('commit', CHECK_COOKIE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_FEED_DELAY_MS - 1)
    setUrl(GMAIL)
    check.pageCommitted()
    await vi.advanceTimersByTimeAsync(SIGN_IN_CHECK_LIMIT_MS * 2)
    expect(events).toEqual(['hide', 'show'])
  })

  it('signs the account out when the page stops on the sign-in host and the feed says so', async () => {
    const { check, events, setUrl } = setup(['signed-out'])
    setUrl(SIGN_IN_PAGE)
    check.signInPage('commit', SIGN_IN_PAGE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_FEED_DELAY_MS - 1)
    expect(events).toEqual(['hide'])
    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(events).toEqual(['hide', 'read feed', 'stop', `signed out ${SIGN_IN_PAGE}`])
    // The page stays hidden until it commits another page.
    expect(check.isHidden()).toBe(true)
    check.pageCommitted()
    expect(events.at(-1)).toBe('show')
  })

  it('ignores a feed answer that comes after the page is back', async () => {
    const { check, events, setUrl, answerFeed } = setup(['pending'])
    setUrl(SIGN_IN_PAGE)
    check.signInPage('commit', SIGN_IN_PAGE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_FEED_DELAY_MS)
    setUrl(GMAIL)
    check.pageCommitted()
    answerFeed('signed-out')
    await settle()
    expect(events).toEqual(['hide', 'read feed', 'show'])
  })

  it('ignores a "signed out" feed answer when the page left the sign-in host', async () => {
    const { check, events, setUrl, answerFeed } = setup(['pending'])
    setUrl(SIGN_IN_PAGE)
    check.signInPage('commit', SIGN_IN_PAGE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_FEED_DELAY_MS)
    // The page is on its way back to Gmail, but did not commit yet.
    setUrl(GMAIL)
    answerFeed('signed-out')
    await settle()
    expect(events).toEqual(['hide', 'read feed'])
    await vi.advanceTimersByTimeAsync(SIGN_IN_CHECK_LIMIT_MS)
    expect(events).toEqual(['hide', 'read feed', 'show'])
  })

  it('starts one check and reads the feed once for the several events of one navigation', async () => {
    const { check, events, setUrl } = setup(['signed-in', 'signed-in'])
    setUrl(SERVICE_LOGIN)
    check.signInPage('start', SERVICE_LOGIN)
    check.signInPage('start', SERVICE_LOGIN)
    check.signInPage('commit', SERVICE_LOGIN)
    check.signInPage('commit', SERVICE_LOGIN)
    await vi.advanceTimersByTimeAsync(SIGN_IN_FEED_DELAY_MS)
    await settle()
    expect(events).toEqual(['hide', 'read feed'])
  })

  it('a cookie refresh that takes too long restarts the Google app once', async () => {
    const { check, events, setUrl } = setup(['signed-in'])
    setUrl(CHECK_COOKIE)
    check.signInPage('commit', CHECK_COOKIE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_CHECK_LIMIT_MS - 1)
    expect(events).toEqual(['hide', 'read feed'])
    await vi.advanceTimersByTimeAsync(1)
    expect(events).toEqual(['hide', 'read feed', 'restart'])
    // The restart lands on Gmail: the page shows again.
    setUrl(GMAIL)
    check.pageCommitted()
    expect(events).toEqual(['hide', 'read feed', 'restart', 'show'])
  })

  it('signs the account out when the restart lands on the sign-in host again', async () => {
    const { check, events, setUrl } = setup(['signed-in'])
    setUrl(CHECK_COOKIE)
    check.signInPage('commit', CHECK_COOKIE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_CHECK_LIMIT_MS)
    // A redirect of the restart through the sign-in host is not enough.
    check.signInPage('redirect', SERVICE_LOGIN)
    await settle()
    expect(events).toEqual(['hide', 'read feed', 'restart'])
    check.signInPage('commit', SIGN_IN_PAGE)
    await settle()
    expect(events).toEqual(['hide', 'read feed', 'restart', 'stop', `signed out ${SIGN_IN_PAGE}`])
  })

  it('signs the account out when the restart stays on the sign-in host until the limit', async () => {
    const { check, events, setUrl } = setup(['signed-in'])
    setUrl(CHECK_COOKIE)
    check.signInPage('commit', CHECK_COOKIE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_CHECK_LIMIT_MS * 2)
    await settle()
    expect(events).toEqual(['hide', 'read feed', 'restart', 'stop', `signed out ${CHECK_COOKIE}`])
  })

  it('with a feed that fails for another reason, signs out only if the page stays on the sign-in host', async () => {
    const stays = setup(['unknown'])
    stays.setUrl(SIGN_IN_PAGE)
    stays.check.signInPage('commit', SIGN_IN_PAGE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_CHECK_LIMIT_MS)
    await settle()
    // No restart: Shifted cannot tell, so it does not loop.
    expect(stays.events).toEqual(['hide', 'read feed', 'stop', `signed out ${SIGN_IN_PAGE}`])

    const leaves = setup([new Error('offline')])
    leaves.setUrl(SIGN_IN_PAGE)
    leaves.check.signInPage('commit', SIGN_IN_PAGE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_FEED_DELAY_MS)
    await settle()
    leaves.setUrl(GMAIL)
    leaves.check.pageCommitted()
    await vi.advanceTimersByTimeAsync(SIGN_IN_CHECK_LIMIT_MS)
    expect(leaves.events).toEqual(['hide', 'read feed', 'show'])
  })

  it('signs out at the limit when the feed did not answer and the page is on the sign-in host', async () => {
    const { check, events, setUrl } = setup(['pending'])
    setUrl(SIGN_IN_PAGE)
    check.signInPage('commit', SIGN_IN_PAGE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_CHECK_LIMIT_MS)
    await settle()
    expect(events).toEqual(['hide', 'read feed', 'stop', `signed out ${SIGN_IN_PAGE}`])
  })

  it('shows the page at the limit when it left the sign-in host without a commit', async () => {
    const { check, events } = setup(['signed-in'])
    check.signInPage('redirect', SERVICE_LOGIN)
    await vi.advanceTimersByTimeAsync(SIGN_IN_CHECK_LIMIT_MS)
    expect(events).toEqual(['hide', 'show'])
  })

  it('starts a new check for a later trip to the sign-in host', async () => {
    const { check, events, setUrl } = setup(['signed-in'])
    check.signInPage('redirect', SERVICE_LOGIN)
    check.pageCommitted()
    setUrl(SIGN_IN_PAGE)
    check.signInPage('commit', SIGN_IN_PAGE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_FEED_DELAY_MS)
    await settle()
    expect(events).toEqual(['hide', 'show', 'hide', 'read feed'])
  })

  it('does nothing after the page closed', async () => {
    const { check, events, answerFeed, setUrl } = setup(['pending'])
    setUrl(SIGN_IN_PAGE)
    check.signInPage('commit', SIGN_IN_PAGE)
    await vi.advanceTimersByTimeAsync(SIGN_IN_FEED_DELAY_MS)
    check.close()
    answerFeed('signed-out')
    await settle()
    await vi.advanceTimersByTimeAsync(SIGN_IN_CHECK_LIMIT_MS * 3)
    check.signInPage('commit', SIGN_IN_PAGE)
    check.pageCommitted()
    expect(events).toEqual(['hide', 'read feed'])
  })
})

describe('signInPageForLog', () => {
  it('keeps the host and the path, with no query string and no fragment', () => {
    expect(signInPageForLog(SERVICE_LOGIN)).toBe('accounts.google.com/ServiceLogin')
    expect(signInPageForLog(`${SIGN_IN_PAGE}#password`)).toBe(
      'accounts.google.com/v3/signin/identifier'
    )
    expect(signInPageForLog('http://127.0.0.1:4555/signin?Email=a%40b.com')).toBe(
      '127.0.0.1:4555/signin'
    )
  })

  it('says so for a value that is not a URL', () => {
    expect(signInPageForLog('not a url')).toBe('(not a URL)')
  })
})
