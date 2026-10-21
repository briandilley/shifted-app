/**
 * The accounts of Shifted: the configuration, the session of each account, the Google app
 * views of each account in the main window, the sign-in windows, the profile photos, and
 * the unread counts.
 */
import { dialog, type BrowserWindow, type WebContents } from 'electron'
import {
  findAccountColor,
  IpcChannel,
  MAX_NICKNAME_LENGTH,
  type AccountState,
  type AccountStatus,
  type AskedPermission,
  type BackgroundLoading,
  type GoogleApp,
  type ImportPreview,
  type NotificationKind,
  type PermissionAnswer,
  type QuietHours,
  type ShiftedState,
  type Snooze,
  type SnoozeChoice,
  type UnreadCountSource,
  type ViewBounds
} from '../shared/api'
import {
  accountSession,
  clearAccountSession,
  deleteAccountSession,
  flushAccountSession
} from './account-session'
import { AccountViews, type ShownGoogleApp } from './account-views'
import { googleAppsToKeepLoaded, SleepTimers, type AccountGoogleApp } from './background-loading'
import { ChildWindows } from './child-windows'
import {
  moveAccount,
  newAccount,
  type AccountConfig,
  type Config,
  type ConfigStore,
  type MailtoConfig
} from './config'
import {
  applyImport,
  exportConfiguration,
  previewImport,
  type ExportedConfiguration
} from './config-transfer'
import { Downloads } from './downloads'
import { feedErrorText, readFeed, type FeedEntry, type FeedFetch, type FeedResult } from './feed'
import { findProfilePhotoUrl, readInboxCount } from './gmail-page'
import { FEED_LABELS, isProfilePhotoUrl } from './google-urls'
import type { LinkHandlers } from './link-handlers'
import { setOpenAtLogin } from './login-item'
import { NewMailTracker } from './new-mail'
import { isSnoozed, snoozeFor } from './notification-rules'
import type { ProfilePhotos } from './profile-photos'
import type { ScreenPicker } from './screen-picker'
import { sessionGet } from './session-fetch'
import { configureAccountSession, type SessionHandlerDeps } from './session-handlers'
import { adjacentAccountId } from './shortcuts'
import { SignInWindow } from './sign-in-window'
import { testDurationMs } from './test-hooks'
import { chooseAutomaticFeed, feedToRead } from './unread-counts'
import { UnreadPoller, type ReadOutcome } from './unread-poller'

function ignore(): void {
  // A request that failed or a view that closed. Nothing to do.
}

/**
 * The options of the feed polling. An end-to-end test can make the time between two
 * reads shorter, with no random delay.
 */
function unreadPollerOptions(): ConstructorParameters<typeof UnreadPoller>[1] {
  const interval = testDurationMs('SHIFTED_TEST_READ_INTERVAL_MS')
  if (interval === undefined) return {}
  return { random: () => 0, delayMs: () => interval }
}

export type StateListener = (state: ShiftedState) => void

/** Gets the new messages of one read of the feed of an account. */
export type NewMailListener = (accountId: string, entries: FeedEntry[]) => void

/** The longest wait that `setTimeout` allows, about 24 days. */
const MAX_TIMER_MS = 2 ** 31 - 1

/** The result of the last reads of the feed of one account. */
interface UnreadState {
  /** The count of the last good read, or `null` before the first one. */
  count: number | null
  /** Why the last read failed, or `null` if it worked. */
  warning: string | null
}

