/**
 * The sign-in check of one Google page of an account: the Gmail view, the Calendar view,
 * or a child window. It decides whether a trip of the page to Google's sign-in page means
 * that Google signed the account out.
 *
 * A signed-in session of Gmail also passes through Google's sign-in host, for example the
 * redirects that set the cookies of Gmail on the first load after sign-in, and the
 * periodic cookie refresh. So a trip to the sign-in host alone is not a sign-out. See
 * "Fix after the first real sign-in" in `docs/decisions.md`.
 *
 * What the check does:
 *
 * 1. When the page starts to go to the sign-in host, or a redirect passes through it, the
 *    page is hidden at once, so that Google's sign-in page never shows.
 * 2. When the page commits a page that is not on the sign-in host, the check ends and the
 *    page shows again.
 * 3. Only a page that stops on the sign-in host can mean a sign-out. When the page commits
 *    a page of the sign-in host and is still there after `SIGN_IN_FEED_DELAY_MS`, Shifted
 *    reads the feed of the account. If the feed says "signed out", the account is signed
 *    out: Shifted stops the page. The feed is not read during the redirects: while Google
 *    sets the cookies of Gmail again, for example after a restart, the feed of a
 *    signed-in account answers HTTP 401.
 * 4. If the feed works, Google refreshes the cookies. If the page is still on the sign-in
 *    host after the time limit, Shifted loads the first page of the Google app once. If
 *    it lands on the sign-in host again, the account is signed out.
 * 5. If the feed fails for another reason, or does not answer in time, the account is
 *    signed out only if the page is still on the sign-in host after the time limit.
 *
 * This module needs no Electron. The caller gives it the page and the feed.
 */

/** The time that Google gets to bring a page back from the sign-in host. */
export const SIGN_IN_CHECK_LIMIT_MS = 15_000

/**
 * The time that a committed page of the sign-in host gets to go back by itself, for
 * example by a script, before Shifted reads the feed.
 */
export const SIGN_IN_FEED_DELAY_MS = 3_000

/**
 * What the feed of the account says during a check.
 *
 * - `signed-in`: the feed works, so the account is signed in.
 * - `signed-out`: Google signed the account out.
 * - `unknown`: the feed failed for another reason, for example offline or an HTTP error.
 */
export type FeedCheck = 'signed-in' | 'signed-out' | 'unknown'

/**
 * How a page goes to the sign-in host.
 *
 * - `redirect`: an HTTP redirect of the main frame goes there. It can pass through.
 * - `start`: a navigation of the main frame to the sign-in host starts.
 * - `commit`: the main frame committed a page of the sign-in host.
 */
export type SignInPageStep = 'redirect' | 'start' | 'commit'

/** The page that the check controls. */
export interface CheckedPage {
  /** Hide the page, so that the sign-in page never shows. */
  hide(): void
  /** Show the page again. */
  show(): void
  /** The URL of the page now. */
  url(): string
  /**
   * Load the first page of the Google app again. A child window has no first page: it
   * closes.
   */
  restart(): void
  /**
   * Stop the page, because the account is signed out. The promise ends when the page
   * stopped.
   */
  stop(): Promise<void> | void
}

export interface SignInCheckDeps {
  page: CheckedPage
  /** True when the URL is a page of Google's sign-in host. */
  isSignInPageUrl(url: string): boolean
  /** Read the feed of the account. */
  readFeed(): Promise<FeedCheck>
  /**
   * The account is signed out. Called after the page stopped.
   *
   * @param url The URL of the sign-in page that the page went to.
   */
  signedOut(url: string): void
  /** The time limit. The default is `SIGN_IN_CHECK_LIMIT_MS`. */
  limitMs?: number
  /**
   * The wait before the feed read. The default is `SIGN_IN_FEED_DELAY_MS`, or a fifth of
   * the limit when that is shorter.
   */
  feedDelayMs?: number
}

