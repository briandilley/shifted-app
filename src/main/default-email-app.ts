/**
 * "Make Shifted the default email app": Shifted as the handler of `mailto:` links of the
 * computer. See "mailto: links" in `docs/spec/PRODUCT.md`.
 *
 * In test mode, Shifted never changes the default email app of the computer. It only
 * counts the request (see `test-hooks.ts`).
 */
import { app, shell } from 'electron'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { testRecords } from './test-hooks'

const PROTOCOL = 'mailto'

/** The Windows "Default apps" page, where the person chooses Shifted. */
const WINDOWS_DEFAULT_APPS = 'ms-settings:defaultapps'

/** The desktop file of Shifted on Linux. electron-builder names it after the executable. */
function linuxDesktopFile(): string {
  return process.env['CHROME_DESKTOP']?.trim() || 'shifted.desktop'
}

/**
 * The command that the operating system runs for a link. In development, Electron's own
 * executable runs Shifted with the app folder as its argument, so the folder must be part
 * of the command. A built Shifted needs no arguments.
 */
function developmentCommand(): { path: string; args: string[] } | undefined {
  const appFolder = process.argv[1]
  if (!process.defaultApp || !appFolder) return undefined
  return { path: process.execPath, args: [resolve(appFolder)] }
}

function isProtocolClient(): boolean {
  const command = developmentCommand()
  return command
    ? app.isDefaultProtocolClient(PROTOCOL, command.path, command.args)
    : app.isDefaultProtocolClient(PROTOCOL)
}

function setProtocolClient(): boolean {
  const command = developmentCommand()
  return command
    ? app.setAsDefaultProtocolClient(PROTOCOL, command.path, command.args)
    : app.setAsDefaultProtocolClient(PROTOCOL)
}

/** True when Shifted is the default email app of the computer now. */
export function isDefaultEmailApp(): boolean {
  const records = testRecords()
  if (records) return records.makeDefaultEmailApp > 0
  return isProtocolClient()
}

/** Run `xdg-settings set default-url-scheme-handler mailto <desktop file>` on Linux. */
function setWithXdgSettings(): Promise<void> {
  return new Promise((done) => {
    execFile(
      'xdg-settings',
      ['set', 'default-url-scheme-handler', PROTOCOL, linuxDesktopFile()],
      { timeout: 10_000 },
      (error) => {
        if (error) console.error('Shifted could not run xdg-settings:', error)
        done()
      }
    )
  })
}

/**
 * Make Shifted the default email app.
 *
 * - macOS: `app.setAsDefaultProtocolClient('mailto')`.
 * - Linux: the same. If Shifted is still not the default after it, `xdg-settings` with the
 *   desktop file of Shifted.
 * - Windows: register the protocol, then open the Windows "Default apps" page, because
 *   Windows does not let an app make itself the default. The person chooses Shifted there.
 *
 * @returns True when Shifted is the default email app after the change.
 */
export async function makeDefaultEmailApp(): Promise<boolean> {
  const records = testRecords()
  if (records) {
    records.makeDefaultEmailApp += 1
    return true
  }
  const registered = setProtocolClient()
  if (process.platform === 'linux' && (!registered || !isProtocolClient())) {
    await setWithXdgSettings()
  }
  if (process.platform === 'win32') {
    await shell.openExternal(WINDOWS_DEFAULT_APPS).catch((error: unknown) => {
      console.error('Shifted could not open the Default apps page of Windows:', error)
    })
  }
  return isProtocolClient()
}
