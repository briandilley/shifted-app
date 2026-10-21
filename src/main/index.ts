import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { applyUserAgent } from './user-agent'

const APP_ID = 'io.github.briandilley.shifted'

// Tests give each run its own user data folder, so that tests never share state.
const userDataDir = process.env['SHIFTED_USER_DATA_DIR']
if (userDataDir) {
  app.setPath('userData', userDataDir)
}

// The user agent must be set before any window opens.
applyUserAgent(app)

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    title: 'Shifted',
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // The screens of Shifted open no windows. Prompt 03 adds the link rules.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // The screens of Shifted never navigate away from their own page.
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

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

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