export class Accounts {
  private config: Config
  private readonly status = new Map<string, AccountStatus>()
  /** The accounts that finished sign-in at least once. */
  private readonly signedInOnce = new Set<string>()
  private readonly signInWindows = new Map<string, SignInWindow>()
  private readonly removals = new Map<string, Promise<void>>()
  private readonly signOuts = new Map<string, Promise<void>>()
  private readonly photoLookups = new Set<string>()
  private readonly unread = new Map<string, UnreadState>()
  /** The accounts whose automatic choice of feed runs now. */
  private readonly feedChoices = new Set<string>()
  private readonly poller = new UnreadPoller(
    (accountId) => this.readUnreadCount(accountId),
    unreadPollerOptions()
  )
  /** The timers that put the Google apps that do not stay loaded to sleep. */
  private readonly sleepTimers = new SleepTimers({
    delayMs: testDurationMs('SHIFTED_TEST_SLEEP_MS'),
    sleep: (app) => this.sleep(app)
  })
  private readonly listeners = new Set<StateListener>()
  /** The entry IDs of the feed that Shifted saw for each account, in memory only. */
  private readonly newMail = new NewMailTracker()
  private readonly newMailListeners = new Set<NewMailListener>()
  /** The timer that ends the snooze. */
  private snoozeTimer: ReturnType<typeof setTimeout> | null = null
  private selectedAccountId: string | null
  /** A `mailto:` link came while Shifted had no accounts. See `showAddAccountFirst`. */
  private addAccountFirst = false
  private mainWindow: BrowserWindow | null = null
  private views: AccountViews | null = null
  private readonly childWindows = new ChildWindows()
  private readonly downloads = new Downloads(() => this.config.general.askWhereToSave)
  private readonly links: LinkHandlers = {
    showInGoogleApp: (accountId, googleApp, url) => this.showInGoogleApp(accountId, googleApp, url),
    signedOut: (accountId) => {
      this.setStatus(accountId, 'signed-out')
      this.poller.readNow(accountId)
    },
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
    // An account in the configuration signed in before. Its session is on disk. An
    // account from an import that never signed in here has an empty session.
    for (const account of this.config.accounts) {
      if (account.signInNeeded) {
        this.status.set(account.id, 'not-signed-in')
      } else {
        this.status.set(account.id, 'signed-in')
        this.signedInOnce.add(account.id)
      }
      this.session(account.id)
    }
    this.selectedAccountId = this.config.accounts[0]?.id ?? null
    this.syncPoller()
    this.scheduleSnoozeEnd()
  }

  state(): ShiftedState {
    const snooze = this.snooze()
    return {
      accounts: this.config.accounts.map((account) => this.accountState(account)),
      selectedAccountId: this.selectedAccountId,
      general: { ...this.config.general },
      snooze: snooze ? { ...snooze } : null,
      mailtoDefaultAccountId: this.config.mailto.defaultAccountId,
      addAccountFirst: this.addAccountFirst && this.config.accounts.length === 0
    }
  }

  /** The choices of the account picker: the `mailto:` default and the account used last. */
  mailtoChoice(): MailtoConfig {
    return { ...this.config.mailto }
  }

  /**
   * Save the account that the person chose for a `mailto:` link. With `always`, it is
   * also the `mailto:` default ("Always use this account").
   */
  saveMailtoChoice(accountId: string, always: boolean): void {
    if (!this.findAccount(accountId)) return
    const mailto: MailtoConfig = {
      defaultAccountId: always ? accountId : this.config.mailto.defaultAccountId,
      lastAccountId: accountId
    }
    if (
      mailto.defaultAccountId === this.config.mailto.defaultAccountId &&
      mailto.lastAccountId === this.config.mailto.lastAccountId
    ) {
      return
    }
    this.saveMailto(mailto)
  }

  /** Forget the `mailto:` default, so that the account picker shows again. */
  clearMailtoDefault(): void {
    if (this.config.mailto.defaultAccountId === null) return
    this.saveMailto({ ...this.config.mailto, defaultAccountId: null })
  }

  private saveMailto(mailto: MailtoConfig): void {
    this.config = { ...this.config, mailto }
    this.store.save(this.config)
    this.publish()
  }

  /**
   * A `mailto:` link came from another app, and Shifted has no accounts. The main window
   * says "Add an account first" until an account is added.
   */
  showAddAccountFirst(): void {
    this.addAccountFirst = true
    this.publish()
  }

  /** The exported configuration: the configuration without sign-ins. */
  exportConfiguration(now = new Date()): ExportedConfiguration {
    return exportConfiguration(this.config, now)
  }

