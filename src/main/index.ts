import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { Snooze } from '../shared/api'
import { AccountPicker } from './account-picker'
import { Accounts } from './accounts'
import { AppBadge } from './app-badge'
import { buildSnoozeMenu, setAppMenu, type AppMenuActions } from './app-menu'
import { ConfigStore } from './config'
import { gmailMessageUrl, gmailUrl } from './google-urls'
import { registerIpc } from './ipc'
import { newMailNotifications } from './new-mail'
import { findMailtoArgument, isMailtoUrl } from './mailto'
import { MailtoLinks } from './mailto-links'
import { iconFromDataUrl, Notifier } from './notifications'
import { registerPageNotifications } from './page-notifications'
import { ProfilePhotos } from './profile-photos'
import { ScreenPicker } from './screen-picker'
import { SettingsWindow } from './settings-window'
import {
  loadShiftedScreen,
  lockShiftedScreen,
  shiftedScreenWebPreferences
} from './shifted-screens'
import { appBadgeTotal } from './unread-counts'
import { applyUserAgent } from './user-agent'
import { MainWindowBackdrop, mainWindowBackdrop, mainWindowFrameOptions } from './window-frame'

/** The bundle identifier of Shifted. See "Name" in `docs/spec/PRODUCT.md`. */
const APP_ID = 'io.github.briandilley.shifted'

// Tests give each run its own user data folder, so that tests never share state.
const userDataDir = process.env['SHIFTED_USER_DATA_DIR']
if (userDataDir) {
  app.setPath('userData', userDataDir)
}

// The user agent must be set before any window opens.
applyUserAgent(app)

// One copy of Shifted at a time. A second copy gives its command line to the first copy
// (the `second-instance` event) and quits. The lock belongs to the user data folder, so
// it must come after the folder is set.
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}

/** Handles `mailto:` links from other apps after Shifted is ready. */
let mailtoLinks: MailtoLinks | null = null
/** The `mailto:` link that came before Shifted was ready. The newest link wins. */
let pendingMailto: string | undefined
/** Show the main window. Set when Shifted is ready. */
let showMainWindow: (() => BrowserWindow | null) | null = null

function receiveMailto(url: string): void {
  if (mailtoLinks) mailtoLinks.open(url)
  else pendingMailto = url
}

if (hasSingleInstanceLock) {
  // macOS sends a link with `open-url`. Listen before `ready`, so that a link that starts
  // Shifted is not lost.
  app.on('open-url', (event, url) => {
    if (!isMailtoUrl(url)) return
    event.preventDefault()
    receiveMailto(url)
  })

  // Windows and Linux give the link on the command line: at start, and from a second copy.
  pendingMailto = findMailtoArgument(process.argv)
  app.on('second-instance', (_event, commandLine) => {
    const link = findMailtoArgument(commandLine)
    if (link) receiveMailto(link)
    else showMainWindow?.()
  })
}

function createMainWindow(accounts: Accounts, badge: AppBadge): BrowserWindow {
  const mainWindow = new BrowserWindow({
    title: 'Shifted',
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    // The frame of `DESIGN.md`, and the backdrop of the selected account as the background
    // color, so that no white flash shows at startup.
    ...mainWindowFrameOptions(mainWindowBackdrop(accounts.state())),
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: shiftedScreenWebPreferences()
  })

  // The background color and the window buttons follow the backdrop of the selected
  // account and the light or dark mode.
  const backdrop = new MainWindowBackdrop(mainWindow, () => accounts.state())
  const stopBackdrop = accounts.subscribe(() => backdrop.update())
  mainWindow.on('closed', stopBackdrop)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // The screens of Shifted open no windows and never navigate away from their own page.
  lockShiftedScreen(mainWindow.webContents)
  loadShiftedScreen(mainWindow.webContents)
  accounts.attachMainWindow(mainWindow)
  badge.attachWindow(mainWindow)

  return mainWindow
}

// Shifted never skips a certificate error.
app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
  event.preventDefault()
  callback(false)
})

// The `<webview>` tag is off in every web contents.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
})

