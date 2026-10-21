/**
 * The child windows of the accounts. A child window shows a Gmail pop-out of one account,
 * with the session of that account and the same security options as the Google app views.
 */
import { BrowserWindow, type BrowserWindowConstructorOptions, type WebContents } from 'electron'
import icon from '../../resources/icon.png?asset'
import { accountSession, googlePageWebPreferences } from './account-session'

/** The title of a child window: "Shifted: " and the name of the account. */
export function childWindowTitle(accountName: string): string {
  return `Shifted: ${accountName}`
}

export class ChildWindows {
  private readonly windows = new Map<string, Set<BrowserWindow>>()
  /** The URL that each child window opened on. */
  private readonly openedUrls = new WeakMap<BrowserWindow, string>()

  /** The options of a new child window of the account. */
  options(accountId: string, accountName: string): BrowserWindowConstructorOptions {
    return {
      title: childWindowTitle(accountName),
      autoHideMenuBar: true,
      ...(process.platform !== 'darwin' ? { icon } : {}),
      webPreferences: googlePageWebPreferences(accountSession(accountId), true)
    }
  }

  /**
   * Keep track of a new child window of the account, and give it its title.
   *
   * @param openedUrl The URL that the page asked the window to open.
   */
  add(accountId: string, window: BrowserWindow, accountName: string, openedUrl: string): void {
    const accountWindows = this.windows.get(accountId) ?? new Set<BrowserWindow>()
    accountWindows.add(window)
    this.openedUrls.set(window, openedUrl)
    this.windows.set(accountId, accountWindows)
    window.setTitle(childWindowTitle(accountName))
    // The window keeps the title that names the account. The page cannot change it.
    window.on('page-title-updated', (event) => {
      event.preventDefault()
    })
    window.on('closed', () => {
      accountWindows.delete(window)
      if (accountWindows.size === 0 && this.windows.get(accountId) === accountWindows) {
        this.windows.delete(accountId)
      }
    })
  }

  /** The account of a child window, by its web contents, or `undefined`. */
  accountOf(contents: WebContents): string | undefined {
    for (const [accountId, accountWindows] of this.windows) {
      for (const window of accountWindows) {
        if (!window.isDestroyed() && window.webContents === contents) return accountId
      }
    }
    return undefined
  }

  /** Give the child windows of the account a new title, for example after a rename. */
  setTitle(accountId: string, accountName: string): void {
    for (const window of this.windows.get(accountId) ?? []) {
      if (!window.isDestroyed()) window.setTitle(childWindowTitle(accountName))
    }
  }

  /**
   * A download started in this web contents. If it is a child window that opened on the
   * URL of the download and never showed a page, the window would stay empty. Close it.
   * A child window that opened on `about:blank`, for example pop-out compose, stays.
   */
  closeIfOnlyDownload(contents: WebContents): void {
    const window = BrowserWindow.fromWebContents(contents)
    if (!window || window.isDestroyed()) return
    const openedUrl = this.openedUrls.get(window)
    if (openedUrl === undefined || openedUrl === '' || openedUrl === 'about:blank') return
    if (contents.getURL() !== '') return
    window.close()
  }

  /**
   * Close the child windows of the account, for example when it is removed or signed out.
   * The page of a child window cannot stop this.
   */
  close(accountId: string): void {
    const accountWindows = this.windows.get(accountId)
    this.windows.delete(accountId)
    for (const window of accountWindows ?? []) {
      if (!window.isDestroyed()) window.destroy()
    }
  }
}
