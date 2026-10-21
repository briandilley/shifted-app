/**
 * The handlers on the session of each account: page permissions, screen sharing, and
 * downloads. See "Page permissions" and "Downloads" in `docs/spec/PRODUCT.md`.
 */
import {
  BrowserWindow,
  desktopCapturer,
  dialog,
  webContents,
  type DesktopCapturerSource,
  type DownloadItem,
  type Session,
  type WebContents
} from 'electron'
import type { AskedPermission, PagePermissions, PermissionAnswer } from '../shared/api'
import { permissionCheck, permissionDecision, permissionQuestionWords } from './page-permissions'

export interface SessionHandlerDeps {
  /** The name of the account on screen, for example its address. */
  accountName(accountId: string): string
  /** The saved answers of the account. */
  pagePermissions(accountId: string): PagePermissions
  /** Save an answer of the person for the account. */
  savePagePermission(accountId: string, permission: AskedPermission, answer: PermissionAnswer): void
  /** The window for a dialog when the page has no window, for example the main window. */
  fallbackWindow(): BrowserWindow | null
  /** Show the screen picker of Shifted. */
  pickScreen(
    parent: BrowserWindow | null,
    accountName: string
  ): Promise<DesktopCapturerSource | null>
  /** Handle a download of the account that started in this web contents. */
  download(item: DownloadItem, contents: WebContents): void
}

const configured = new WeakSet<Session>()

/** True on Linux with Wayland, where the desktop portal shows its own screen picker. */
function isWayland(): boolean {
  return (
    process.platform === 'linux' &&
    (process.env['XDG_SESSION_TYPE'] === 'wayland' || Boolean(process.env['WAYLAND_DISPLAY']))
  )
}

/**
 * Set the handlers on the session of an account. Calling it again for the same session
 * does nothing.
 */
export function configureAccountSession(
  accountSession: Session,
  accountId: string,
  deps: SessionHandlerDeps
): void {
  if (configured.has(accountSession)) return
  configured.add(accountSession)

  /** The questions that wait for an answer, so that two requests show one dialog. */
  const questions = new Map<AskedPermission, Promise<boolean>>()

  const parentWindow = (contents: WebContents | null): BrowserWindow | null => {
    const window =
      contents && !contents.isDestroyed() ? BrowserWindow.fromWebContents(contents) : null
    return window ?? deps.fallbackWindow()
  }

  /** Ask the person once, save the answer for the account, and return it. */
  const ask = (permission: AskedPermission, contents: WebContents | null): Promise<boolean> => {
    const waiting = questions.get(permission)
    if (waiting) return waiting
    const name = deps.accountName(accountId)
    const words = permissionQuestionWords(permission)
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      title: 'Page permission',
      buttons: ['Allow', "Don't allow"],
      defaultId: 1,
      cancelId: 1,
      message: `Allow ${name} to ${words}?`,
      detail: `A page of ${name} asks to ${words}. Shifted remembers your answer for this account. To forget it, use "Reset page permissions" on the page of the account in Settings.`
    }
    const window = parentWindow(contents)
    const question = (
      window && !window.isDestroyed()
        ? dialog.showMessageBox(window, options)
        : dialog.showMessageBox(options)
    )
      .then(({ response }) => {
        const answer: PermissionAnswer = response === 0 ? 'allow' : 'deny'
        deps.savePagePermission(accountId, permission, answer)
        return answer === 'allow'
      })
      .catch((error: unknown) => {
        console.error('Shifted could not ask about a page permission:', error)
        return false
      })
      .finally(() => {
        questions.delete(permission)
      })
    questions.set(permission, question)
    return question
  }

  /** Allow, deny, or ask, as the rules of `page-permissions.ts` say. */
  const decide = (permission: string, contents: WebContents | null): Promise<boolean> => {
    const decision = permissionDecision(permission, deps.pagePermissions(accountId))
    if (decision === 'allow') return Promise.resolve(true)
    if (decision === 'deny') return Promise.resolve(false)
    return ask(permission as AskedPermission, contents)
  }

  accountSession.setPermissionRequestHandler((contents, permission, callback) => {
    void decide(permission, contents).then(callback)
  })

  accountSession.setPermissionCheckHandler((_contents, permission) =>
    permissionCheck(permission, deps.pagePermissions(accountId))
  )

  accountSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      const contents = (request.frame && webContents.fromFrame(request.frame)) || null
      const choose = async (): Promise<DesktopCapturerSource | null> => {
        // The permission request handler asks first. This check covers a request that
        // did not go through it.
        if (!(await decide('display-capture', contents))) return null
        if (isWayland()) {
          // The desktop portal shows its own picker and returns the one source chosen.
          const [source] = await desktopCapturer.getSources({ types: ['screen', 'window'] })
          return source ?? null
        }
        return deps.pickScreen(parentWindow(contents), deps.accountName(accountId))
      }
      choose()
        .then((source) => callback(source ? { video: source } : null))
        .catch((error: unknown) => {
          console.error('Shifted could not share the screen:', error)
          callback(null)
        })
    },
    // On macOS, the system picker shows. If it is not there (before macOS 15), Electron
    // calls the handler, and Shifted shows its own picker.
    { useSystemPicker: process.platform === 'darwin' }
  )

  accountSession.on('will-download', (_event, item, contents) => {
    deps.download(item, contents)
  })
}
