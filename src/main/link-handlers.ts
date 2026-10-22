/**
 * Apply the link rules (`link-rules.ts`) to a Google page of an account: the Gmail view,
 * the Calendar view, or a child window. The sign-in window applies rule 3 itself (see
 * `sign-in-window.ts`).
 */
import { BrowserWindow, type BrowserWindowConstructorOptions, type WebContents } from 'electron'
import type { GoogleApp } from '../shared/api'
import { openInDefaultBrowser } from './external'
import { gmailComposeUrl, isSignInPageUrl } from './google-urls'
import { linkTarget, routeNavigation, type NavigationResult } from './link-rules'
import {
  SignInCheck,
  signInPageForLog,
  type CheckedPage,
  type FeedCheck,
  type SignInPageStep
} from './sign-in-check'

/** The sources of the link rules that belong to an account. */
export type AccountLinkSource = 'gmail' | 'calendar' | 'child-window'

export interface LinkHandlers {
  /** Select the account, show this Google app, and load the URL in its view. */
  showInGoogleApp(accountId: string, googleApp: GoogleApp, url: string): void
  /** True when the account is signed in. Only then does a page of it show. */
  isSignedIn(accountId: string): boolean
  /** Read the feed of the account, to learn whether Google signed it out. */
  checkFeed(accountId: string): Promise<FeedCheck>
  /** Google signed the account out: a page of it went to Google's sign-in page. */
  signedOut(accountId: string): void
  /** The options of a new child window of the account. */
  childWindowOptions(accountId: string): BrowserWindowConstructorOptions
  /** A page of the account opened a child window on this URL. */
  childWindowCreated(accountId: string, window: BrowserWindow, openedUrl: string): void
}

/** True when the page shows nothing yet: a child window that opened on `about:blank`. */
function isBlankPage(page: WebContents): boolean {
  const url = page.getURL()
  return url === '' || url === 'about:blank'
}

/**
 * Do what the result of the link rules says, for every result other than `stay`,
 * `child-window`, and `block`.
 */
function followLink(
  result: NavigationResult,
  url: string,
  accountId: string,
  handlers: LinkHandlers
): void {
  switch (result) {
    case 'gmail-tab':
      handlers.showInGoogleApp(accountId, 'gmail', linkTarget(url))
      return
    case 'calendar-tab':
      handlers.showInGoogleApp(accountId, 'calendar', linkTarget(url))
      return
    case 'default-browser':
      openInDefaultBrowser(url)
      return
    case 'mailto':
      // A `mailto:` link in a page of an account opens a new message in the Gmail of the
      // same account, with no account picker. Links from other apps go to `mailto-links.ts`.
      handlers.showInGoogleApp(accountId, 'gmail', gmailComposeUrl(url))
      return
    case 'stay':
    case 'child-window':
    case 'block':
      return
  }
}

/**
 * How a page of an account hides and starts again during a sign-in check. The Gmail and
 * Calendar views give their own. A child window hides its window, and closes in place
 * of a restart.
 */
export interface PageControl {
  hide(): void
  show(): void
  /** Load the first page of the Google app again. */
  restart(): void
}

/** The control of a child window: hide and show the window. A restart closes it. */
function childWindowControl(page: WebContents): PageControl {
  const window = (): BrowserWindow | null => {
    if (page.isDestroyed()) return null
    const found = BrowserWindow.fromWebContents(page)
    return found && !found.isDestroyed() ? found : null
  }
  return {
    hide: () => window()?.hide(),
    show: () => window()?.show(),
    restart: () => window()?.close()
  }
}

/**
 * Watch the page for trips to Google's sign-in page (see `sign-in-check.ts`). Shifted
 * never shows Google's sign-in page in a Google app or a child window, but a trip there
 * is a sign-out only if the feed or the time limit says so.
 *
 * @returns A function that tells whether a URL that the page goes to is on the sign-in
 *   host, and handles it.
 */
