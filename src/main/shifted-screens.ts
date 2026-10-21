/**
 * Helpers for the screens of Shifted: the React pages in the main window and at the
 * top of the sign-in window. Google's pages do not use these helpers.
 */
import type { WebContents, WebPreferences } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

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

/** The screens of Shifted open no windows and never navigate away from their own page. */
export function lockShiftedScreen(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => {
    event.preventDefault()
  })
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
