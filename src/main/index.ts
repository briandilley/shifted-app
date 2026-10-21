import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Accounts } from './accounts'
import { setAppMenu } from './app-menu'
import { ConfigStore } from './config'
import { registerIpc } from './ipc'
import { ProfilePhotos } from './profile-photos'
import { ScreenPicker } from './screen-picker'
import { SettingsWindow } from './settings-window'
import {
  loadShiftedScreen,
  lockShiftedScreen,
  shiftedScreenWebPreferences
} from './shifted-screens'
import { applyUserAgent } from './user-agent'

const APP_ID = 'io.github.briandilley.shifted'

// Tests give each run its own user data folder, so that tests never share state.
const userDataDir = process.env['SHIFTED_USER_DATA_DIR']
if (userDataDir) {
  app.setPath('userData', userDataDir)
}

// The user agent must be set before any window opens.
applyUserAgent(app)

function createMainWindow(accounts: Accounts): BrowserWindow {
  const mainWindow = new BrowserWindow({
    title: 'Shifted',
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: shiftedScreenWebPreferences()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // The screens of Shifted open no windows and never navigate away from their own page.
  lockShiftedScreen(mainWindow.webContents)
  loadShiftedScreen(mainWindow.webContents)
  accounts.attachMainWindow(mainWindow)

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

void app.whenReady().then(() => {
  electronApp.setAppUserModelId(APP_ID)

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
  registerIpc(accounts, settings, screenPicker)
  setAppMenu({ openSettings: () => settings.open() })
  createMainWindow(accounts)

  // A removal deletes a session from disk. Let it end before Shifted quits.
  app.on('will-quit', (event) => {
    const pending = accounts.pendingRemovals()
    if (!pending) return
    event.preventDefault()
    void pending.then(() => app.quit())
  })

  app.on('activate', () => {
    if (
      !BrowserWindow.getAllWindows().some((window) => accounts.isMainScreen(window.webContents))
    ) {
      createMainWindow(accounts)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
