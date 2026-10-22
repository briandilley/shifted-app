/**
 * The Google app views of the accounts in the main window.
 *
 * Each account can have two views: one for Gmail and one for Calendar. Both use the
 * session of the account. Shifted makes a view when it is needed. Showing a view never
 * reloads it. "Background loading" decides which views stay (see `background-loading.ts`):
 * a Google app that is asleep has no view, and its view is made again when it is needed.
 */
import { WebContentsView, type BrowserWindow, type WebContents } from 'electron'
import { GOOGLE_APPS, type GoogleApp, type PageProblem, type ViewBounds } from '../shared/api'
import { accountSession, googlePageWebPreferences } from './account-session'
import { calendarUrl, gmailUrl, isGmailUrl } from './google-urls'
import { applyLinkRules, type LinkHandlers } from './link-handlers'
import { applyPageMenu } from './page-menu'
import { isCertificateError, isConnectionError, isCrash } from './page-problems'
import { GOOGLE_VIEW_RADIUS } from './window-frame'

export interface AccountViewHandlers {
  /** The link rules of the account pages. */
  links: LinkHandlers
  /** Gmail of the account finished loading. */
  onGmailLoaded(accountId: string, gmail: WebContents): void
  /** The page of a Google app stopped: it crashed, or it has a certificate error. */
  onPageProblem(accountId: string, googleApp: GoogleApp, problem: PageProblem): void
  /** A Google app starts to load a new page, for example after "Reload". */
  onPageLoadStarted(accountId: string, googleApp: GoogleApp): void
  /**
   * The page of a Google app was hidden for a sign-in check, or shows again (see
   * `sign-in-check.ts`).
   */
  onSignInCheckChanged(accountId: string, googleApp: GoogleApp): void
  /** The time limit of the sign-in check, or `undefined` for the default. */
  signInCheckLimitMs?: number
}

/** The Google app that the content area shows: one Google app of one account. */
export interface ShownGoogleApp {
  accountId: string
  googleApp: GoogleApp
}

function ignore(): void {
  // A navigation that Shifted stopped, or a view that closed. Nothing to do.
}

/** The first URL of a Google app. */
export function googleAppUrl(googleApp: GoogleApp): string {
  return googleApp === 'gmail' ? gmailUrl() : calendarUrl()
}

export class AccountViews {
  private readonly views = new Map<string, Map<GoogleApp, WebContentsView>>()
  private bounds: ViewBounds = { x: 0, y: 0, width: 0, height: 0 }
  private shown: ShownGoogleApp | null = null
  /** The views whose last page did not load, because the network did not answer. */
  private readonly failedLoads = new Set<WebContentsView>()
  /**
   * The views that are hidden during a sign-in check, because their page went to Google's
   * sign-in host. The content area shows a loading panel in their place.
   */
  private readonly signInChecks = new Set<WebContentsView>()

  constructor(
    private readonly window: BrowserWindow,
    private readonly handlers: AccountViewHandlers
  ) {}

  /** The view of a Google app of an account, if Shifted made it. */
  get(accountId: string, googleApp: GoogleApp): WebContentsView | undefined {
    return this.views.get(accountId)?.get(googleApp)
  }

  /** True while the view of the Google app is hidden for a sign-in check. */
  isCheckingSignIn(accountId: string, googleApp: GoogleApp): boolean {
    const view = this.get(accountId, googleApp)
    return view !== undefined && this.signInChecks.has(view)
  }

  /** The account and the Google app of a view, by its web contents, or `undefined`. */
  find(contents: WebContents): ShownGoogleApp | undefined {
    for (const [accountId, accountViews] of this.views) {
      for (const [googleApp, view] of accountViews) {
        if (view.webContents === contents) return { accountId, googleApp }
      }
    }
    return undefined
  }

  /**
   * Make the view of a Google app of an account, if it does not exist yet.
   *
   * @param url The first URL of a new view. Without it, the view loads the first page of
   *   the Google app.
   */
  ensure(accountId: string, googleApp: GoogleApp, url?: string): WebContentsView {
    const existing = this.get(accountId, googleApp)
    if (existing) return existing
    const view = this.create(accountId, googleApp, url ?? googleAppUrl(googleApp))
    const accountViews = this.views.get(accountId) ?? new Map<GoogleApp, WebContentsView>()
    accountViews.set(googleApp, view)
    this.views.set(accountId, accountViews)
    return view
  }

  /** Load a URL in the view of a Google app of an account. Make the view if needed. */
  load(accountId: string, googleApp: GoogleApp, url: string): void {
    const existing = this.get(accountId, googleApp)
    if (existing) existing.webContents.loadURL(url).catch(ignore)
    else this.ensure(accountId, googleApp, url)
  }

  /** Load the first page again in each view of the account, for example after sign-in. */
  reload(accountId: string): void {
    for (const googleApp of GOOGLE_APPS) {
      this.get(accountId, googleApp)?.webContents.loadURL(googleAppUrl(googleApp)).catch(ignore)
    }
  }

