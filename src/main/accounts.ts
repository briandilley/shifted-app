/**
 * The accounts of Shifted: the configuration, the session of each account, the Gmail
 * view of each account in the main window, and the sign-in windows.
 */
import { dialog, WebContentsView, type BrowserWindow, type WebContents } from 'electron'
import { IpcChannel, type AccountStatus, type ShiftedState, type ViewBounds } from '../shared/api'
import {
  accountSession,
  deleteAccountSession,
  flushAccountSession,
  googlePageWebPreferences
} from './account-session'
import { newAccount, type AccountConfig, type Config, type ConfigStore } from './config'
import { parseFeedAddress } from './feed'
import { feedUrl, gmailUrl, isGmailUrl, isSignInPageUrl } from './google-urls'
import { SignInWindow } from './sign-in-window'

function ignore(): void {
  // A navigation that Shifted stopped, or a view that closed. Nothing to do.
}

export class Accounts {
  private config: Config
  private readonly status = new Map<string, AccountStatus>()
  /** The accounts that finished sign-in at least once. */
  private readonly signedInOnce = new Set<string>()
  private readonly gmailViews = new Map<string, WebContentsView>()
  private readonly signInWindows = new Map<string, SignInWindow>()
  private readonly removals = new Map<string, Promise<void>>()
  private selectedAccountId: string | null
  private mainWindow: BrowserWindow | null = null
  private contentBounds: ViewBounds = { x: 0, y: 0, width: 0, height: 0 }

  constructor(private readonly store: ConfigStore) {
    this.config = store.load()
    // An account in the configuration signed in before. Its session is on disk.
    for (const account of this.config.accounts) {
      this.status.set(account.id, 'gmail')
      this.signedInOnce.add(account.id)
    }
    this.selectedAccountId = this.config.accounts[0]?.id ?? null
  }

  state(): ShiftedState {
    return {
      accounts: this.config.accounts.map((account) => ({
        id: account.id,
        email: account.email,
        nickname: account.nickname,
        color: account.color,
        status: this.status.get(account.id) ?? 'gmail'
      })),
      selectedAccountId: this.selectedAccountId
    }
  }

