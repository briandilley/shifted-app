/**
 * The "Memory use" window. The Help menu opens it. It shows a small table from
 * `app.getAppMetrics()`: each account, each Google app, and its memory. See "Background
 * loading" in `docs/spec/PRODUCT.md`.
 *
 * Shifted has at most one "Memory use" window.
 */
import { app, BrowserWindow, type WebContents } from 'electron'
import icon from '../../resources/icon.png?asset'
import { MEMORY_WINDOW_HASH, type MemoryUse } from '../shared/api'
import type { Accounts } from './accounts'
import { memoryUse } from './memory-use'
import {
  loadShiftedScreen,
  lockShiftedScreen,
  shiftedScreenWebPreferences
} from './shifted-screens'
import { baseBackgroundColor, followBaseBackground } from './window-frame'

export const MEMORY_WINDOW_TITLE = 'Memory use'

export class MemoryWindow {
  private window: BrowserWindow | null = null

  constructor(private readonly accounts: Accounts) {}

  /** Open the "Memory use" window, or bring it to the front. */
  open(): void {
    const open = this.window
    if (open && !open.isDestroyed()) {
      if (open.isMinimized()) open.restore()
      open.show()
      open.focus()
      return
    }
    const window = new BrowserWindow({
      title: MEMORY_WINDOW_TITLE,
      backgroundColor: baseBackgroundColor(),
      width: 480,
      height: 420,
      minWidth: 360,
      minHeight: 240,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform !== 'darwin' ? { icon } : {}),
      webPreferences: shiftedScreenWebPreferences()
    })
    this.window = window
    lockShiftedScreen(window.webContents)
    followBaseBackground(window)
    window.on('page-title-updated', (event) => {
      event.preventDefault()
    })
    window.once('ready-to-show', () => {
      window.show()
    })
    window.on('closed', () => {
      if (this.window === window) this.window = null
    })
    loadShiftedScreen(window.webContents, MEMORY_WINDOW_HASH)
  }

  /** True when the web contents is the React screen of the "Memory use" window. */
  isScreen(contents: WebContents): boolean {
    const window = this.window
    return window !== null && !window.isDestroyed() && window.webContents === contents
  }

  /** The table that the window shows now. */
  info(): MemoryUse {
    const processes = app.getAppMetrics().map((metric) => ({
      pid: metric.pid,
      kilobytes: metric.memory.workingSetSize
    }))
    return memoryUse(this.accounts.googleAppProcesses(), processes)
  }
}