  /** What an import of this exported configuration changes. */
  previewImport(imported: ExportedConfiguration): ImportPreview {
    return previewImport(this.config, imported)
  }

  /**
   * Import an exported configuration, with the rules of `previewImport`. Each new account
   * gets a new ID and an empty session, and shows "Sign in to <address>." until it signs
   * in. Shifted does not read its feed until then.
   */
  importConfiguration(imported: ExportedConfiguration): void {
    const before = this.config
    this.config = applyImport(before, imported)
    this.store.save(this.config)
    for (const account of this.config.accounts) {
      const old = before.accounts.find((candidate) => candidate.id === account.id)
      if (!old) {
        this.status.set(account.id, 'not-signed-in')
        this.session(account.id)
        continue
      }
      if (old.nickname !== account.nickname) {
        this.childWindows.setTitle(account.id, this.accountName(account.id))
      }
      if (old.unreadCountSource !== account.unreadCountSource) this.poller.readNow(account.id)
    }
    if (before.general.openAtLogin !== this.config.general.openAtLogin) {
      try {
        setOpenAtLogin(this.config.general.openAtLogin)
      } catch (error) {
        console.error('Shifted could not change "Open at login":', error)
      }
    }
    this.addAccountFirst = false
    if (this.selectedAccountId === null) {
      this.selectedAccountId = this.config.accounts[0]?.id ?? null
    }
    this.syncPoller()
    this.updateViews()
    this.publish()
  }

  /** Call the listener with the new messages of each read of the feed of each account. */
  onNewMail(listener: NewMailListener): () => void {
    this.newMailListeners.add(listener)
    return () => {
      this.newMailListeners.delete(listener)
    }
  }

  /** The snooze that runs now, or `null`. */
  snooze(): Snooze | null {
    const snooze = this.config.snooze
    return isSnoozed(snooze, new Date()) ? snooze : null
  }

  /** Start a snooze of all notifications of all accounts. */
  setSnooze(choice: SnoozeChoice): void {
    this.saveSnooze(snoozeFor(choice, new Date()))
  }

  /** Stop the snooze. */
  stopSnooze(): void {
    if (this.config.snooze === null) return
    this.saveSnooze(null)
  }

  private saveSnooze(snooze: Snooze | null): void {
    this.config = { ...this.config, snooze }
    this.store.save(this.config)
    this.scheduleSnoozeEnd()
    this.publish()
  }

  /**
   * Forget a snooze that ended, and set a timer for the end of the snooze that runs, so
   * that the screens and the menus show the end at once.
   */
  private scheduleSnoozeEnd(): void {
    if (this.snoozeTimer) clearTimeout(this.snoozeTimer)
    this.snoozeTimer = null
    const snooze = this.config.snooze
    if (snooze === null) return
    if (!isSnoozed(snooze, new Date())) {
      this.config = { ...this.config, snooze: null }
      this.store.save(this.config)
      return
    }
    if (snooze.until === null) return
    const delay = Math.min(Math.max(0, snooze.until - Date.now()) + 50, MAX_TIMER_MS)
    this.snoozeTimer = setTimeout(() => {
      this.snoozeTimer = null
      const before = this.config.snooze
      this.scheduleSnoozeEnd()
      if (this.config.snooze !== before) this.publish()
    }, delay)
  }

  /** Turn one notification switch of the account on or off. */
  setNotificationSwitch(accountId: string, kind: NotificationKind, on: boolean): void {
    const account = this.findAccount(accountId)
    if (!account || account.notifications[kind] === on) return
    this.updateAccount(accountId, { notifications: { ...account.notifications, [kind]: on } })
  }

  /** Set the quiet hours of the account. */
  setQuietHours(accountId: string, quietHours: QuietHours): void {
    const account = this.findAccount(accountId)
    if (!account) return
    const current = account.quietHours
    if (
      current.enabled === quietHours.enabled &&
      current.start === quietHours.start &&
      current.end === quietHours.end &&
      current.days.join() === quietHours.days.join()
    ) {
      return
    }
    this.updateAccount(accountId, { quietHours: { ...quietHours, days: [...quietHours.days] } })
  }

