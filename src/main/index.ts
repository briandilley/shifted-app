import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { AccountPicker } from './account-picker'
import { Accounts } from './accounts'
import { AppBadge } from './app-badge'
import { buildSnoozeMenu, setAppMenu, type AppMenuActions } from './app-menu'
import { ConfigStore } from './config'
import { emailConfigurationToSelf } from './export-configuration'
import { gmailMessageUrl, gmailUrl } from './google-urls'
import { ImportWindow } from './import-window'
import { registerIpc } from './ipc'
import { newMailNotifications } from './new-mail'
import { findMailtoArgument, isMailtoUrl } from './mailto'
import { MailtoLinks } from './mailto-links'
import { wasOpenedAtLogin } from './login-item'
import { iconFromDataUrl, Notifier } from './notifications'
import { registerPageNotifications } from './page-notifications'
import { ProfilePhotos } from './profile-photos'
import { ScreenPicker } from './screen-picker'
import { SettingsWindow } from './settings-window'
import { catchShortcuts, type ShortcutAction } from './shortcuts'
import {
  loadShiftedScreen,
  lockShiftedScreen,
  shiftedScreenWebPreferences
} from './shifted-screens'
import { isTrayAvailable, ShiftedTray } from './tray'
import { appBadgeTotal } from './unread-counts'
import { applyUserAgent } from './user-agent'
import {
  MAIN_WINDOW_MIN_SIZE,
  MainWindowBackdrop,
  mainWindowBackdrop,
  mainWindowFrameOptions
} from './window-frame'
import { restoredBounds, WINDOW_STATE_FILE_NAME, WindowStateKeeper } from './window-state'

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
/** True after Shifted starts to quit. Then closing the main window closes it. */
let quitting = false

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

/** The size of a new main window, in points. */
const MAIN_WINDOW_SIZE = { width: 1200, height: 800 } as const

interface MainWindowOptions {
  accounts: Accounts
  badge: AppBadge
  windowState: WindowStateKeeper
  /** True when the main window starts hidden, after Shifted opened at login. */
  hidden: boolean
  /**
   * What closing the main window does: hide it, or quit Shifted (on Linux with no tray).
   */
  closeQuits: boolean
}

