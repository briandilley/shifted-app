/**
 * The sign-in window: a small separate window that shows Google's sign-in page for one
 * account, with the session of that account.
 *
 * The top line is a React screen of Shifted. Below it, a `WebContentsView` with the
 * session of the account shows Google's sign-in page.
 */
import { BrowserWindow, WebContentsView, type Session } from 'electron'
import icon from '../../resources/icon.png?asset'
import { SIGN_IN_SCREEN_HASH, type ViewBounds } from '../shared/api'
import { googlePageWebPreferences } from './account-session'
import { signInUrl } from './google-urls'
import { routeNavigation } from './link-rules'
import { isSignInFinished } from './sign-in'
import {
  loadShiftedScreen,
  lockShiftedScreen,
  shiftedScreenWebPreferences
} from './shifted-screens'
import { baseBackgroundColor, followBaseBackground, GOOGLE_VIEW_RADIUS } from './window-frame'

export const SIGN_IN_WINDOW_WIDTH = 480
export const SIGN_IN_WINDOW_HEIGHT = 720

export interface SignInWindowHandlers {
  /** The sign-in window reached Gmail. The window closes right after this call. */
  onFinished(): void
  /** The sign-in window closed. `finished` is true when sign-in ended. */
  onClosed(finished: boolean): void
}

function ignore(): void {
  // A navigation that Shifted or the person stopped. Nothing to do.
}

export class SignInWindow {
  readonly window: BrowserWindow
  readonly view: WebContentsView
  private finished = false

  /**
   * @param address The address to fill in on Google's sign-in page, for an account that
   *   came from an import. Without it, the page starts empty.
   */
  constructor(accountSession: Session, handlers: SignInWindowHandlers, address?: string) {
    this.window = new BrowserWindow({
      title: 'Sign in',
      backgroundColor: baseBackgroundColor(),
      width: SIGN_IN_WINDOW_WIDTH,
      height: SIGN_IN_WINDOW_HEIGHT,
      useContentSize: true,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform !== 'darwin' ? { icon } : {}),
      webPreferences: shiftedScreenWebPreferences()
    })
    lockShiftedScreen(this.window.webContents)
    followBaseBackground(this.window)

    this.view = new WebContentsView({ webPreferences: googlePageWebPreferences(accountSession) })
    // Google's page shows in a card with a radius of 12. See "The other windows" in
    // `docs/spec/DESIGN.md`.
    this.view.setBorderRadius(GOOGLE_VIEW_RADIUS)
    this.window.contentView.addChildView(this.view)
    const page = this.view.webContents

    // Rule 3 of "Links": every page stays in the sign-in window. A page that asks for a
    // new window opens in the sign-in window. The default browser never opens.
    page.setWindowOpenHandler(({ url }) => {
      if (routeNavigation(url, { source: 'sign-in', kind: 'new-window' }) === 'stay') {
        page.loadURL(url).catch(ignore)
      }
      return { action: 'deny' }
    })
    page.on('will-navigate', (event) => {
      if (!event.isMainFrame) return
      if (routeNavigation(event.url, { source: 'sign-in', kind: 'navigation' }) !== 'stay') {
        event.preventDefault()
      }
    })

    page.on('did-navigate', (_event, url) => {
      if (this.finished || !isSignInFinished(url)) return
      this.finished = true
      handlers.onFinished()
      this.close()
    })

    // The window keeps its title. The React screen has the title of the main window.
    this.window.on('page-title-updated', (event) => {
      event.preventDefault()
    })

    this.window.once('ready-to-show', () => {
      this.window.show()
    })

    this.window.on('closed', () => {
      if (!page.isDestroyed()) page.close()
      handlers.onClosed(this.finished)
    })

    loadShiftedScreen(this.window.webContents, SIGN_IN_SCREEN_HASH)
    page.loadURL(signInUrl(address)).catch(ignore)
  }

  setViewBounds(bounds: ViewBounds): void {
    this.view.setBounds(bounds)
  }

  focus(): void {
    if (this.window.isDestroyed()) return
    if (this.window.isMinimized()) this.window.restore()
    this.window.show()
    this.window.focus()
  }

  close(): void {
    if (!this.window.isDestroyed()) this.window.close()
  }
}
