/**
 * The IPC handlers for the screens of Shifted. Only the screens of Shifted can call
 * them. Google's pages have no preload script, so they cannot call them.
 */
import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import {
  IpcChannel,
  isGoogleApp,
  isUnreadCountSource,
  type SettingsRequest,
  type ViewBounds
} from '../shared/api'
import { buildAccountMenu } from './account-menu'
import type { Accounts } from './accounts'
import { isAccountId } from './config'
import type { ScreenPicker } from './screen-picker'
import type { SettingsWindow } from './settings-window'

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

function logError(action: string): (error: unknown) => void {
  return (error) => {
    console.error(`Shifted could not ${action}:`, error)
  }
}

export function registerIpc(
  accounts: Accounts,
  settings: SettingsWindow,
  screenPicker: ScreenPicker
): void {
  const isMainScreen = (sender: WebContents): boolean => accounts.isMainScreen(sender)
  /** The main window or the configuration window. */
  const isShiftedScreen = (sender: WebContents): boolean =>
    accounts.isMainScreen(sender) || settings.isScreen(sender)

  const openSettings = (request: SettingsRequest): void => settings.open(request)
  const signOut = (accountId: string): void => {
    accounts.signOut(accountId).catch(logError('sign the account out'))
  }

  ipcMain.handle(IpcChannel.getState, (event) => {
    if (!isShiftedScreen(event.sender)) throw new Error('Not a screen of Shifted.')
    return accounts.state()
  })

  ipcMain.on(IpcChannel.addAccount, (event) => {
    if (!isMainScreen(event.sender)) return
    accounts.addAccount()
  })

  ipcMain.on(IpcChannel.selectAccount, (event, accountId: unknown) => {
    if (!isMainScreen(event.sender) || !isAccountId(accountId)) return
    accounts.selectAccount(accountId)
  })

  ipcMain.on(IpcChannel.selectGoogleApp, (event, googleApp: unknown) => {
    if (!isMainScreen(event.sender) || !isGoogleApp(googleApp)) return
    accounts.selectGoogleApp(googleApp)
  })

  ipcMain.on(IpcChannel.moveAccount, (event, accountId: unknown, toIndex: unknown) => {
    if (!isMainScreen(event.sender) || !isAccountId(accountId)) return
    if (typeof toIndex !== 'number' || !Number.isInteger(toIndex)) return
    accounts.moveAccount(accountId, toIndex)
  })

  ipcMain.on(IpcChannel.showAccountMenu, (event, accountId: unknown) => {
    if (!isMainScreen(event.sender) || !isAccountId(accountId)) return
    const account = accounts.account(accountId)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!account || !window) return
    const menu = buildAccountMenu(account, {
      openSettings,
      signOut,
      remove: (id) => {
        accounts.confirmAndRemove(id, window).catch(logError('remove the account'))
      }
    })
    menu.popup({ window })
  })

  ipcMain.on(IpcChannel.removeAccount, (event, accountId: unknown) => {
    if (!isShiftedScreen(event.sender) || !isAccountId(accountId)) return
    const window = BrowserWindow.fromWebContents(event.sender)
    accounts.confirmAndRemove(accountId, window).catch(logError('remove the account'))
  })

  ipcMain.on(IpcChannel.signOut, (event, accountId: unknown) => {
    if (!isShiftedScreen(event.sender) || !isAccountId(accountId)) return
    signOut(accountId)
  })

  ipcMain.on(IpcChannel.signInAgain, (event, accountId: unknown) => {
    if (!isMainScreen(event.sender) || !isAccountId(accountId)) return
    accounts.signInAgain(accountId)
  })

  ipcMain.on(IpcChannel.setNickname, (event, accountId: unknown, nickname: unknown) => {
    if (!isShiftedScreen(event.sender) || !isAccountId(accountId)) return
    if (typeof nickname !== 'string') return
    accounts.setNickname(accountId, nickname)
  })

  ipcMain.on(IpcChannel.setColor, (event, accountId: unknown, color: unknown) => {
    if (!isShiftedScreen(event.sender) || !isAccountId(accountId)) return
    if (typeof color !== 'string') return
    accounts.setColor(accountId, color)
  })

  ipcMain.on(IpcChannel.setViewBounds, (event, value: unknown) => {
    const bounds = parseBounds(value)
    if (!bounds) return
    if (!accounts.isMainScreen(event.sender) && !accounts.isSignInScreen(event.sender)) return
    accounts.setViewBounds(event.sender, bounds)
  })

  ipcMain.on(IpcChannel.setAskWhereToSave, (event, value: unknown) => {
    if (!isShiftedScreen(event.sender) || typeof value !== 'boolean') return
    accounts.setAskWhereToSave(value)
  })

  ipcMain.on(IpcChannel.resetPagePermissions, (event, accountId: unknown) => {
    if (!isShiftedScreen(event.sender) || !isAccountId(accountId)) return
    accounts.resetPagePermissions(accountId)
  })

  ipcMain.on(IpcChannel.setUnreadCountSource, (event, accountId: unknown, source: unknown) => {
    if (!isShiftedScreen(event.sender) || !isAccountId(accountId)) return
    if (!isUnreadCountSource(source)) return
    accounts.setUnreadCountSource(accountId, source)
  })

  ipcMain.handle(IpcChannel.getScreenSources, (event) => {
    if (!screenPicker.isScreen(event.sender)) throw new Error('Not the screen picker.')
    return screenPicker.info()
  })

  ipcMain.on(IpcChannel.chooseScreenSource, (event, sourceId: unknown) => {
    if (!screenPicker.isScreen(event.sender)) return
    if (sourceId !== null && typeof sourceId !== 'string') return
    screenPicker.choose(sourceId)
  })
}
