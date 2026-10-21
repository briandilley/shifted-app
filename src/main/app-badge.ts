/**
 * The app badge: the sum of the unread counts of all accounts, on the app icon.
 *
 * - macOS: the Dock badge (`app.dock.setBadge`), with the number, or nothing for 0.
 * - Windows: an overlay on the taskbar icon of the main window, drawn in code.
 * - Linux: the launcher badge (`app.setBadgeCount`), on desktops that support one.
 */
import { app, nativeImage, type BrowserWindow } from 'electron'
import { unreadBadgeText } from '../shared/api'
import { drawBadgeBitmap } from './badge-image'
import { testRecords } from './test-hooks'

export class AppBadge {
  private total = 0
  private window: BrowserWindow | null = null

  /** Show the badge on the taskbar icon of this window (Windows). Call it for each new main window. */
  attachWindow(window: BrowserWindow): void {
    this.window = window
    window.on('closed', () => {
      if (this.window === window) this.window = null
    })
    this.apply()
  }

  /** Show this total. Shifted changes the badge only when the total changes. */
  update(total: number): void {
    if (total === this.total) return
    this.total = total
    const records = testRecords()
    if (records) records.appBadgeTotal = total
    this.apply()
  }

  private apply(): void {
    const total = this.total
    if (process.platform === 'darwin') {
      app.dock?.setBadge(total > 0 ? String(total) : '')
    } else if (process.platform === 'win32') {
      const window = this.window
      if (!window || window.isDestroyed()) return
      if (total <= 0) {
        window.setOverlayIcon(null, '')
        return
      }
      const bitmap = drawBadgeBitmap(unreadBadgeText(total))
      const image = nativeImage.createFromBitmap(bitmap.pixels, {
        width: bitmap.width,
        height: bitmap.height,
        scaleFactor: 2
      })
      window.setOverlayIcon(image, `${total} unread`)
    } else {
      // Linux: works only on desktops that support a launcher badge.
      app.setBadgeCount(total)
    }
  }
}