  /**
   * The account and the Google app of a Google page, by its web contents: a Gmail or
   * Calendar view, or a child window. A child window shows a Gmail pop-out, so it counts
   * as Gmail. `undefined` for any other web contents.
   */
  googlePageSource(contents: WebContents): ShownGoogleApp | undefined {
    const view = this.views?.find(contents)
    if (view) return view
    const accountId = this.childWindows.accountOf(contents)
    return accountId ? { accountId, googleApp: 'gmail' } : undefined
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
      this.sleepTimers.stopAll()
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
    this.addAccountFirst = false
    this.config = { ...this.config, accounts: [...this.config.accounts, account] }
    this.store.save(this.config)
    this.session(account.id)
    this.selectedAccountId = account.id
    this.openSignInWindow(account.id)
    this.syncPoller()
  }

  /** Show this account in the content area, with the Google app that it used last. */
  selectAccount(accountId: string): void {
    if (!this.findAccount(accountId) || this.removals.has(accountId)) return
    if (this.selectedAccountId === accountId) return
    this.selectedAccountId = accountId
    this.updateViews()
    this.publish()
    // Read the feed each time you switch to an account.
    this.poller.readNow(accountId)
  }

  /**
   * Select the account at this place in the sidebar (Cmd+1 to Cmd+9). The first place
   * is 0. If no account is at that place, do nothing.
   */
  selectAccountAt(index: number): void {
    const account = this.config.accounts[index]
    if (account) this.selectAccount(account.id)
  }

  /**
   * Select the next account (`step` 1, Ctrl+Tab) or the previous account (`step` -1,
   * Ctrl+Shift+Tab) in the sidebar. The order wraps around.
   */
  selectAdjacentAccount(step: 1 | -1): void {
    const ids = this.config.accounts
      .map((account) => account.id)
      .filter((accountId) => !this.removals.has(accountId))
    const accountId = adjacentAccountId(ids, this.selectedAccountId, step)
    if (accountId) this.selectAccount(accountId)
  }

