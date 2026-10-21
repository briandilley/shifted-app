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

/** The sources of the link rules that belong to an account. */
export type AccountLinkSource = 'gmail' | 'calendar' | 'child-window'

export interface LinkHandlers {
  /** Select the account, show this Google app, and load the URL in its view. */
  showInGoogleApp(accountId: string, googleApp: GoogleApp, url: string): void
  /** A page of the account tried to go to Google's sign-in page. */
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
 * Apply the link rules to the `will-navigate` and `setWindowOpenHandler` handlers of a
 * page of an account. A child window that the page opens gets the same rules.
 */
export function applyLinkRules(
  page: WebContents,
  accountId: string,
  source: AccountLinkSource,
  handlers: LinkHandlers
): void {
  // Shifted never shows Google's sign-in page in a Google app or a child window. If a page
  // goes there, Google signed the account out. Gmail sends a signed-out session there
  // with an HTTP redirect, so Shifted also checks redirects.
  const stopSignInPage = (event: Electron.Event, url: string, isMainFrame: boolean): boolean => {
    if (!isMainFrame || !isSignInPageUrl(url)) return false
    event.preventDefault()
    handlers.signedOut(accountId)
    return true
  }

  page.on('will-redirect', (event) => {
    stopSignInPage(event, event.url, event.isMainFrame)
  })

  page.on('will-navigate', (event) => {
    // Frames inside a Google page, for example Google Chat in Gmail, load freely.
    if (!event.isMainFrame) return
    if (stopSignInPage(event, event.url, true)) return
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
    applyLinkRules(window.webContents, accountId, 'child-window', handlers)
    handlers.childWindowCreated(accountId, window, details.url)
  })
}
