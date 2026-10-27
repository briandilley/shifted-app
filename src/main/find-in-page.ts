import { BrowserWindow, ipcMain, WebContentsView, type WebContents } from 'electron'
import { FIND_SCREEN_HASH, IpcChannel } from '../shared/api'
import {
  loadShiftedScreen,
  lockShiftedScreen,
  shiftedScreenWebPreferences
} from './shifted-screens'

interface FindBar {
  window: BrowserWindow
  target: WebContents
  view: WebContentsView
  text: string
  requestId: number | null
  dispose(): void
}

/** A trusted Find bar above a Google page. Search text stays in memory. */
export class FindInPage {
  private readonly bars = new Map<BrowserWindow, FindBar>()

  constructor(private readonly targetFor: (window: BrowserWindow) => WebContents | undefined) {
    ipcMain.on(IpcChannel.findInPage, (event, text: unknown, direction: unknown) => {
      const bar = this.fromSender(event.sender)
      if (!bar || event.senderFrame !== event.sender.mainFrame) return
      if (typeof text !== 'string' || text.length > 4096) return
      if (direction !== undefined && direction !== 'next' && direction !== 'previous') return
      if (this.targetFor(bar.window) !== bar.target) {
        this.close(bar.window)
        return
      }
      const initial = text !== bar.text || direction === undefined
      bar.text = text
      if (initial) {
        bar.requestId = null
        bar.target.stopFindInPage('clearSelection')
      }
      if (!text) return
      bar.requestId = bar.target.findInPage(text, {
        forward: direction !== 'previous',
        findNext: initial,
        matchCase: false
      })
    })
    ipcMain.on(IpcChannel.closeFind, (event) => {
      const bar = this.fromSender(event.sender)
      if (bar && event.senderFrame === event.sender.mainFrame) this.close(bar.window, true)
    })
  }

  private fromSender(sender: WebContents): FindBar | undefined {
    return [...this.bars.values()].find((bar) => bar.view.webContents === sender)
  }

  /** Resolve the window from the key source, including its embedded views. */
  open(source?: WebContents): void {
    const window = source
      ? BrowserWindow.getAllWindows().find(
          (candidate) =>
            candidate.webContents === source ||
            candidate.contentView.children.some(
              (view) => view instanceof WebContentsView && view.webContents === source
            )
        )
      : BrowserWindow.getFocusedWindow()
    if (!window) return
    const target = this.targetFor(window)
    if (!target || target.isDestroyed()) return
    const existing = this.bars.get(window)
    if (existing?.target === target) {
      existing.view.webContents.focus()
      existing.view.webContents.send(IpcChannel.focusFind)
      return
    }
    this.close(window)
    const view = new WebContentsView({ webPreferences: shiftedScreenWebPreferences() })
    view.setBorderRadius(8)
    lockShiftedScreen(view.webContents)
    const bar: FindBar = { window, target, view, text: '', requestId: null, dispose: () => {} }
    this.bars.set(window, bar)
    const targetView = window.contentView.children.find(
      (child) => child instanceof WebContentsView && child.webContents === target
    )
    const layout = (): void => {
      const [width] = window.getContentSize()
      const bounds = targetView?.getBounds()
      const right = bounds ? bounds.x + bounds.width : width
      const barWidth = Math.min(440, bounds?.width ?? width)
      view.setBounds({
        x: Math.max(0, right - barWidth),
        y: bounds?.y ?? 0,
        width: barWidth,
        height: 56
      })
    }
    const found = (_event: Electron.Event, result: Electron.Result): void => {
      if (result.requestId !== bar.requestId || !result.finalUpdate) return
      view.webContents.send(IpcChannel.findResult, {
        text: bar.text,
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches
      })
    }
    const close = (): void => this.close(window)
    const navigation = (
      _event: Electron.Event,
      _url: string,
      _inPlace: boolean,
      mainFrame: boolean
    ): void => {
      if (mainFrame) close()
    }
    const escape = (event: Electron.Event, input: Electron.Input): void => {
      if (
        input.type === 'keyDown' &&
        input.key === 'Escape' &&
        !input.control &&
        !input.meta &&
        !input.alt &&
        !input.shift
      ) {
        event.preventDefault()
        this.close(window, true)
      }
    }
    target.on('found-in-page', found)
    target.on('did-start-navigation', navigation)
    target.on('render-process-gone', close)
    target.on('destroyed', close)
    target.on('before-input-event', escape)
    window.on('resize', layout)
    targetView?.on('bounds-changed', layout)
    window.on('hide', close)
    window.on('closed', close)
    view.webContents.on('render-process-gone', close)
    bar.dispose = () => {
      target.removeListener('found-in-page', found)
      target.removeListener('did-start-navigation', navigation)
      target.removeListener('render-process-gone', close)
      target.removeListener('destroyed', close)
      target.removeListener('before-input-event', escape)
      window.removeListener('resize', layout)
      targetView?.removeListener('bounds-changed', layout)
      window.removeListener('hide', close)
      window.removeListener('closed', close)
      view.webContents.removeListener('render-process-gone', close)
    }
    window.contentView.addChildView(view)
    layout()
    view.webContents.once('did-finish-load', () => {
      if (this.bars.get(window) === bar) view.webContents.focus()
    })
    loadShiftedScreen(view.webContents, FIND_SCREEN_HASH)
  }

  /** Account changes, sign-out, and hidden Google pages end their search. */
  refresh(): void {
    for (const [window, bar] of this.bars) {
      if (window.isDestroyed() || this.targetFor(window) !== bar.target) this.close(window)
    }
  }

  private close(window: BrowserWindow, focus = false): void {
    const bar = this.bars.get(window)
    if (!bar) return
    this.bars.delete(window)
    bar.dispose()
    if (!bar.target.isDestroyed()) {
      bar.target.stopFindInPage('clearSelection')
      if (focus && !window.isDestroyed()) bar.target.focus()
    }
    if (!window.isDestroyed()) window.contentView.removeChildView(bar.view)
    if (!bar.view.webContents.isDestroyed()) bar.view.webContents.close()
  }
}