  /** Reload the Google app in the content area (Cmd+R). */
  reloadGoogleApp(): void {
    const account = this.selectedAccountId ? this.findAccount(this.selectedAccountId) : undefined
    if (!account || this.status.get(account.id) !== 'signed-in') return
    const contents = this.views?.get(account.id, account.lastGoogleApp)?.webContents
    if (contents && !contents.isDestroyed()) contents.reload()
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
   *
   * @param url The URL to load. Without it, the view keeps its page. A click on a
   *   Calendar or Chat notification uses that.
   */
  showInGoogleApp(accountId: string, googleApp: GoogleApp, url?: string): void {
    const account = this.findAccount(accountId)
    const views = this.views
    if (!account || !views || this.removals.has(accountId)) return
    if (this.status.get(accountId) !== 'signed-in') return
    const switched = this.selectedAccountId !== accountId
    this.selectedAccountId = accountId
    if (switched) this.poller.readNow(accountId)
    if (account.lastGoogleApp !== googleApp) {
      this.updateAccount(accountId, { lastGoogleApp: googleApp })
    }
    if (url !== undefined) views.load(accountId, googleApp, url)
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

  /**
   * Set "Background loading", and apply it at once: the Google apps that must stay loaded
   * load now, and the others start their sleep timers.
   */
  setBackgroundLoading(value: BackgroundLoading): void {
    if (this.config.general.backgroundLoading === value) return
    this.config = {
      ...this.config,
      general: { ...this.config.general, backgroundLoading: value }
    }
    this.store.save(this.config)
    this.updateViews()
    this.publish()
  }

  /** Turn "Open at login" on or off, in the configuration and in the operating system. */
  setOpenAtLogin(value: boolean): void {
    if (this.config.general.openAtLogin === value) return
    this.config = { ...this.config, general: { ...this.config.general, openAtLogin: value } }
    this.store.save(this.config)
    try {
      setOpenAtLogin(value)
    } catch (error) {
      console.error('Shifted could not change "Open at login":', error)
    }
    this.publish()
  }

  /** Stop the feed polling and every timer. Shifted quits. */
  shutdown(): void {
    this.poller.stopAll()
    this.sleepTimers.stopAll()
    if (this.snoozeTimer) clearTimeout(this.snoozeTimer)
    this.snoozeTimer = null
  }

  /**
   * Set "Unread count source" of the account, and read its feed again. Choosing
   * "Automatic" forgets the feed that "Automatic" chose before, so that Shifted learns it
   * again.
   */
  setUnreadCountSource(accountId: string, source: UnreadCountSource): void {
    const account = this.findAccount(accountId)
    if (!account || account.unreadCountSource === source) return
    this.updateAccount(accountId, {
      unreadCountSource: source,
      automaticFeed: source === 'automatic' ? null : account.automaticFeed
    })
    this.poller.readNow(accountId)
    if (source !== 'automatic') return
    // Learn the feed now if Gmail of the account already shows. Otherwise on its next load.
    const gmail = this.views?.get(accountId, 'gmail')?.webContents
    if (gmail && !gmail.isDestroyed() && !gmail.isLoading()) {
      this.chooseAutomaticFeed(accountId, gmail).catch(ignore)
    }
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

    // 4. Remove the account from the configuration, also from the account picker choices.
    const forget = (id: string | null): string | null => (id === accountId ? null : id)
    this.config = {
      ...this.config,
      accounts: this.config.accounts.filter((account) => account.id !== accountId),
      mailto: {
        defaultAccountId: forget(this.config.mailto.defaultAccountId),
        lastAccountId: forget(this.config.mailto.lastAccountId)
      }
    }
    this.store.save(this.config)
    this.status.delete(accountId)
    this.signedInOnce.delete(accountId)
    this.unread.delete(accountId)
    this.newMail.forget(accountId)
    this.syncPoller()
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
    this.newMail.forget(accountId)
    await clearAccountSession(accountId)
    // The badge shows "Signed out" at once.
    this.poller.readNow(accountId)
  }

  private openSignInWindow(accountId: string): void {
    const open = this.signInWindows.get(accountId)
    if (open) {
      open.focus()
      return
    }
    // An account from an import gets its address filled in on Google's sign-in page.
    const account = this.findAccount(accountId)
    const address = account?.signInNeeded ? account.email : undefined
    const signInWindow: SignInWindow = new SignInWindow(
      this.session(accountId),
      {
        onFinished: () => this.signInFinished(accountId),
        onClosed: (finished) => this.signInWindowClosed(accountId, signInWindow, finished)
      },
      address
    )
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
    this.forgetSignInNeeded(accountId)
    // Write the new cookies to disk now, so that the account stays signed in.
    flushAccountSession(accountId).catch(ignore)
    this.status.set(accountId, 'signed-in')
    // After a sign-in, the first read of the feed only fills the set of seen messages.
    this.newMail.forget(accountId)
    // Load the views of the account again with the new session. Load Gmail even if the
    // account is not selected, so that Shifted reads its address and its photo.
    this.views?.reload(accountId)
    this.views?.ensure(accountId, 'gmail')
    this.updateViews()
    this.publish()
    this.poller.readNow(accountId)
  }

  private signInWindowClosed(accountId: string, window: SignInWindow, finished: boolean): void {
    // A removal or a sign-out closes the sign-in window itself. It already took it out.
    if (this.signInWindows.get(accountId) !== window) return
    this.signInWindows.delete(accountId)
    if (finished) return
    if (this.signedInOnce.has(accountId)) {
      this.setStatus(accountId, 'signed-out')
    } else if (this.findAccount(accountId)?.signInNeeded) {
      // An account from an import stays, with its "Sign in" panel.
      this.setStatus(accountId, 'not-signed-in')
    } else {
      // Sign-in never ended for this new account, so Shifted does not keep it.
      this.remove(accountId).catch(ignore)
    }
  }

  /**
   * Gmail of the account loaded: read its address and its profile photo, and make the
   * automatic choice of feed if it is not made yet.
   */
  private gmailLoaded(accountId: string, gmail: WebContents): void {
    this.readAddress(accountId).catch(ignore)
    this.readPhoto(accountId, gmail).catch((error: unknown) => {
      console.error(`Shifted could not read the photo of account ${accountId}:`, error)
    })
    this.chooseAutomaticFeed(accountId, gmail).catch((error: unknown) => {
      console.error(`Shifted could not choose the feed of account ${accountId}:`, error)
    })
  }

  /** Read the email address of the account from the title of its Atom feed. */
  private async readAddress(accountId: string): Promise<void> {
    const result = await readFeed(this.feedFetch(accountId), FEED_LABELS['whole-inbox'])
    if (result.ok) this.saveAddress(accountId, result.feed.address)
  }

  /** Save the address that the feed title gave, if it changed. */
  private saveAddress(accountId: string, address: string | undefined): void {
    const account = this.findAccount(accountId)
    if (!address || !account || account.email === address) return
    this.updateAccount(accountId, { email: address })
  }

  /** Read a feed with the session of the account. */
  private feedFetch(accountId: string): FeedFetch {
    const session = this.session(accountId)
    return (url) => sessionGet(session, url)
  }

  /**
   * The automatic choice of feed. Read the number next to Inbox from the title of the
   * Gmail page, then read the "Whole inbox" and the "Primary" feeds. If exactly one of them
   * has that count, save it for the account. Otherwise try again on the next load of Gmail.
   */
  private async chooseAutomaticFeed(accountId: string, gmail: WebContents): Promise<void> {
    const needsChoice = (): boolean => {
      const account = this.findAccount(accountId)
      return (
        account !== undefined &&
        !this.removals.has(accountId) &&
        account.unreadCountSource === 'automatic' &&
        account.automaticFeed === null
      )
    }
    if (!needsChoice() || this.feedChoices.has(accountId)) return
    this.feedChoices.add(accountId)
    try {
      const gmailCount = await readInboxCount(gmail)
      if (gmailCount === undefined || !needsChoice()) return
      const fetch = this.feedFetch(accountId)
      const [wholeInbox, primary] = await Promise.all([
        readFeed(fetch, FEED_LABELS['whole-inbox']),
        readFeed(fetch, FEED_LABELS.primary)
      ])
      if (!wholeInbox.ok || !primary.ok || !needsChoice()) return
      const choice = chooseAutomaticFeed(
        gmailCount,
        wholeInbox.feed.fullcount,
        primary.feed.fullcount
      )
      if (!choice) return
      this.updateAccount(accountId, { automaticFeed: choice })
      this.poller.readNow(accountId)
    } finally {
      this.feedChoices.delete(accountId)
    }
  }

  /**
   * Read the feed of the account for its unread count. The poller calls it about every
   * 60 seconds, and Shifted calls it when you switch to the account.
   */
  private async readUnreadCount(accountId: string): Promise<ReadOutcome> {
    const canRead = (): boolean =>
      this.findAccount(accountId) !== undefined &&
      !this.removals.has(accountId) &&
      this.status.get(accountId) !== 'signing-in' &&
      this.status.get(accountId) !== 'not-signed-in'
    const account = this.findAccount(accountId)
    if (!account || !canRead()) return 'skipped'
    const feed = feedToRead(account.unreadCountSource, account.automaticFeed)
    const result = await readFeed(this.feedFetch(accountId), FEED_LABELS[feed])
    const now = this.findAccount(accountId)
    // The account changed during the read. A new read follows.
    if (!now || !canRead() || feedToRead(now.unreadCountSource, now.automaticFeed) !== feed) {
      return 'skipped'
    }
    this.saveUnreadResult(accountId, result)
    if (result.ok) this.findNewMail(accountId, FEED_LABELS[feed], result.feed.entries)
    return result.ok ? 'ok' : 'error'
  }

  /**
   * Compare the entries of a good read with the entries that Shifted saw, and tell the
   * listeners about the new messages. Snooze and quiet hours do not change the set, so a
   * message that they stopped does not show later.
   */
  private findNewMail(accountId: string, feed: string, entries: FeedEntry[]): void {
    const fresh = this.newMail.read(accountId, feed, entries)
    if (fresh.length === 0) return
    for (const listener of this.newMailListeners) listener(accountId, fresh)
  }

  private saveUnreadResult(accountId: string, result: FeedResult): void {
    const previous = this.unread.get(accountId) ?? { count: null, warning: null }
    const next: UnreadState = result.ok
      ? { count: result.feed.fullcount, warning: null }
      : { count: previous.count, warning: feedErrorText(result.error) }
    this.unread.set(accountId, next)
    if (result.ok && result.feed.address) this.saveAddress(accountId, result.feed.address)
    if (previous.count !== next.count || previous.warning !== next.warning) this.publish()
  }

  /** Poll the feeds of exactly the accounts in the configuration. */
  private syncPoller(): void {
    this.poller.sync(this.config.accounts.map((account) => account.id))
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

  /**
   * The account signed in for the first time on this computer. It is no longer an account
   * from an import that needs a sign-in. The address comes from the feed, as for every
   * account. If it is another address, Shifted saves it and keeps the other values.
   */
  private forgetSignInNeeded(accountId: string): void {
    const account = this.findAccount(accountId)
    if (!account?.signInNeeded) return
    this.config = {
      ...this.config,
      accounts: this.config.accounts.map((candidate) => {
        if (candidate.id !== accountId) return candidate
        const rest = { ...candidate }
        delete rest.signInNeeded
        return rest
      })
    }
    this.store.save(this.config)
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
   * in. Make its view if it does not exist yet, also if it was asleep. Hide every other
   * view. Then apply "Background loading".
   */
  private updateViews(): void {
    const views = this.views
    if (!views) return
    const account = this.selectedAccountId ? this.findAccount(this.selectedAccountId) : undefined
    if (!account || this.status.get(account.id) !== 'signed-in' || this.removals.has(account.id)) {
      views.show(null)
    } else {
      views.ensure(account.id, account.lastGoogleApp)
      views.show({ accountId: account.id, googleApp: account.lastGoogleApp })
    }
    this.applyBackgroundLoading(views)
  }

  /**
   * Apply "Background loading": load each Google app that must stay loaded, and start the
   * sleep timer of each other loaded Google app. Only signed-in accounts load.
   */
  private applyBackgroundLoading(views: AccountViews): void {
    const loadable = this.config.accounts
      .filter((account) => this.status.get(account.id) === 'signed-in')
      .filter((account) => !this.removals.has(account.id))
      .map((account) => account.id)
    const keep = googleAppsToKeepLoaded(
      this.config.general.backgroundLoading,
      loadable,
      this.selectedAccountId
    )
    for (const app of keep) views.ensure(app.accountId, app.googleApp)
    this.sleepTimers.sync(keep, views.list())
  }

  /**
   * Put a Google app to sleep. A Google app of an account with an open child window does
   * not sleep yet, because the child window closes with its opener page.
   */
  private sleep(app: AccountGoogleApp): boolean {
    const views = this.views
    if (!views) return true
    if (this.childWindows.hasWindows(app.accountId)) return false
    return views.sleep(app.accountId, app.googleApp)
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
      pagePermissions: { ...account.pagePermissions },
      unreadCount: this.unread.get(account.id)?.count ?? null,
      unreadWarning: this.unread.get(account.id)?.warning ?? null,
      unreadCountSource: account.unreadCountSource,
      unreadFeed: feedToRead(account.unreadCountSource, account.automaticFeed),
      automaticFeedLearned: account.automaticFeed !== null,
      notifications: { ...account.notifications },
      quietHours: { ...account.quietHours, days: [...account.quietHours.days] }
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
