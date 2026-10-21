/**
 * The message for a page with a certificate error, in the windows that have no content
 * area: the sign-in window and the child windows. See "Failure states" in
 * `docs/spec/PRODUCT.md`. Shifted blocks the page in the `certificate-error` handler of
 * `index.ts`. The content area of the main window shows its own panel.
 */
import { BrowserWindow, dialog, type WebContents } from 'electron'
import { isCertificateError } from './page-problems'

/** The text of the message. */
export const CERTIFICATE_ERROR_MESSAGE = 'Shifted blocked this page. Its certificate is not valid.'

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Show the message when a page of this web contents fails with a certificate error. */
export function showCertificateErrors(contents: WebContents): void {
  contents.on('did-fail-load', (_event, errorCode, _description, url, isMainFrame) => {
    if (!isMainFrame || !isCertificateError(errorCode)) return
    const options: Electron.MessageBoxOptions = {
      type: 'error',
      title: 'Page blocked',
      message: CERTIFICATE_ERROR_MESSAGE,
      detail: `${hostOf(url)}: Shifted never skips a certificate error.`
    }
    const window = contents.isDestroyed() ? null : BrowserWindow.fromWebContents(contents)
    const shown =
      window && !window.isDestroyed()
        ? dialog.showMessageBox(window, options)
        : dialog.showMessageBox(options)
    shown.catch((error: unknown) => {
      console.error('Shifted could not show the certificate message:', error)
    })
  })
}
