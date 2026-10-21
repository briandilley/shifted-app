/**
 * The accounts of Shifted: the configuration, the session of each account, the Google app
 * views of each account in the main window, the sign-in windows, and the profile photos.
 */
import { dialog, type BrowserWindow, type WebContents } from 'electron'
import {
  findAccountColor,
  IpcChannel,
  MAX_NICKNAME_LENGTH,
  type AccountState,
  type AccountStatus,
  type AskedPermission,
  type GoogleApp,
  type PermissionAnswer,
  type ShiftedState,
  type ViewBounds
} from '../shared/api'
import {
  accountSession,
  clearAccountSession,
  deleteAccountSession,
  flushAccountSession
} from './account-session'
import { AccountViews } from './account-views'
import { ChildWindows } from './child-windows'
import {
  moveAccount,
  newAccount,
  type AccountConfig,
  type Config,
  type ConfigStore
} from './config'
import { Downloads } from './downloads'
import { parseFeedAddress } from './feed'
import { findProfilePhotoUrl } from './gmail-page'
import { feedUrl, isProfilePhotoUrl } from './google-urls'
import type { LinkHandlers } from './link-handlers'
import type { ProfilePhotos } from './profile-photos'
import type { ScreenPicker } from './screen-picker'
import { configureAccountSession, type SessionHandlerDeps } from './session-handlers'
import { SignInWindow } from './sign-in-window'

function ignore(): void {
  // A request that failed or a view that closed. Nothing to do.
}

export type StateListener = (state: ShiftedState) => void

export class Accounts {
  private config: Config
  private readonly status = new Map<string, AccountStatus>()
  /** The accounts that finished sign-in at least once. */
  private readonly signedInOnce = new Set<string>()
  private readonly signInWindows = new Map<string, SignInWindow>()
  private readonly removals = new Map<string, Promise<void>>()
  private readonly signOuts = new Map<string, Promise<void>>()
  private readonly photoLookups = new Set<string>()
  private readonly listeners = new Set<StateListener>()
  private selectedAccountId: string | null
  private mainWindow: BrowserWindow | null = null
  private views: AccountViews | null = null
  private readonly childWindows = new ChildWindows()
  private readonly downloads = new Downloads(() => this.config.general.askWhereToSave)
  private readonly links: LinkHandlers = {
    showInGoogleApp: (accountId, googleApp, url) => this.showInGoogleApp(accountId, googleApp, url),
    signedOut: (accountId) => this.setStatus(accountId, 'signed-out'),
    childWindowOptions: (accountId) =>
      this.childWindows.options(accountId, this.accountName(accountId)),
    childWindowCreated: (accountId, window, openedUrl) => {
      if (this.findAccount(accountId) && !this.removals.has(accountId)) {
        this.childWindows.add(accountId, window, this.accountName(accountId), openedUrl)
      } else {
        window.destroy()
      }
    }
  }
  private readonly sessionHandlers: SessionHandlerDeps

  constructor(
    private readonly store: ConfigStore,
    private readonly photos: ProfilePhotos,
    screenPicker: ScreenPicker
  ) {
    this.config = store.load()
    this.sessionHandlers = {
      accountName: (accountId) => this.accountName(accountId),
      pagePermissions: (accountId) => this.findAccount(accountId)?.pagePermissions ?? {},
      savePagePermission: (accountId, permission, answer) =>
        this.savePagePermission(accountId, permission, answer),
      fallbackWindow: () =>
        this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null,
      pickScreen: (parent, accountName) => screenPicker.pick(parent, accountName),
      download: (item, contents) => {
        this.downloads.handle(item)
        this.childWindows.closeIfOnlyDownload(contents)
      }
    }
    // An account in the configuration signed in before. Its session is on disk.
    for (const account of this.config.accounts) {
      this.status.set(account.id, 'signed-in')
      this.signedInOnce.add(account.id)
      this.session(account.id)
    }
    this.selectedAccountId = this.config.accounts[0]?.id ?? null
  }

  state(): ShiftedState {
    return {
      accounts: this.config.accounts.map((account) => this.accountState(account)),
      selectedAccountId: this.selectedAccountId,
      general: { ...this.config.general }
    }
  }

