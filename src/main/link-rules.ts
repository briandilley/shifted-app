/**
 * The link rules of Shifted: where each link and each new window goes. See "Links" in
 * `docs/spec/PRODUCT.md`.
 *
 * This module needs no Electron, so that unit tests can use it. It gets the Gmail and
 * Calendar hosts from `google-urls.ts`.
 */
import { googleRedirectTarget, isCalendarLink, isGmailLink } from './google-urls'

/**
 * Where a request comes from: the Gmail view or the Calendar view of an account, a child
 * window, or the sign-in window.
 */
export type LinkSource = 'gmail' | 'calendar' | 'child-window' | 'sign-in'

/** The kind of request: a navigation of the page, or a new window. */
export type RequestKind = 'navigation' | 'new-window'

export interface NavigationContext {
  source: LinkSource
  kind: RequestKind
}

/**
 * Where the request goes.
 *
 * - `stay`: the page loads where it was asked for. For a new window from the sign-in
 *   window, the page loads in the sign-in window.
 * - `gmail-tab`: Shifted selects the Gmail tab of the same account and loads the URL in
 *   the Gmail view.
 * - `calendar-tab`: Shifted selects the Calendar tab of the same account and loads the URL
 *   in the Calendar view.
 * - `child-window`: Shifted opens a child window with the session of the same account.
 * - `default-browser`: Shifted opens the URL in the default browser.
 * - `mailto`: Shifted opens a new message in the Gmail of the same account.
 * - `block`: nothing happens.
 */
export type NavigationResult =
  'stay' | 'gmail-tab' | 'calendar-tab' | 'child-window' | 'default-browser' | 'mailto' | 'block'

type UrlKind = 'web' | 'mailto' | 'about-blank' | 'other'

/** The kind of URL. Only `http:`, `https:`, `mailto:`, and `about:blank` are allowed. */
function urlKind(url: string): UrlKind {
  // `window.open()` with no URL asks for an empty URL. It opens `about:blank`.
  if (url === '') return 'about-blank'
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'other'
  }
  switch (parsed.protocol) {
    case 'http:':
    case 'https:':
      return 'web'
    case 'mailto:':
      return 'mailto'
    case 'about:':
      return parsed.pathname === 'blank' ? 'about-blank' : 'other'
    default:
      return 'other'
  }
}

/**
 * The URL that a link goes to. For a link through Google's redirect page, this is the
 * target of the redirect. For every other link, it is the URL itself.
 */
export function linkTarget(url: string): string {
  return googleRedirectTarget(url) ?? url
}

/**
 * Decide where a navigation or a new window goes.
 *
 * The rules of "Links", in order:
 *
 * 1. A Gmail link opens in the Gmail Google app of the same account.
 * 2. A Calendar link opens in the Calendar Google app of the same account.
 * 3. In the sign-in window, every page stays in the sign-in window.
 * 4. A Gmail pop-out opens in a child window with the session of the same account.
 * 5. Every other link opens in the default browser.
 *
 * Rule 3 is checked first for the sign-in window, because rules 1 and 2 are about the
 * Google apps of an account, and sign-in ends when the sign-in window reaches Gmail.
 *
 * A new window that the Gmail view or a child window opens on a Gmail page, or on
 * `about:blank`, is a Gmail pop-out (rule 4). Examples: pop-out compose, the print view,
 * and "Open in new window". A navigation of the Gmail view to a Gmail page stays in the
 * Gmail view, and the same is true for the Calendar view and Calendar pages.
 *
 * Every scheme other than `http:`, `https:`, `mailto:`, and `about:blank` is blocked.
 */
export function routeNavigation(url: string, context: NavigationContext): NavigationResult {
  const { source, kind } = context
  const scheme = urlKind(url)
  if (scheme === 'other') return 'block'

  // Rule 3: every page stays in the sign-in window. Nothing leaves it, not even a
  // `mailto:` link, and it opens no child window.
  if (source === 'sign-in') {
    if (scheme === 'web') return 'stay'
    if (scheme === 'about-blank' && kind === 'navigation') return 'stay'
    return 'block'
  }

  if (scheme === 'mailto') return 'mailto'

  // Rule 4: Gmail often opens a pop-out on `about:blank`, then writes into it.
  if (scheme === 'about-blank') return kind === 'new-window' ? 'child-window' : 'stay'

  const target = linkTarget(url)
  const redirected = target !== url

  // Rule 1, and rule 4 for a new window from Gmail on a Gmail page.
  if (isGmailLink(target)) {
    if (source === 'calendar' || redirected) return 'gmail-tab'
    return kind === 'new-window' ? 'child-window' : 'stay'
  }

  // Rule 2.
  if (isCalendarLink(target)) {
    if (source === 'calendar' && kind === 'navigation' && !redirected) return 'stay'
    return 'calendar-tab'
  }

  // Rule 5.
  return 'default-browser'
}

/** True when the default browser may open this URL: only `http:` and `https:` URLs. */
export function isDefaultBrowserUrl(url: string): boolean {
  return urlKind(url) === 'web'
}
