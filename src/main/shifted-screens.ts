/**
 * Helpers for the screens of Shifted: the React pages in the main window and at the
 * top of the sign-in window. Google's pages do not use these helpers.
 */
import type { WebContents, WebPreferences } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { CrashCounter, isCrash } from './page-problems'

/** The web preferences of every screen of Shifted. */
export function shiftedScreenWebPreferences(): WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false
  }
}

/** The crashes of the screens of Shifted, by the id of their web contents. */
const screenCrashes = new CrashCounter()

/**
 * The screens of Shifted open no windows and never navigate away from their own page. A
 * screen that crashed reloads on its own, at most 2 times in 5 minutes.
 */
export function lockShiftedScreen(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => {
    event.preventDefault()
  })
  const key = String(contents.id)
  contents.on('render-process-gone', (_event, details) => {
    if (contents.isDestroyed() || !isCrash(details.reason)) return
    if (screenCrashes.record(key) === 'reload') contents.reload()
  })
  contents.once('destroyed', () => screenCrashes.forget(key))
}

/**
 * Load the React page of Shifted.
 *
 * @param hash The screen to show, for example `sign-in`. No hash shows the main window.
 */
export function loadShiftedScreen(contents: WebContents, hash?: string): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && devServerUrl) {
    void contents.loadURL(hash ? `${devServerUrl}#${hash}` : devServerUrl)
  } else {
    void contents.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : {})
  }
}