  /** Reload the page of a Google app, for example after a crash. */
  reloadPage(accountId: string, googleApp: GoogleApp): void {
    const contents = this.get(accountId, googleApp)?.webContents
    if (contents && !contents.isDestroyed()) contents.reload()
  }

  /**
   * Reload each view whose last page did not load because the network did not answer.
   * Shifted calls it when the computer is online again.
   */
  reloadFailedLoads(): void {
    for (const view of this.failedLoads) {
      if (!view.webContents.isDestroyed()) view.webContents.reload()
    }
    this.failedLoads.clear()
  }

  /** The Google apps that have a view now. */
  list(): ShownGoogleApp[] {
    return [...this.views].flatMap(([accountId, accountViews]) =>
      [...accountViews.keys()].map((googleApp) => ({ accountId, googleApp }))
    )
  }

  /**
   * Put one Google app of an account to sleep: close its view and destroy its web
   * contents. The session stays. The content area never shows a view that is asleep, so
   * the view that shows does not close.
   *
   * @returns True when the Google app is asleep now.
   */
  sleep(accountId: string, googleApp: GoogleApp): boolean {
    const shown = this.shown
    if (shown?.accountId === accountId && shown.googleApp === googleApp) return false
    const accountViews = this.views.get(accountId)
    const view = accountViews?.get(googleApp)
    if (!accountViews || !view) return true
    accountViews.delete(googleApp)
    if (accountViews.size === 0) this.views.delete(accountId)
    this.closeView(view)
    return true
  }

  /** Close the views of one account. */
  close(accountId: string): void {
    const accountViews = this.views.get(accountId)
    this.views.delete(accountId)
    if (!accountViews) return
    for (const view of accountViews.values()) this.closeView(view)
    if (this.shown?.accountId === accountId) this.shown = null
  }

  /** Close the views of every account. */
  closeAll(): void {
    for (const accountId of [...this.views.keys()]) this.close(accountId)
  }

  /** Put the views at the bounds of the content area. */
  setBounds(bounds: ViewBounds): void {
    this.bounds = bounds
    this.update()
  }

  /**
   * Show one Google app of one account in the content area, and hide every other view.
   * `null` hides every view. The view must exist (see `ensure`).
   */
  show(shown: ShownGoogleApp | null): void {
    this.shown = shown
    this.update()
  }

  private update(): void {
    for (const [accountId, accountViews] of this.views) {
      for (const [googleApp, view] of accountViews) {
        const visible =
          this.shown !== null &&
          this.shown.accountId === accountId &&
          this.shown.googleApp === googleApp &&
          !this.signInChecks.has(view)
        view.setBounds(this.bounds)
        view.setVisible(visible)
      }
    }
  }

  private create(accountId: string, googleApp: GoogleApp, url: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: googlePageWebPreferences(accountSession(accountId), true)
    })
    // The content area is a card with four rounded corners.
    view.setBorderRadius(GOOGLE_VIEW_RADIUS)
    const page = view.webContents

    // The link rules decide where each link and each new window goes. They also hide
    // the view while its page is on Google's sign-in host, so that Google's sign-in page
    // never shows in the content area.
    const setSignInCheck = (checking: boolean): void => {
      if (checking === this.signInChecks.has(view)) return
      if (checking) this.signInChecks.add(view)
      else this.signInChecks.delete(view)
      this.update()
      this.handlers.onSignInCheckChanged(accountId, googleApp)
    }
    applyLinkRules(
      page,
      accountId,
      googleApp,
      this.handlers.links,
      {
        hide: () => setSignInCheck(true),
        show: () => setSignInCheck(false),
        restart: () => {
          page.loadURL(googleAppUrl(googleApp)).catch(ignore)
        }
      },
      this.handlers.signInCheckLimitMs
    )
    // A right-click shows the context menu: links, images, text, and spelling.
    applyPageMenu(page, googleApp)

    // A page that stopped: the content area shows "This page stopped." or the certificate
    // message in its place. See "Failure states" in `docs/spec/PRODUCT.md`.
    page.on('render-process-gone', (_event, details) => {
      if (page.isDestroyed() || !isCrash(details.reason)) return
      this.handlers.onPageProblem(accountId, googleApp, 'crashed')
    })
    page.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
      if (!isMainFrame) return
      if (isCertificateError(errorCode)) {
        this.handlers.onPageProblem(accountId, googleApp, 'certificate-error')
      } else if (isConnectionError(errorCode)) {
        this.failedLoads.add(view)
      }
    })
    page.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return
      this.failedLoads.delete(view)
      this.handlers.onPageLoadStarted(accountId, googleApp)
    })

    if (googleApp === 'gmail') {
      page.on('did-finish-load', () => {
        if (isGmailUrl(page.getURL())) this.handlers.onGmailLoaded(accountId, page)
      })
    }

    view.setBounds(this.bounds)
    view.setVisible(false)
    this.window.contentView.addChildView(view)
    page.loadURL(url).catch(ignore)
    return view
  }

  private closeView(view: WebContentsView): void {
    this.failedLoads.delete(view)
    this.signInChecks.delete(view)
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
  }
}