function watchSignInPage(
  page: WebContents,
  accountId: string,
  source: AccountLinkSource,
  handlers: LinkHandlers,
  control: PageControl,
  limitMs: number | undefined
): (event: Electron.Event | null, step: SignInPageStep, url: string) => boolean {
  const checkedPage: CheckedPage = {
    hide: () => control.hide(),
    show: () => control.show(),
    url: () => (page.isDestroyed() ? '' : page.getURL()),
    restart: () => {
      if (!page.isDestroyed()) control.restart()
    },
    stop: async () => {
      if (page.isDestroyed()) return
      // Stop the page, also a redirect that is still on its way, and leave no Google
      // sign-in page in the hidden page. "Sign in again" loads the Google app again.
      page.stop()
      await page.loadURL('about:blank').catch(ignore)
    }
  }
  const check = new SignInCheck({
    page: checkedPage,
    isSignInPageUrl,
    readFeed: () => handlers.checkFeed(accountId),
    signedOut: (url) => {
      // One line for a later report: which Google page caused the sign-out. No query
      // string and no cookies.
      console.warn(
        `Shifted found account ${accountId} signed out: its ${source} page went to ${signInPageForLog(url)}`
      )
      handlers.signedOut(accountId)
    },
    limitMs
  })
  page.once('destroyed', () => check.close())

  page.on('did-start-navigation', (details) => {
    if (!details.isMainFrame || details.isSameDocument) return
    if (isSignInPageUrl(details.url) && handlers.isSignedIn(accountId)) {
      check.signInPage('start', details.url)
    }
  })
  page.on('did-navigate', (_event, url) => {
    if (!isSignInPageUrl(url)) check.pageCommitted()
    else if (handlers.isSignedIn(accountId)) check.signInPage('commit', url)
    // The account is not signed in, so its pages do not show. Leave no sign-in page there.
    else page.loadURL('about:blank').catch(ignore)
  })

  return (event, step, url) => {
    if (!isSignInPageUrl(url)) return false
    if (handlers.isSignedIn(accountId)) {
      check.signInPage(step, url)
    } else {
      // The account is not signed in, so its pages do not show. They need no sign-in page.
      event?.preventDefault()
    }
    return true
  }
}

function ignore(): void {
  // A load that Shifted stopped, or a page that closed. Nothing to do.
}

/**
 * Apply the link rules to the `will-navigate` and `setWindowOpenHandler` handlers of a
 * page of an account. A child window that the page opens gets the same rules.
 *
 * @param control How the page hides during a sign-in check. A child window has its own.
 * @param signInCheckLimitMs The time limit of the sign-in check. Tests make it shorter.
 */
export function applyLinkRules(
  page: WebContents,
  accountId: string,
  source: AccountLinkSource,
  handlers: LinkHandlers,
  control: PageControl = childWindowControl(page),
  signInCheckLimitMs?: number
): void {
  const signInPage = watchSignInPage(page, accountId, source, handlers, control, signInCheckLimitMs)

  // A redirect can pass through the sign-in host, for example when Google sets the cookies
  // of Gmail. Shifted lets it go on, and hides the page during the check.
  page.on('will-redirect', (event) => {
    if (event.isMainFrame) signInPage(event, 'redirect', event.url)
  })

  page.on('will-navigate', (event) => {
    // Frames inside a Google page, for example Google Chat in Gmail, load freely.
    if (!event.isMainFrame) return
    // A navigation to the sign-in host stays in the page, which is hidden during the check.
    if (signInPage(event, 'start', event.url)) return
    const result = routeNavigation(event.url, { source, kind: 'navigation' })
    if (result === 'stay') return
    event.preventDefault()
    const closeAfter = source === 'child-window' && isBlankPage(page)
    followLink(result, event.url, accountId, handlers)
    // A page can open a child window on `about:blank` and then send it to another place.
    // If that place is not in the child window, the window would stay empty. Close it.
    if (closeAfter && !page.isDestroyed()) BrowserWindow.fromWebContents(page)?.close()
  })

  page.setWindowOpenHandler((details) => {
    const result = routeNavigation(details.url, { source, kind: 'new-window' })
    if (result === 'child-window') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: handlers.childWindowOptions(accountId)
      }
    }
    followLink(result, details.url, accountId, handlers)
    return { action: 'deny' }
  })

  page.on('did-create-window', (window, details) => {
    applyLinkRules(
      window.webContents,
      accountId,
      'child-window',
      handlers,
      childWindowControl(window.webContents),
      signInCheckLimitMs
    )
    handlers.childWindowCreated(accountId, window, details.url)
  })
}