interface RunningCheck {
  /** Each check has its own number, so that a late feed answer of an old check is ignored. */
  id: number
  feed: FeedCheck | 'pending'
  /** True after Shifted loaded the first page of the Google app again. */
  restarted: boolean
  /** True after the check asked for the feed, or planned to ask for it. */
  feedAsked: boolean
  /** The last sign-in URL that the page went to. */
  url: string
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * The host and the path of a URL, with no query string and no fragment. Shifted writes it
 * to the console when it finds an account signed out, so that a report shows which
 * Google page caused it, without the values in the query string.
 */
export function signInPageForLog(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}`
  } catch {
    return '(not a URL)'
  }
}

export class SignInCheck {
  private check: RunningCheck | null = null
  private hidden = false
  private nextId = 1
  private closed = false
  private readonly limitMs: number
  private readonly feedDelayMs: number

  constructor(private readonly deps: SignInCheckDeps) {
    this.limitMs = deps.limitMs ?? SIGN_IN_CHECK_LIMIT_MS
    // The feed must answer before the limit, also when a test makes the limit shorter.
    this.feedDelayMs = deps.feedDelayMs ?? Math.min(SIGN_IN_FEED_DELAY_MS, this.limitMs / 5)
  }

  /** True while the page is hidden for a check. */
  isHidden(): boolean {
    return this.hidden
  }

  /** The page goes to the sign-in host. */
  signInPage(step: SignInPageStep, url: string): void {
    if (this.closed) return
    const running = this.check
    if (running) {
      running.url = url
      // After the restart, a page that lands on the sign-in host again is signed out.
      if (step === 'commit' && running.restarted) this.signOut()
      else if (step === 'commit') this.planFeedRead(running)
      return
    }
    if (!this.hidden) {
      this.hidden = true
      this.deps.page.hide()
    }
    const check: RunningCheck = {
      id: this.nextId++,
      feed: 'pending',
      restarted: false,
      feedAsked: false,
      url,
      timer: null
    }
    this.check = check
    this.startTimer(check)
    if (step === 'commit') this.planFeedRead(check)
  }

  /**
   * The page committed a page of the sign-in host. If it is still there after the delay,
   * read the feed. Each check reads the feed once.
   */
  private planFeedRead(check: RunningCheck): void {
    if (check.feedAsked) return
    check.feedAsked = true
    setTimeout(() => {
      if (this.closed || this.check?.id !== check.id) return
      if (!this.deps.isSignInPageUrl(this.deps.page.url())) return
      this.deps.readFeed().then(
        (answer) => this.feedAnswer(check.id, answer),
        () => this.feedAnswer(check.id, 'unknown')
      )
    }, this.feedDelayMs)
  }

  /** The page committed a page that is not on the sign-in host. */
  pageCommitted(): void {
    if (this.closed) return
    this.endCheck()
    if (this.hidden) {
      this.hidden = false
      this.deps.page.show()
    }
  }

  /** The page closed. Stop the timer and ignore every later answer. */
  close(): void {
    this.closed = true
    this.endCheck()
  }

  private feedAnswer(id: number, answer: FeedCheck): void {
    const check = this.check
    if (this.closed || !check || check.id !== id) return
    // A page that left the sign-in host in the meantime is not signed out.
    if (answer === 'signed-out' && this.deps.isSignInPageUrl(this.deps.page.url())) {
      this.signOut()
      return
    }
    check.feed = answer
  }

  private startTimer(check: RunningCheck): void {
    if (check.timer) clearTimeout(check.timer)
    check.timer = setTimeout(() => {
      check.timer = null
      this.limitReached(check.id)
    }, this.limitMs)
  }

  private limitReached(id: number): void {
    const check = this.check
    if (this.closed || !check || check.id !== id) return
    if (!this.deps.isSignInPageUrl(this.deps.page.url())) {
      // The page left the sign-in host, but committed nothing yet. It shows again.
      this.pageCommitted()
      return
    }
    if (check.feed === 'signed-in' && !check.restarted) {
      // Google did not finish the cookie refresh in time. Start the Google app again, once.
      check.restarted = true
      this.startTimer(check)
      this.deps.page.restart()
      return
    }
    this.signOut()
  }

  private signOut(): void {
    const check = this.check
    if (!check) return
    const url = check.url
    this.endCheck()
    // The page stays hidden until it commits another page.
    Promise.resolve()
      .then(() => this.deps.page.stop())
      .catch(() => {
        // The page closed during the stop.
      })
      .then(() => {
        if (!this.closed) this.deps.signedOut(url)
      })
      .catch(() => {
        // Nothing to do.
      })
  }

  private endCheck(): void {
    const check = this.check
    if (check?.timer) clearTimeout(check.timer)
    this.check = null
  }
}
