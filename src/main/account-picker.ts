/**
 * The account picker: the small Shifted window that asks which account to use for a
 * `mailto:` link from another app. See "mailto: links" in `docs/spec/PRODUCT.md`.
 *
 * Shifted has at most one account picker. A new link while it is open replaces the link
 * that it shows.
 */
import { BrowserWindow, type WebContents } from 'electron'
import icon from '../../resources/icon.png?asset'
import { IpcChannel, MAILTO_PICKER_HASH, type MailtoPickerInfo } from '../shared/api'
import type { Accounts } from './accounts'
import {
  loadShiftedScreen,
  lockShiftedScreen,
  shiftedScreenWebPreferences
} from './shifted-screens'
import { baseBackgroundColor, followBaseBackground } from './window-frame'

/** The choice of the person in the account picker. */
export interface AccountPickerChoice {
  accountId: string
  /** "Always use this account" was selected. */
  always: boolean
}

/** Gets the choice, or `null` when the person closed the picker. */
export type AccountPickerHandler = (choice: AccountPickerChoice | null) => void

const PICKER_WIDTH = 420
/** The height of the top line, the "Always use this account" box, and the buttons. */
const PICKER_FRAME_HEIGHT = 170
/** The height of one account in the list. */
const PICKER_ROW_HEIGHT = 56
/** The picker grows for at most this many accounts. More accounts scroll. */
const PICKER_MAX_ROWS = 6

interface OpenPicker {
  window: BrowserWindow
  info: MailtoPickerInfo
  handler: AccountPickerHandler
}

export class AccountPicker {
  private open: OpenPicker | null = null

  constructor(private readonly accounts: Accounts) {
    accounts.subscribe((state) => {
      const window = this.open?.window
      if (window && !window.isDestroyed()) window.webContents.send(IpcChannel.stateChanged, state)
    })
  }

  /**
   * Show the account picker in front of the main window. If it is open already, it shows
   * the new link, and the handler of the old link never runs.
   */
  show(parent: BrowserWindow | null, info: MailtoPickerInfo, handler: AccountPickerHandler): void {
    const open = this.open
    if (open && !open.window.isDestroyed()) {
      open.info = info
      open.handler = handler
      open.window.webContents.send(IpcChannel.mailtoPickerChanged, info)
      open.window.show()
      open.window.focus()
      return
    }

    const rows = Math.min(Math.max(this.accounts.state().accounts.length, 1), PICKER_MAX_ROWS)
    const width = PICKER_WIDTH
    const height = PICKER_FRAME_HEIGHT + rows * PICKER_ROW_HEIGHT
    const hasParent = parent !== null && !parent.isDestroyed()
    const window = new BrowserWindow({
      title: 'New message',
      backgroundColor: baseBackgroundColor(),
      width,
      height,
      useContentSize: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      autoHideMenuBar: true,
      ...(hasParent ? { parent, ...centerOver(parent, width, height) } : { center: true }),
      ...(process.platform !== 'darwin' ? { icon } : {}),
      webPreferences: shiftedScreenWebPreferences()
    })
    lockShiftedScreen(window.webContents)
    followBaseBackground(window)
    const picker: OpenPicker = { window, info, handler }
    this.open = picker

    window.on('page-title-updated', (event) => {
      event.preventDefault()
    })
    window.once('ready-to-show', () => {
      window.show()
      window.focus()
    })
    window.on('closed', () => this.finish(picker, null))
    loadShiftedScreen(window.webContents, MAILTO_PICKER_HASH)
  }

  /** True when the web contents is the React screen of the open account picker. */
  isScreen(contents: WebContents): boolean {
    const window = this.open?.window
    return window !== undefined && !window.isDestroyed() && window.webContents === contents
  }

  /** What the open account picker shows. */
  info(): MailtoPickerInfo {
    return this.open ? { ...this.open.info } : { heading: '', selectedAccountId: null }
  }

  /** The person chose an account. */
  choose(accountId: string, always: boolean): void {
    if (this.open) this.finish(this.open, { accountId, always })
  }

  /** The person closed the account picker. No new message opens. */
  cancel(): void {
    if (this.open) this.finish(this.open, null)
  }

  private finish(picker: OpenPicker, choice: AccountPickerChoice | null): void {
    if (this.open !== picker) return
    this.open = null
    if (!picker.window.isDestroyed()) picker.window.close()
    picker.handler(choice)
  }
}

/** The position that puts a window of this size in the middle of the parent window. */
function centerOver(
  parent: BrowserWindow,
  width: number,
  height: number
): { x: number; y: number } {
  const bounds = parent.getBounds()
  return {
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + Math.max(0, (bounds.height - height) / 3))
  }
}
