/**
 * The configuration window. Its title on screen is `Settings`.
 *
 * Shifted has at most one configuration window. Opening it again brings the open window
 * to the front.
 */
import { BrowserWindow, type WebContents } from 'electron'
import icon from '../../resources/icon.png?asset'
import { IpcChannel, settingsHash, type SettingsRequest } from '../shared/api'
import type { Accounts } from './accounts'
import {
  loadShiftedScreen,
  lockShiftedScreen,
  shiftedScreenWebPreferences
} from './shifted-screens'
import { baseBackgroundColor, followBaseBackground } from './window-frame'

export const SETTINGS_WINDOW_TITLE = 'Settings'

export class SettingsWindow {
  private window: BrowserWindow | null = null

  constructor(accounts: Accounts) {
    accounts.subscribe((state) => {
      const window = this.window
      if (window && !window.isDestroyed()) window.webContents.send(IpcChannel.stateChanged, state)
    })
  }

  /**
   * Open the configuration window, or bring it to the front.
   *
   * @param request The page to show. Without a request, a new window shows General, and
   *   an open window keeps its page.
   */
  open(request?: SettingsRequest): void {
    const open = this.window
    if (open && !open.isDestroyed()) {
      if (request) open.webContents.send(IpcChannel.showSettingsPage, request)
      if (open.isMinimized()) open.restore()
      open.show()
      open.focus()
      return
    }

    const window = new BrowserWindow({
      title: SETTINGS_WINDOW_TITLE,
      backgroundColor: baseBackgroundColor(),
      width: 720,
      height: 520,
      minWidth: 560,
      minHeight: 400,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform !== 'darwin' ? { icon } : {}),
      webPreferences: shiftedScreenWebPreferences()
    })
    this.window = window
    lockShiftedScreen(window.webContents)
    followBaseBackground(window)

    // The window keeps its title. The React page has the title of the main window.
    window.on('page-title-updated', (event) => {
      event.preventDefault()
    })
    window.once('ready-to-show', () => {
      window.show()
    })
    window.on('closed', () => {
      if (this.window === window) this.window = null
    })

    loadShiftedScreen(window.webContents, settingsHash(request ?? { page: 'general' }))
  }

  /** True when the web contents is the React screen of the configuration window. */
  isScreen(contents: WebContents): boolean {
    const window = this.window
    return window !== null && !window.isDestroyed() && window.webContents === contents
  }
}