function startShifted(): void {
  // Windows shows the notifications of an app only with an Application User Model ID.
  // In development, Electron's own executable stands for Shifted, as the Electron
  // documentation says.
  if (process.platform === 'win32') {
    app.setAppUserModelId(is.dev ? process.execPath : APP_ID)
  }

  if (process.platform === 'darwin' && is.dev) {
    app.dock?.setIcon(icon)
  }

  // F12 opens the developer tools in development. Cmd+R does nothing in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const userData = app.getPath('userData')
  const screenPicker = new ScreenPicker()
  const accounts = new Accounts(
    new ConfigStore(userData),
    new ProfilePhotos(join(userData, 'photos')),
    screenPicker
  )
  const settings = new SettingsWindow(accounts)
  const accountPicker = new AccountPicker(accounts)
  registerIpc(accounts, settings, screenPicker, accountPicker)
  // The app badge shows the sum of the unread counts of all accounts.
  const badge = new AppBadge()
  accounts.subscribe((state) => badge.update(appBadgeTotal(state.accounts)))
  createMainWindow(accounts, badge)

  /** Show the main window. On macOS, it can be closed while Shifted runs. Open it again. */
  const ensureMainWindow = (): void => {
    if (
      !BrowserWindow.getAllWindows().some((window) => accounts.isMainScreen(window.webContents))
    ) {
      createMainWindow(accounts, badge)
    }
  }

  // The app menu, with the "Snooze" submenu. It changes when the snooze changes.
  const menuActions: AppMenuActions = {
    openSettings: () => settings.open(),
    snooze: (choice) => accounts.setSnooze(choice),
    stopSnooze: () => accounts.stopSnooze(),
    showSnoozeChoices: () => {
      const window = BrowserWindow.getFocusedWindow()
      const menu = buildSnoozeMenu(menuActions, accounts.snooze())
      menu.popup(window ? { window } : {})
    }
  }
  let menuSnooze: Snooze | null = accounts.snooze()
  setAppMenu(menuActions, menuSnooze)
  accounts.subscribe((state) => {
    const same =
      state.snooze === null || menuSnooze === null
        ? state.snooze === menuSnooze
        : state.snooze.until === menuSnooze.until
    if (same) return
    menuSnooze = state.snooze
    setAppMenu(menuActions, menuSnooze)
  })

  // Notifications: new mail from the feed, and the web notifications of the Google pages.
  const notifier = new Notifier({
    account: (accountId) => accounts.account(accountId),
    snooze: () => accounts.snooze()
  })
  accounts.onNewMail((accountId, entries) => {
    const account = accounts.account(accountId)
    if (!account) return
    const title = account.nickname || account.email || 'New account'
    for (const notification of newMailNotifications(title, entries)) {
      notifier.notify({
        accountId,
        kind: 'new-mail',
        title: notification.title,
        body: notification.body,
        icon: iconFromDataUrl(accounts.account(accountId)?.photo),
        onClick: () => {
          ensureMainWindow()
          // A click on a message opens it. A click on a summary opens the inbox.
          const url = notification.entry ? gmailMessageUrl(notification.entry.link) : gmailUrl()
          accounts.showInGoogleApp(accountId, 'gmail', url)
        }
      })
    }
  })
  registerPageNotifications({
    notifier,
    source: (contents) => accounts.googlePageSource(contents),
    showGoogleApp: (accountId, googleApp) => {
      ensureMainWindow()
      accounts.showInGoogleApp(accountId, googleApp)
    },
    accountPhoto: (accountId) => accounts.account(accountId)?.photo ?? null
  })

  // A removal deletes a session from disk. Let it end before Shifted quits.
  app.on('will-quit', (event) => {
    const pending = accounts.pendingRemovals()
    if (!pending) return
    event.preventDefault()
    void pending.then(() => app.quit())
  })

  app.on('activate', ensureMainWindow)

  // `mailto:` links from other apps.
  showMainWindow = (): BrowserWindow | null => {
    ensureMainWindow()
    const window =
      BrowserWindow.getAllWindows().find((candidate) =>
        accounts.isMainScreen(candidate.webContents)
      ) ?? null
    if (window) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
    return window
  }
  mailtoLinks = new MailtoLinks(accounts, accountPicker, showMainWindow)
  if (pendingMailto) {
    const link = pendingMailto
    pendingMailto = undefined
    mailtoLinks.open(link)
  }
}

if (hasSingleInstanceLock) {
  void app.whenReady().then(startShifted)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