  /** One account as the screens of Shifted see it, or `undefined` if it does not exist. */
  account(accountId: string): AccountState | undefined {
    const account = this.findAccount(accountId)
    return account ? this.accountState(account) : undefined
  }

  /** Call the listener each time the state changes. Returns a function that stops it. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Show the accounts in the main window. Call it each time the main window opens. */
  attachMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
    const views = new AccountViews(window, {
      links: this.links,
      onGmailLoaded: (accountId, gmail) => this.gmailLoaded(accountId, gmail)
    })
    this.views = views
    window.on('closed', () => {
      views.closeAll()
      if (this.views === views) this.views = null
      if (this.mainWindow === window) this.mainWindow = null
    })
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
      this.views?.setBounds(bounds)
      return
    }
    this.findSignInWindow(sender)?.setViewBounds(bounds)
  }

  /** Make a new account and open its sign-in window. */
  addAccount(): void {
    const account = newAccount(this.config.accounts)
    this.config = { ...this.config, accounts: [...this.config.accounts, account] }
    this.store.save(this.config)
    this.session(account.id)
    this.selectedAccountId = account.id
    this.openSignInWindow(account.id)
  }

  /** Show this account in the content area, with the Google app that it used last. */
  selectAccount(accountId: string): void {
    if (!this.findAccount(accountId) || this.removals.has(accountId)) return
    if (this.selectedAccountId === accountId) return
    this.selectedAccountId = accountId
    this.updateViews()
    this.publish()
  }

  /** Show this Google app of the selected account, and remember it for the account. */
  selectGoogleApp(googleApp: GoogleApp): void {
    const account = this.selectedAccountId ? this.findAccount(this.selectedAccountId) : undefined
    if (!account || account.lastGoogleApp === googleApp) return
    this.updateAccount(account.id, { lastGoogleApp: googleApp })
    this.updateViews()
  }

  /**
   * Select the account, show this Google app, and load the URL in its view. The link
   * rules use it, for example for a Calendar link in Gmail. The main window comes to the
   * front.
   */
  showInGoogleApp(accountId: string, googleApp: GoogleApp, url: string): void {
    const account = this.findAccount(accountId)
    const views = this.views
    if (!account || !views || this.removals.has(accountId)) return
    if (this.status.get(accountId) !== 'signed-in') return
    this.selectedAccountId = accountId
    if (account.lastGoogleApp !== googleApp) {
      this.updateAccount(accountId, { lastGoogleApp: googleApp })
    }
    views.load(accountId, googleApp, url)
    this.updateViews()
    this.publish()
    const window = this.mainWindow
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
  }

  /** Turn "Ask where to save each file" on or off. */
  setAskWhereToSave(value: boolean): void {
    if (this.config.general.askWhereToSave === value) return
    this.config = { ...this.config, general: { ...this.config.general, askWhereToSave: value } }
    this.store.save(this.config)
    this.publish()
  }

  /** Forget the saved answers to the page permissions of the account. */
  resetPagePermissions(accountId: string): void {
    const account = this.findAccount(accountId)
    if (!account || Object.keys(account.pagePermissions).length === 0) return
    this.updateAccount(accountId, { pagePermissions: {} })
  }

  /** Move the account to a new place in the sidebar, and save the new order. */
  moveAccount(accountId: string, toIndex: number): void {
    if (!this.findAccount(accountId)) return
    const accounts = moveAccount(this.config.accounts, accountId, toIndex)
    const unchanged = accounts.every(
      (account, index) =>
        account.id === this.config.accounts[index]?.id &&
        account.order === this.config.accounts[index]?.order
    )
    if (unchanged) return
    this.config = { ...this.config, accounts }
    this.store.save(this.config)
    this.publish()
  }

  setNickname(accountId: string, nickname: string): void {
    const value = nickname.trim().slice(0, MAX_NICKNAME_LENGTH)
    const account = this.findAccount(accountId)
    if (!account || account.nickname === value) return
    this.updateAccount(accountId, { nickname: value })
  }

  /** Set the color of the account. Shifted ignores a color that is not in the set. */
  setColor(accountId: string, color: string): void {
    const value = findAccountColor(color)
    const account = this.findAccount(accountId)
    if (!value || !account || account.color === value) return
    this.updateAccount(accountId, { color: value })
  }

  /**
   * Sign the account out: close its views and its sign-in window, and clear its session.
   * The content area then shows the signed-out panel.
   */
  signOut(accountId: string): Promise<void> {
    const running = this.signOuts.get(accountId)
    if (running) return running
    if (!this.findAccount(accountId) || this.removals.has(accountId)) return Promise.resolve()
    const signOut = this.signOutNow(accountId).finally(() => {
      this.signOuts.delete(accountId)
    })
    this.signOuts.set(accountId, signOut)
    return signOut
  }

  /** Open the sign-in window for an account that is signed out. */
  signInAgain(accountId: string): void {
    if (!this.findAccount(accountId) || this.removals.has(accountId)) return
    if (this.status.get(accountId) === 'signed-in') return
    const signOut = this.signOuts.get(accountId)
    if (signOut) {
      // Wait until the session is clear, so that the sign-in window starts signed out.
      void signOut.then(() => this.signInAgain(accountId))
      return
    }
    this.openSignInWindow(accountId)
  }

  /** Ask the person to confirm, then remove the account. */
  async confirmAndRemove(accountId: string, parent?: BrowserWindow | null): Promise<void> {
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
    const window = parent ?? this.mainWindow
    const { response } =
      window && !window.isDestroyed()
        ? await dialog.showMessageBox(window, options)
        : await dialog.showMessageBox(options)
    if (response !== 0) return
    await this.remove(accountId)
  }

  /**
   * Close the views of the account, delete its session and its photo, and remove it from
   * the configuration.
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
    // 1. Close the views and the child windows of the account.
    this.closeSignInWindow(accountId)
    this.childWindows.close(accountId)
    this.views?.close(accountId)
    await this.signOuts.get(accountId)?.catch(ignore)

    // 2. and 3. Clear the storage data of the session, and delete its partition folder.
    try {
      await deleteAccountSession(accountId)
    } catch (error) {
      console.error(`Shifted could not delete the session of account ${accountId}:`, error)
    }
    try {
      this.photos.delete(accountId)
    } catch (error) {
      console.error(`Shifted could not delete the photo of account ${accountId}:`, error)
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

  private async signOutNow(accountId: string): Promise<void> {
    this.closeSignInWindow(accountId)
    this.childWindows.close(accountId)
    this.views?.close(accountId)
    this.signedInOnce.add(accountId)
    this.setStatus(accountId, 'signed-out')
    await clearAccountSession(accountId)
  }

  private openSignInWindow(accountId: string): void {
    const open = this.signInWindows.get(accountId)
    if (open) {
      open.focus()
      return
    }
    const signInWindow: SignInWindow = new SignInWindow(this.session(accountId), {
      onFinished: () => this.signInFinished(accountId),
      onClosed: (finished) => this.signInWindowClosed(accountId, signInWindow, finished)
    })
    this.signInWindows.set(accountId, signInWindow)
    this.setStatus(accountId, 'signing-in')
  }

  /** Close the sign-in window of the account without the "closed" handling. */
  private closeSignInWindow(accountId: string): void {
    const signInWindow = this.signInWindows.get(accountId)
    // Take the window out first, so that `signInWindowClosed` does nothing.
    this.signInWindows.delete(accountId)
    signInWindow?.close()
  }

  private signInFinished(accountId: string): void {
    this.signedInOnce.add(accountId)
    // Write the new cookies to disk now, so that the account stays signed in.
    flushAccountSession(accountId).catch(ignore)
    this.status.set(accountId, 'signed-in')
    // Load the views of the account again with the new session. Load Gmail even if the
    // account is not selected, so that Shifted reads its address and its photo.
    this.views?.reload(accountId)
    this.views?.ensure(accountId, 'gmail')
    this.updateViews()
    this.publish()
  }

  private signInWindowClosed(accountId: string, window: SignInWindow, finished: boolean): void {
    // A removal or a sign-out closes the sign-in window itself. It already took it out.
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

  /** Gmail of the account loaded: read its address and its profile photo. */
  private gmailLoaded(accountId: string, gmail: WebContents): void {
    this.readAddress(accountId).catch(ignore)
    this.readPhoto(accountId, gmail).catch((error: unknown) => {
      console.error(`Shifted could not read the photo of account ${accountId}:`, error)
    })
  }

  /** Read the email address of the account from the title of its Atom feed. */
  private async readAddress(accountId: string): Promise<void> {
    const response = await this.session(accountId).fetch(feedUrl(), { credentials: 'include' })
    if (!response.ok) return
    const address = parseFeedAddress(await response.text())
    const account = this.findAccount(accountId)
    if (!address || !account || account.email === address) return
    this.updateAccount(accountId, { email: address })
  }

  /**
   * Find the profile photo in the Gmail page, download it with the session of the
   * account, and save it. If the page shows no photo, Shifted keeps the saved photo.
   */
  private async readPhoto(accountId: string, gmail: WebContents): Promise<void> {
    if (this.photoLookups.has(accountId)) return
    this.photoLookups.add(accountId)
    try {
      const url = await findProfilePhotoUrl(gmail)
      if (!url || !isProfilePhotoUrl(url) || !this.findAccount(accountId)) return
      const changed = await this.photos.download(accountId, this.session(accountId), url)
      if (changed && this.findAccount(accountId)) this.publish()
    } finally {
      this.photoLookups.delete(accountId)
    }
  }

  private updateAccount(accountId: string, change: Partial<AccountConfig>): void {
    this.config = {
      ...this.config,
      accounts: this.config.accounts.map((account) =>
        account.id === accountId ? { ...account, ...change } : account
      )
    }
    this.store.save(this.config)
    if (change.email !== undefined || change.nickname !== undefined) {
      this.childWindows.setTitle(accountId, this.accountName(accountId))
    }
    this.publish()
  }

  private savePagePermission(
    accountId: string,
    permission: AskedPermission,
    answer: PermissionAnswer
  ): void {
    const account = this.findAccount(accountId)
    if (!account || account.pagePermissions[permission] === answer) return
    this.updateAccount(accountId, {
      pagePermissions: { ...account.pagePermissions, [permission]: answer }
    })
  }

  private setStatus(accountId: string, status: AccountStatus): void {
    if (!this.findAccount(accountId)) return
    this.status.set(accountId, status)
    // A child window of an account that is not signed in has nothing to show.
    if (status !== 'signed-in') this.childWindows.close(accountId)
    this.updateViews()
    this.publish()
  }

  /** The session of the account, with the handlers for permissions and downloads. */
  private session(accountId: string): Electron.Session {
    const result = accountSession(accountId)
    configureAccountSession(result, accountId, this.sessionHandlers)
    return result
  }

  /** The name of the account in dialogs and window titles: its address, or its nickname. */
  private accountName(accountId: string): string {
    const account = this.findAccount(accountId)
    return account?.email || account?.nickname || 'New account'
  }

  /**
   * Show the Google app that the selected account used last, if the account is signed
   * in. Make its view if it does not exist yet. Hide every other view.
   */
  private updateViews(): void {
    const views = this.views
    if (!views) return
    const account = this.selectedAccountId ? this.findAccount(this.selectedAccountId) : undefined
    if (!account || this.status.get(account.id) !== 'signed-in' || this.removals.has(account.id)) {
      views.show(null)
      return
    }
    views.ensure(account.id, account.lastGoogleApp)
    views.show({ accountId: account.id, googleApp: account.lastGoogleApp })
  }

  private publish(): void {
    const state = this.state()
    const window = this.mainWindow
    if (window && !window.isDestroyed()) window.webContents.send(IpcChannel.stateChanged, state)
    for (const listener of this.listeners) listener(state)
  }

  private accountState(account: AccountConfig): AccountState {
    return {
      id: account.id,
      email: account.email,
      nickname: account.nickname,
      color: account.color,
      status: this.status.get(account.id) ?? 'signed-in',
      lastGoogleApp: account.lastGoogleApp,
      photo: this.photos.dataUrl(account.id),
      pagePermissions: { ...account.pagePermissions }
    }
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
