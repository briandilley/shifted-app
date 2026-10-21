/**
 * "Open at login". See "Running in the background" in `docs/spec/PRODUCT.md`.
 *
 * - macOS and Windows: `app.setLoginItemSettings`.
 * - Linux: the desktop file `~/.config/autostart/shifted.desktop`.
 *
 * When Shifted opens at login, the main window starts hidden. On Windows and Linux, the
 * login item gives Shifted the argument `--opened-at-login`. On macOS, the login item
 * gives no argument, and `wasOpenedAtLogin` says it.
 *
 * In test mode, Shifted never changes the login items of the computer. It only records
 * the request (see `test-hooks.ts`).
 */
import { app } from 'electron'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { testRecords } from './test-hooks'

/** The argument that the login item gives to Shifted on Windows and Linux. */
export const OPENED_AT_LOGIN_ARG = '--opened-at-login'

/** The name of the desktop file in the autostart folder on Linux. */
export const AUTOSTART_FILE_NAME = 'shifted.desktop'

/**
 * Quote one argument of the `Exec` key of a desktop file, as the Desktop Entry
 * Specification says: an argument with a space or a reserved character goes in double
 * quotes, and `"`, `` ` ``, `$`, and `\` get a backslash.
 */
export function desktopExecArgument(argument: string): string {
  if (argument !== '' && !/[\s"'\\><~|&;$*?#()`]/.test(argument)) return argument
  return `"${argument.replace(/(["`$\\])/g, '\\$1')}"`
}

/** The text of the autostart desktop file on Linux that runs this command. */
export function linuxAutostartEntry(command: readonly string[]): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Shifted',
    'Comment=Shifted keeps several Gmail accounts in one window.',
    `Exec=${command.map(desktopExecArgument).join(' ')}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n')
}

/**
 * The command that starts Shifted. In development, Electron's own executable runs Shifted
 * with the app folder as its argument. An AppImage runs from a temporary folder, so the
 * command is the AppImage file itself.
 */
function startCommand(): string[] {
  const appFolder = process.argv[1]
  if (process.defaultApp && appFolder) return [process.execPath, resolve(appFolder)]
  return [process.env['APPIMAGE'] || process.execPath]
}

/** The path of the autostart desktop file on Linux. */
function linuxAutostartPath(): string {
  // `appData` is `$XDG_CONFIG_HOME` or `~/.config` on Linux.
  return join(app.getPath('appData'), 'autostart', AUTOSTART_FILE_NAME)
}

/** Turn "Open at login" on or off in the operating system. */
export function setOpenAtLogin(on: boolean): void {
  const records = testRecords()
  if (records) {
    records.openAtLogin.push(on)
    return
  }
  if (process.platform === 'linux') {
    const path = linuxAutostartPath()
    if (on) {
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, linuxAutostartEntry([...startCommand(), OPENED_AT_LOGIN_ARG]), 'utf8')
    } else {
      rmSync(path, { force: true })
    }
    return
  }
  if (process.platform === 'win32') {
    const [path = process.execPath, ...args] = startCommand()
    app.setLoginItemSettings({ openAtLogin: on, path, args: [...args, OPENED_AT_LOGIN_ARG] })
    return
  }
  app.setLoginItemSettings({ openAtLogin: on })
}

/** True when the operating system started Shifted at login. */
export function wasOpenedAtLogin(): boolean {
  if (process.argv.includes(OPENED_AT_LOGIN_ARG)) return true
  if (process.platform !== 'darwin' || testRecords()) return false
  return app.getLoginItemSettings().wasOpenedAtLogin === true
}
