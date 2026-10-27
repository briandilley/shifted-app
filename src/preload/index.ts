import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannel,
  type FindResult,
  type BackgroundLoading,
  type ExportFileResult,
  type GoogleApp,
  type ImportReadResult,
  type MailtoPickerInfo,
  type MemoryUse,
  type NotificationKind,
  type QuietHours,
  type ScreenPickerInfo,
  type SettingsRequest,
  type ShiftedApi,
  type ShiftedState,
  type UnreadCountSource,
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
  findInPage: (text: string, direction?: 'next' | 'previous') =>
    ipcRenderer.send(IpcChannel.findInPage, text, direction),
  closeFind: () => ipcRenderer.send(IpcChannel.closeFind),
  onFindResult: (listener: (result: FindResult) => void) => listen(IpcChannel.findResult, listener),
  onFocusFind: (listener: () => void) => listen(IpcChannel.focusFind, listener),
  platform: process.platform,
  getState: () => ipcRenderer.invoke(IpcChannel.getState) as Promise<ShiftedState>,
  onStateChanged: (listener: (state: ShiftedState) => void) =>
    listen(IpcChannel.stateChanged, listener),
  addAccount: () => ipcRenderer.send(IpcChannel.addAccount),
  selectAccount: (accountId: string) => ipcRenderer.send(IpcChannel.selectAccount, accountId),
  selectGoogleApp: (googleApp: GoogleApp) =>
    ipcRenderer.send(IpcChannel.selectGoogleApp, googleApp),
  reloadGoogleApp: () => ipcRenderer.send(IpcChannel.reloadGoogleApp),
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
    listen(IpcChannel.showSettingsPage, listener),
  setAskWhereToSave: (value: boolean) => ipcRenderer.send(IpcChannel.setAskWhereToSave, value),
  setBackgroundLoading: (value: BackgroundLoading) =>
    ipcRenderer.send(IpcChannel.setBackgroundLoading, value),
  setOpenAtLogin: (value: boolean) => ipcRenderer.send(IpcChannel.setOpenAtLogin, value),
  resetPagePermissions: (accountId: string) =>
    ipcRenderer.send(IpcChannel.resetPagePermissions, accountId),
  setUnreadCountSource: (accountId: string, source: UnreadCountSource) =>
    ipcRenderer.send(IpcChannel.setUnreadCountSource, accountId, source),
  setNotificationSwitch: (accountId: string, kind: NotificationKind, on: boolean) =>
    ipcRenderer.send(IpcChannel.setNotificationSwitch, accountId, kind, on),
  setQuietHours: (accountId: string, quietHours: QuietHours) =>
    ipcRenderer.send(IpcChannel.setQuietHours, accountId, quietHours),
  stopSnooze: () => ipcRenderer.send(IpcChannel.stopSnooze),
  getScreenSources: () =>
    ipcRenderer.invoke(IpcChannel.getScreenSources) as Promise<ScreenPickerInfo>,
  chooseScreenSource: (sourceId: string | null) =>
    ipcRenderer.send(IpcChannel.chooseScreenSource, sourceId),
  clearMailtoDefault: () => ipcRenderer.send(IpcChannel.clearMailtoDefault),
  isDefaultEmailApp: () => ipcRenderer.invoke(IpcChannel.isDefaultEmailApp) as Promise<boolean>,
  makeDefaultEmailApp: () => ipcRenderer.invoke(IpcChannel.makeDefaultEmailApp) as Promise<boolean>,
  getMailtoPicker: () =>
    ipcRenderer.invoke(IpcChannel.getMailtoPicker) as Promise<MailtoPickerInfo>,
  onMailtoPickerChanged: (listener: (info: MailtoPickerInfo) => void) =>
    listen(IpcChannel.mailtoPickerChanged, listener),
  chooseMailtoAccount: (accountId: string, always: boolean) =>
    ipcRenderer.send(IpcChannel.chooseMailtoAccount, accountId, always),
  cancelMailtoPicker: () => ipcRenderer.send(IpcChannel.cancelMailtoPicker),
  exportConfiguration: () =>
    ipcRenderer.invoke(IpcChannel.exportConfiguration) as Promise<ExportFileResult>,
  emailConfiguration: () => ipcRenderer.send(IpcChannel.emailConfiguration),
  openImportWindow: () => ipcRenderer.send(IpcChannel.openImportWindow),
  chooseImportFile: () =>
    ipcRenderer.invoke(IpcChannel.chooseImportFile) as Promise<ImportReadResult>,
  readImportText: (text: string) =>
    ipcRenderer.invoke(IpcChannel.readImportText, text) as Promise<ImportReadResult>,
  confirmImport: () => ipcRenderer.send(IpcChannel.confirmImport),
  cancelImport: () => ipcRenderer.send(IpcChannel.cancelImport),
  getMemoryUse: () => ipcRenderer.invoke(IpcChannel.getMemoryUse) as Promise<MemoryUse>
})

contextBridge.exposeInMainWorld('shifted', shifted)
