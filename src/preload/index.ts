import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel, type ShiftedApi, type ShiftedState, type ViewBounds } from '../shared/api'

/**
 * The functions that the screens of Shifted can call. Only the screens of Shifted use
 * this preload script. It never gives a page access to Node.js or to the file system.
 */
const shifted: ShiftedApi = Object.freeze({
  platform: process.platform,
  getState: () => ipcRenderer.invoke(IpcChannel.getState) as Promise<ShiftedState>,
  onStateChanged(listener: (state: ShiftedState) => void): () => void {
    const handler = (_event: IpcRendererEvent, state: ShiftedState): void => listener(state)
    ipcRenderer.on(IpcChannel.stateChanged, handler)
    return () => {
      ipcRenderer.removeListener(IpcChannel.stateChanged, handler)
    }
  },
  addAccount: () => ipcRenderer.send(IpcChannel.addAccount),
  removeAccount: (accountId: string) => ipcRenderer.send(IpcChannel.removeAccount, accountId),
  signInAgain: (accountId: string) => ipcRenderer.send(IpcChannel.signInAgain, accountId),
  setViewBounds: (bounds: ViewBounds) => ipcRenderer.send(IpcChannel.setViewBounds, bounds)
})

contextBridge.exposeInMainWorld('shifted', shifted)
