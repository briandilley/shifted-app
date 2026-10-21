/**
 * The Google app views of the accounts in the main window.
 *
 * Each account can have two views: one for Gmail and one for Calendar. Both use the
 * session of the account. Shifted makes a view the first time that it is needed and keeps
 * it after that. Showing a view never reloads it.
 */
import { WebContentsView, type BrowserWindow, type WebContents } from 'electron'
import { GOOGLE_APPS, type GoogleApp, type ViewBounds } from '../shared/api'
import { accountSession, googlePageWebPreferences } from './account-session'
import { calendarUrl, gmailUrl, isGmailUrl, isSignInPageUrl } from './google-urls'

export interface AccountViewHandlers {
  /** A view of the account tried to go to Google's sign-in page. */
  onSignedOut(accountId: string): void
  /** Gmail of the account finished loading. */
  onGmailLoaded(accountId: string, gmail: WebContents): void
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

  constructor(
    private readonly window: BrowserWindow,
    private readonly handlers: AccountViewHandlers
  ) {}

  /** The view of a Google app of an account, if Shifted made it. */
  get(accountId: string, googleApp: GoogleApp): WebContentsView | undefined {
    return this.views.get(accountId)?.get(googleApp)
  }

  /** Make the view of a Google app of an account, if it does not exist yet. */
  ensure(accountId: string, googleApp: GoogleApp): WebContentsView {
    const existing = this.get(accountId, googleApp)
    if (existing) return existing
    const view = this.create(accountId, googleApp)
    const accountViews = this.views.get(accountId) ?? new Map<GoogleApp, WebContentsView>()
    accountViews.set(googleApp, view)
    this.views.set(accountId, accountViews)
    return view
  }

  /** Load the first page again in each view of the account, for example after sign-in. */
  reload(accountId: string): void {
    for (const googleApp of GOOGLE_APPS) {
      this.get(accountId, googleApp)?.webContents.loadURL(googleAppUrl(googleApp)).catch(ignore)
    }
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
          this.shown.googleApp === googleApp
        view.setBounds(this.bounds)
        view.setVisible(visible)
      }
    }
  }

  private create(accountId: string, googleApp: GoogleApp): WebContentsView {
    const view = new WebContentsView({
      webPreferences: googlePageWebPreferences(accountSession(accountId))
    })
    const page = view.webContents

    // Prompt 03 adds the link rules. Until then, the Google apps open no new windows.
    page.setWindowOpenHandler(() => ({ action: 'deny' }))

    // Shifted never shows Google's sign-in page in the content area. If a Google app goes
    // there, Google signed the account out.
    const stopSignInPage = (event: Electron.Event, url: string, isMainFrame: boolean): void => {
      if (!isMainFrame || !isSignInPageUrl(url)) return
      event.preventDefault()
      this.handlers.onSignedOut(accountId)
    }
    page.on('will-navigate', (event) => stopSignInPage(event, event.url, event.isMainFrame))
    page.on('will-redirect', (event) => stopSignInPage(event, event.url, event.isMainFrame))

    if (googleApp === 'gmail') {
      page.on('did-finish-load', () => {
        if (isGmailUrl(page.getURL())) this.handlers.onGmailLoaded(accountId, page)
      })
    }

    view.setBounds(this.bounds)
    view.setVisible(false)
    this.window.contentView.addChildView(view)
    page.loadURL(googleAppUrl(googleApp)).catch(ignore)
    return view
  }

  private closeView(view: WebContentsView): void {
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close()
  }
}
