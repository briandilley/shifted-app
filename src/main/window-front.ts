/**
 * Bring a window of Shifted to the front: restore it if it is minimized, show it, and
 * focus it.
 *
 * Whether the operating system really puts Shifted in front of the other apps depends on
 * the app that is in front now, so the end-to-end tests cannot check it with
 * `BrowserWindow.getFocusedWindow()`. In test mode, each request is recorded in
 * `shiftedTestRecords.windowsToFront` (the URL of the screen of the window).
 */
import type { BrowserWindow } from 'electron'
import { testRecords } from './test-hooks'

export function bringToFront(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  testRecords()?.windowsToFront.push(window.webContents.getURL())
}
