/**
 * The IPC handlers for the screens of Shifted. Only the screens of Shifted can call
 * them. Google's pages have no preload script, so they cannot call them.
 */
import { ipcMain } from 'electron'
import { IpcChannel, type ViewBounds } from '../shared/api'
import type { Accounts } from './accounts'
import { isAccountId } from './config'

function parseBounds(value: unknown): ViewBounds | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const numbers = ['x', 'y', 'width', 'height'].map((key) => record[key])
  if (!numbers.every((number) => typeof number === 'number' && Number.isFinite(number))) {
    return undefined
  }
  const [x, y, width, height] = (numbers as number[]).map((number) =>
    Math.max(0, Math.round(number))
  )
  return { x: x ?? 0, y: y ?? 0, width: width ?? 0, height: height ?? 0 }
}

export function registerIpc(accounts: Accounts): void {
  ipcMain.handle(IpcChannel.getState, (event) => {
    if (!accounts.isMainScreen(event.sender)) throw new Error('Not a screen of Shifted.')
    return accounts.state()
  })

  ipcMain.on(IpcChannel.addAccount, (event) => {
    if (!accounts.isMainScreen(event.sender)) return
    accounts.addAccount()
  })

  ipcMain.on(IpcChannel.removeAccount, (event, accountId: unknown) => {
    if (!accounts.isMainScreen(event.sender) || !isAccountId(accountId)) return
    accounts.confirmAndRemove(accountId).catch((error: unknown) => {
      console.error('Shifted could not remove the account:', error)
    })
  })

  ipcMain.on(IpcChannel.signInAgain, (event, accountId: unknown) => {
    if (!accounts.isMainScreen(event.sender) || !isAccountId(accountId)) return
    accounts.signInAgain(accountId)
  })

  ipcMain.on(IpcChannel.setViewBounds, (event, value: unknown) => {
    const bounds = parseBounds(value)
    if (!bounds) return
    if (!accounts.isMainScreen(event.sender) && !accounts.isSignInScreen(event.sender)) return
    accounts.setViewBounds(event.sender, bounds)
  })
}
