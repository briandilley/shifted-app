/**
 * The screen picker of Shifted: a small window that lists the screens and windows from
 * `desktopCapturer.getSources`, so that the person chooses what to share. Shifted uses it
 * on Windows and on Linux with X11. See "Page permissions" in `docs/spec/PRODUCT.md`.
 */
import {
  BrowserWindow,
  desktopCapturer,
  type DesktopCapturerSource,
  type WebContents
} from 'electron'
import icon from '../../resources/icon.png?asset'
import { SCREEN_PICKER_HASH, type ScreenPickerInfo } from '../shared/api'
import {
  loadShiftedScreen,
  lockShiftedScreen,
  shiftedScreenWebPreferences
} from './shifted-screens'

/** The size of the small pictures of the screens and windows, in pixels. */
const THUMBNAIL_SIZE = { width: 320, height: 200 }

interface OpenPicker {
  window: BrowserWindow
  accountName: string
  sources: DesktopCapturerSource[]
  finish(source: DesktopCapturerSource | null): void
}

export class ScreenPicker {
  private open: OpenPicker | null = null

  /**
   * Show the screen picker and wait for the choice of the person.
   *
   * @returns The screen or window to share, or `null` if the person shares nothing.
   */
  async pick(
    parent: BrowserWindow | null,
    accountName: string
  ): Promise<DesktopCapturerSource | null> {
    // One screen picker at a time. A second request shares nothing.
    if (this.open) {
      this.open.window.focus()
      return null
    }
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: THUMBNAIL_SIZE
    })
    if (this.open) return null

    return new Promise((resolve) => {
      const window = new BrowserWindow({
        title: 'Share your screen',
        width: 600,
        height: 520,
        minWidth: 400,
        minHeight: 320,
        show: false,
        autoHideMenuBar: true,
        ...(parent && !parent.isDestroyed() ? { parent } : {}),
        ...(process.platform !== 'darwin' ? { icon } : {}),
        webPreferences: shiftedScreenWebPreferences()
      })
      lockShiftedScreen(window.webContents)
      const open: OpenPicker = {
        window,
        accountName,
        sources,
        finish: (source) => {
          if (this.open !== open) return
          this.open = null
          if (!window.isDestroyed()) window.close()
          resolve(source)
        }
      }
      this.open = open
      window.on('page-title-updated', (event) => {
        event.preventDefault()
      })
      window.once('ready-to-show', () => {
        window.show()
      })
      window.on('closed', () => open.finish(null))
      loadShiftedScreen(window.webContents, SCREEN_PICKER_HASH)
    })
  }

  /** True when the web contents is the React screen of the open screen picker. */
  isScreen(contents: WebContents): boolean {
    const window = this.open?.window
    return window !== undefined && !window.isDestroyed() && window.webContents === contents
  }

  /** What the open screen picker shows. */
  info(): ScreenPickerInfo {
    const open = this.open
    if (!open) return { accountName: '', sources: [] }
    return {
      accountName: open.accountName,
      sources: open.sources.map((source) => ({
        id: source.id,
        name: source.name,
        kind: source.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL()
      }))
    }
  }

  /** The person chose a screen or window, or `null` to share nothing. */
  choose(sourceId: string | null): void {
    const open = this.open
    if (!open) return
    open.finish(open.sources.find((source) => source.id === sourceId) ?? null)
  }
}