  /** Show the accounts in the main window. Call it each time the main window opens. */
  attachMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
    window.on('closed', () => {
      for (const view of this.gmailViews.values()) {
        if (!view.webContents.isDestroyed()) view.webContents.close()
      }
      this.gmailViews.clear()
      this.mainWindow = null
    })
    for (const account of this.config.accounts) {
      if (this.status.get(account.id) === 'gmail') this.showGmail(account.id)
    }
    this.updateViews()
  }

  /** True when the web contents is the React screen of the main window. */
  isMainScreen(contents: WebContents): boolean {
    const window = this.mainWindow
    return window !== null && !window.isDestroyed() && window.webContents === contents
  }

  /** True when the web contents is the React screen of a sign-in window. */
  isSignInScreen(contents: WebContents): boolean {
    return this.findSignInWindow(contents) !== undefined
  }

  /** Put the Google page of the window that `sender` belongs to at these bounds. */
  setViewBounds(sender: WebContents, bounds: ViewBounds): void {
    if (this.isMainScreen(sender)) {
      this.contentBounds = bounds
      this.updateViews()
      return
    }
    this.findSignInWindow(sender)?.setViewBounds(bounds)
  }

  /** Make a new account and open its sign-in window. */
  addAccount(): void {
    const account = newAccount(this.config.accounts)
    this.config = { ...this.config, accounts: [...this.config.accounts, account] }
    this.store.save(this.config)
    this.selectedAccountId = account.id
    this.openSignInWindow(account.id)
  }

  /** Open the sign-in window for an account that Google signed out. */
  signInAgain(accountId: string): void {
    if (!this.findAccount(accountId) || this.removals.has(accountId)) return
    if (this.status.get(accountId) === 'gmail') return
    this.openSignInWindow(accountId)
  }

  /** Ask the person to confirm, then remove the account. */
  async confirmAndRemove(accountId: string): Promise<void> {
    const account = this.findAccount(accountId)
    if (!account || this.removals.has(accountId)) return
    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons: ['Remove', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Remove ${account.email || 'this account'} from Shifted?`,
      detail:
        'Shifted deletes the session of this account from this computer. To use the account again, add it and sign in again.'
    }
    const window = this.mainWindow
    const { response } =
      window && !window.isDestroyed()
        ? await dialog.showMessageBox(window, options)
        : await dialog.showMessageBox(options)
    if (response !== 0) return
    await this.remove(accountId)
  }

  /**
   * Close the views of the account, delete its session, and remove it from the
   * configuration.
   */
  remove(accountId: string): Promise<void> {
    const running = this.removals.get(accountId)
    if (running) return running
    const removal = this.removeNow(accountId).finally(() => {
      this.removals.delete(accountId)
    })
    this.removals.set(accountId, removal)
    return removal
  }

  /** A promise for the removals that still run, or `undefined` if none runs. */
  pendingRemovals(): Promise<unknown> | undefined {
    if (this.removals.size === 0) return undefined
    return Promise.allSettled([...this.removals.values()])
  }

  private async removeNow(accountId: string): Promise<void> {
    // 1. Close the views of the account.
    const signInWindow = this.signInWindows.get(accountId)
    this.signInWindows.delete(accountId)
    signInWindow?.close()
    const view = this.gmailViews.get(accountId)
    this.gmailViews.delete(accountId)
    if (view) {
      const window = this.mainWindow
      if (window && !window.isDestroyed()) window.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }

    // 2. and 3. Clear the storage data of the session, and delete its partition folder.
    try {
      await deleteAccountSession(accountId)
    } catch (error) {
      console.error(`Shifted could not delete the session of account ${accountId}:`, error)
    }

    // 4. Remove the account from the configuration.
    this.config = {
      ...this.config,
      accounts: this.config.accounts.filter((account) => account.id !== accountId)
    }
    this.store.save(this.config)
    this.status.delete(accountId)
    this.signedInOnce.delete(accountId)
    if (this.selectedAccountId === accountId) {
      this.selectedAccountId = this.config.accounts[0]?.id ?? null
    }
    this.updateViews()
    this.publish()
  }

  private openSignInWindow(accountId: string): void {
    const open = this.signInWindows.get(accountId)
    if (open) {
      open.focus()
      return
    }
    const signInWindow: SignInWindow = new SignInWindow(accountSession(accountId), {
      onFinished: () => this.signInFinished(accountId),
      onClosed: (finished) => this.signInWindowClosed(accountId, signInWindow, finished)
    })
    this.signInWindows.set(accountId, signInWindow)
    this.setStatus(accountId, 'signing-in')
  }

  private signInFinished(accountId: string): void {
    this.signedInOnce.add(accountId)
    // Write the new cookies to disk now, so that the account stays signed in.
    flushAccountSession(accountId).catch(ignore)
    this.status.set(accountId, 'gmail')
    this.showGmail(accountId)
    this.updateViews()
    this.publish()
  }

  private signInWindowClosed(accountId: string, window: SignInWindow, finished: boolean): void {
    // A removal closes the sign-in window itself. It already took the window out.
    if (this.signInWindows.get(accountId) !== window) return
    this.signInWindows.delete(accountId)
    if (finished) return
    if (this.signedInOnce.has(accountId)) {
      this.setStatus(accountId, 'signed-out')
    } else {
      // Sign-in never ended for this new account, so Shifted does not keep it.
      this.remove(accountId).catch(ignore)
    }
  }

  /** Load Gmail of the account in its view. Make the view if it does not exist. */
  private showGmail(accountId: string): void {
    const existing = this.gmailViews.get(accountId)
    if (existing) {
      existing.webContents.loadURL(gmailUrl()).catch(ignore)
      return
    }
    const window = this.mainWindow
    if (!window || window.isDestroyed()) return

    const view = new WebContentsView({
      webPreferences: googlePageWebPreferences(accountSession(accountId))
    })
    const page = view.webContents

    // Prompt 03 adds the link rules. Until then, Gmail opens no new windows.
    page.setWindowOpenHandler(() => ({ action: 'deny' }))

    // Shifted never shows Google's sign-in page in the content area. If Gmail goes
    // there, Google signed the account out.
    const stopSignInPage = (event: Electron.Event, url: string, isMainFrame: boolean): void => {
      if (!isMainFrame || !isSignInPageUrl(url)) return
      event.preventDefault()
      this.setStatus(accountId, 'signed-out')
    }
    page.on('will-navigate', (event) => stopSignInPage(event, event.url, event.isMainFrame))
    page.on('will-redirect', (event) => stopSignInPage(event, event.url, event.isMainFrame))

    page.on('did-finish-load', () => {
      if (isGmailUrl(page.getURL())) this.readAddress(accountId).catch(ignore)
    })

    view.setVisible(false)
    window.contentView.addChildView(view)
    this.gmailViews.set(accountId, view)
    page.loadURL(gmailUrl()).catch(ignore)
  }

  /** Read the email address of the account from the title of its Atom feed. */
  private async readAddress(accountId: string): Promise<void> {
    const response = await accountSession(accountId).fetch(feedUrl(), { credentials: 'include' })
    if (!response.ok) return
    const address = parseFeedAddress(await response.text())
    const account = this.findAccount(accountId)
    if (!address || !account || account.email === address) return
    this.updateAccount(accountId, { email: address })
  }

  private updateAccount(accountId: string, change: Partial<AccountConfig>): void {
    this.config = {
      ...this.config,
      accounts: this.config.accounts.map((account) =>
        account.id === accountId ? { ...account, ...change } : account
      )
    }
    this.store.save(this.config)
    this.publish()
  }

  private setStatus(accountId: string, status: AccountStatus): void {
    if (!this.findAccount(accountId)) return
    this.status.set(accountId, status)
    this.updateViews()
    this.publish()
  }

  /** Show the Gmail view of the selected account if its status is `gmail`. Hide the others. */
  private updateViews(): void {
    for (const [accountId, view] of this.gmailViews) {
      view.setBounds(this.contentBounds)
      view.setVisible(
        accountId === this.selectedAccountId && this.status.get(accountId) === 'gmail'
      )
    }
  }

  private publish(): void {
    const window = this.mainWindow
    if (!window || window.isDestroyed()) return
    window.webContents.send(IpcChannel.stateChanged, this.state())
  }

  private findAccount(accountId: string): AccountConfig | undefined {
    return this.config.accounts.find((account) => account.id === accountId)
  }

  private findSignInWindow(contents: WebContents): SignInWindow | undefined {
    for (const signInWindow of this.signInWindows.values()) {
      const window = signInWindow.window
      if (!window.isDestroyed() && window.webContents === contents) return signInWindow
    }
    return undefined
  }
}
