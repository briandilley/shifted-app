import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannel,
  type GoogleApp,
  type SettingsRequest,
  type ShiftedApi,
  type ShiftedState,
  type ViewBounds
} from '../shared/api'

/** Listen to one channel. Returns a function that stops the listener. */
function listen<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

/**
 * The functions that the screens of Shifted can call. Only the screens of Shifted use
 * this preload script. It never gives a page access to Node.js or to the file system.
 */
const shifted: ShiftedApi = Object.freeze({
  platform: process.platform,
  getState: () => ipcRenderer.invoke(IpcChannel.getState) as Promise<ShiftedState>,
  onStateChanged: (listener: (state: ShiftedState) => void) =>
    listen(IpcChannel.stateChanged, listener),
  addAccount: () => ipcRenderer.send(IpcChannel.addAccount),
  selectAccount: (accountId: string) => ipcRenderer.send(IpcChannel.selectAccount, accountId),
  selectGoogleApp: (googleApp: GoogleApp) =>
    ipcRenderer.send(IpcChannel.selectGoogleApp, googleApp),
  moveAccount: (accountId: string, toIndex: number) =>
    ipcRenderer.send(IpcChannel.moveAccount, accountId, toIndex),
  showAccountMenu: (accountId: string) => ipcRenderer.send(IpcChannel.showAccountMenu, accountId),
  removeAccount: (accountId: string) => ipcRenderer.send(IpcChannel.removeAccount, accountId),
  signOut: (accountId: string) => ipcRenderer.send(IpcChannel.signOut, accountId),
  signInAgain: (accountId: string) => ipcRenderer.send(IpcChannel.signInAgain, accountId),
  setNickname: (accountId: string, nickname: string) =>
    ipcRenderer.send(IpcChannel.setNickname, accountId, nickname),
  setColor: (accountId: string, color: string) =>
    ipcRenderer.send(IpcChannel.setColor, accountId, color),
  setViewBounds: (bounds: ViewBounds) => ipcRenderer.send(IpcChannel.setViewBounds, bounds),
  onShowSettingsPage: (listener: (request: SettingsRequest) => void) =>
    listen(IpcChannel.showSettingsPage, listener)
})

contextBridge.exposeInMainWorld('shifted', shifted)