function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const { accounts, badge, windowState } = options
  // Put the window back where it was. If that place is off every screen, center it.
  const saved = windowState.load()
  const bounds = restoredBounds(
    saved?.bounds,
    screen.getAllDisplays().map((display) => display.workArea),
    screen.getPrimaryDisplay().workArea,
    {
      ...MAIN_WINDOW_SIZE,
      minWidth: MAIN_WINDOW_MIN_SIZE.width,
      minHeight: MAIN_WINDOW_MIN_SIZE.height
    }
  )
  const mainWindow = new BrowserWindow({
    title: 'Shifted',
    ...bounds,
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

  if (saved?.maximized) mainWindow.maximize()
  windowState.track(mainWindow)

  mainWindow.once('ready-to-show', () => {
    if (!options.hidden) mainWindow.show()
  })

  // Closing the main window hides it. Shifted keeps running, so that badges and
  // notifications continue. Quit closes it.
  mainWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    if (options.closeQuits) {
      app.quit()
      return
    }
    // A window in full screen leaves a black screen on macOS if it hides at once.
    if (mainWindow.isFullScreen()) {
      mainWindow.once('leave-full-screen', () => mainWindow.hide())
      mainWindow.setFullScreen(false)
      return
    }
    mainWindow.hide()
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
  const importWindow = new ImportWindow(accounts, () => {
    showMainWindow?.()
  })
  registerIpc(accounts, settings, screenPicker, accountPicker, {
    importWindow,
    // The compose path of `mailto:` links: Gmail of the account, in the main window, which
    // comes to the front.
    emailConfigurationToSelf: () =>
      emailConfigurationToSelf(accounts, (accountId, url) => mailtoLinks?.compose(accountId, url))
  })
  // The app badge shows the sum of the unread counts of all accounts.
  const badge = new AppBadge()
  accounts.subscribe((state) => badge.update(appBadgeTotal(state.accounts)))

  // On Windows and Linux, the tray icon shows the total and the main window. On Linux
  // with no tray, closing the main window quits Shifted.
  const hasTray = isTrayAvailable()
  const windowState = new WindowStateKeeper(join(userData, WINDOW_STATE_FILE_NAME))
  const mainWindowOptions = (hidden: boolean): MainWindowOptions => ({
    accounts,
    badge,
    windowState,
    hidden,
    closeQuits: process.platform === 'linux' && !hasTray
  })
  // When Shifted opens at login, the main window starts hidden. The feeds start at once.
  createMainWindow(mainWindowOptions(wasOpenedAtLogin()))

  /** Make the main window again if it does not exist. Normally it only hides. */
  const ensureMainWindow = (): void => {
    if (
      !BrowserWindow.getAllWindows().some((window) => accounts.isMainScreen(window.webContents))
    ) {
      createMainWindow(mainWindowOptions(false))
    }
  }

  /** Show the main window and bring it to the front. */
  const bringMainWindowToFront = (): BrowserWindow | null => {
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

  const showSnoozeChoices = (): void => {
    const window = BrowserWindow.getFocusedWindow()
    const menu = buildSnoozeMenu(menuActions, accounts.snooze())
    menu.popup(window ? { window } : {})
  }

  /** Run the action of a keyboard shortcut. See "Keyboard shortcuts" in `PRODUCT.md`. */
  const runShortcut = (action: ShortcutAction): void => {
    switch (action.kind) {
      case 'select-account':
        accounts.selectAccountAt(action.index)
        return
      case 'next-account':
        accounts.selectAdjacentAccount(1)
        return
      case 'previous-account':
        accounts.selectAdjacentAccount(-1)
        return
      case 'google-app':
        accounts.selectGoogleApp(action.googleApp)
        return
      case 'reload':
        accounts.reloadGoogleApp()
        return
      case 'settings':
        settings.open()
        return
      case 'add-account':
        bringMainWindowToFront()
        accounts.addAccount()
        return
      case 'snooze':
        showSnoozeChoices()
        return
    }
  }

  // A web view gets the keys before the app menu does. Catch the shortcuts in every web
  // contents: the Google views, the child windows, and the screens of Shifted.
  app.on('web-contents-created', (_event, contents) => {
    catchShortcuts(contents, runShortcut)
  })
  for (const window of BrowserWindow.getAllWindows()) {
    catchShortcuts(window.webContents, runShortcut)
  }

  // The app menu shows every shortcut. It changes when the snooze or the accounts change.
  const menuActions: AppMenuActions = {
    runShortcut,
    snooze: (choice) => accounts.setSnooze(choice),
    stopSnooze: () => accounts.stopSnooze()
  }
  const accountNames = (): string[] =>
    accounts.state().accounts.map((account) => account.nickname || account.email || 'New account')
  let menuKey = ''
  const updateAppMenu = (): void => {
    const snooze = accounts.snooze()
    const names = accountNames()
    const key = JSON.stringify([snooze, names])
    if (key === menuKey) return
    menuKey = key
    setAppMenu(menuActions, snooze, names)
    tray?.setSnooze(snooze)
  }

  // The tray icon of Windows and Linux.
  const tray = hasTray
    ? new ShiftedTray(
        {
          show: () => {
            bringMainWindowToFront()
          },
          snooze: (choice) => accounts.setSnooze(choice),
          stopSnooze: () => accounts.stopSnooze(),
          quit: () => app.quit()
        },
        accounts.snooze()
      )
    : null
  updateAppMenu()
  accounts.subscribe((state) => {
    updateAppMenu()
    tray?.setTotal(appBadgeTotal(state.accounts))
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

  // Quit closes all windows and ends the feed polling.
  app.on('before-quit', () => {
    quitting = true
    accounts.shutdown()
  })
  app.on('quit', () => {
    tray?.destroy()
  })

  // A removal deletes a session from disk. Let it end before Shifted quits.
  app.on('will-quit', (event) => {
    const pending = accounts.pendingRemovals()
    if (!pending) return
    event.preventDefault()
    void pending.then(() => app.quit())
  })

  // macOS: a click on the Dock icon shows the main window again.
  app.on('activate', () => {
    bringMainWindowToFront()
  })

  // `mailto:` links from other apps, and a second copy of Shifted.
  showMainWindow = bringMainWindowToFront
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

// Shifted keeps running in the background. Closing the main window only hides it, and
// Quit is in the app menu and the tray menu.
app.on('window-all-closed', () => {
  // Nothing to do. Without this handler, Electron would quit.
})

// During quit, a page that asks to stay open (`beforeunload`) does not stop the quit.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-prevent-unload', (event) => {
    if (quitting) event.preventDefault()
  })
})
