/**
 * The import window: a small Shifted window that reads an exported configuration from a
 * file or from the pasted text of the email, shows what will change, and applies it after
 * the person confirms. See "Move to another computer" in `docs/spec/PRODUCT.md`.
 *
 * Shifted has at most one import window. The configuration that it read stays in the main
 * process, so the screen only says "Import" or "Cancel".
 */
import { BrowserWindow, dialog, type WebContents } from 'electron'
import { open } from 'node:fs/promises'
import icon from '../../resources/icon.png?asset'
import { IMPORT_WINDOW_HASH, type ImportReadResult } from '../shared/api'
import type { Accounts } from './accounts'
import {
  MAX_IMPORT_BYTES,
  readExportedConfiguration,
  UNREADABLE_MESSAGE,
  type ExportedConfiguration,
  type ReadResult
} from './config-transfer'
import {
  loadShiftedScreen,
  lockShiftedScreen,
  shiftedScreenWebPreferences
} from './shifted-screens'
import { baseBackgroundColor, followBaseBackground } from './window-frame'

const IMPORT_WINDOW_WIDTH = 460
const IMPORT_WINDOW_HEIGHT = 520

/**
 * Read at most `MAX_IMPORT_BYTES + 1` bytes of the file, so that a larger file counts as
 * too large without reading all of it.
 */
async function readFileStart(path: string): Promise<Uint8Array> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(MAX_IMPORT_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) break
      length += bytesRead
    }
    return buffer.subarray(0, length)
  } finally {
    await handle.close()
  }
}

export class ImportWindow {
  private window: BrowserWindow | null = null
  /** The configuration that the window read last, until the person confirms or cancels. */
  private pending: ExportedConfiguration | null = null

  constructor(
    private readonly accounts: Accounts,
    /** Bring the main window to the front after an import, so that the accounts show. */
    private readonly showMainWindow: () => void
  ) {}

  /** Open the import window in front of `parent`, or bring the open one to the front. */
  open(parent: BrowserWindow | null): void {
    const current = this.window
    if (current && !current.isDestroyed()) {
      if (current.isMinimized()) current.restore()
      current.show()
      current.focus()
      return
    }
    const hasParent = parent !== null && !parent.isDestroyed()
    const window = new BrowserWindow({
      title: 'Import configuration',
      backgroundColor: baseBackgroundColor(),
      width: IMPORT_WINDOW_WIDTH,
      height: IMPORT_WINDOW_HEIGHT,
      useContentSize: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      autoHideMenuBar: true,
      ...(hasParent ? { parent, ...centerOver(parent) } : { center: true }),
      ...(process.platform !== 'darwin' ? { icon } : {}),
      webPreferences: shiftedScreenWebPreferences()
    })
    this.window = window
    this.pending = null
    lockShiftedScreen(window.webContents)
    followBaseBackground(window)
    window.on('page-title-updated', (event) => {
      event.preventDefault()
    })
    window.once('ready-to-show', () => {
      window.show()
      window.focus()
    })
    window.on('closed', () => {
      if (this.window !== window) return
      this.window = null
      this.pending = null
    })
    loadShiftedScreen(window.webContents, IMPORT_WINDOW_HASH)
  }

  /** True when the web contents is the React screen of the open import window. */
  isScreen(contents: WebContents): boolean {
    const window = this.window
    return window !== null && !window.isDestroyed() && window.webContents === contents
  }

  /** Let the person choose a file, read it, and say what an import of it changes. */
  async chooseFile(): Promise<ImportReadResult> {
    const window = this.window
    const options: Electron.OpenDialogOptions = {
      title: 'Import configuration',
      properties: ['openFile'],
      filters: [
        { name: 'Shifted configuration', extensions: ['json', 'txt', 'eml'] },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const { canceled, filePaths } =
      window && !window.isDestroyed()
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
    const [path] = filePaths
    if (canceled || !path) return { kind: 'canceled' }
    let bytes: Uint8Array
    try {
      bytes = await readFileStart(path)
    } catch (error) {
      console.error('Shifted could not read the configuration file:', error)
      return this.remember({ ok: false, message: UNREADABLE_MESSAGE })
    }
    return this.remember(readExportedConfiguration(bytes))
  }

  /** Read the pasted text, and say what an import of it changes. */
  readText(text: string): ImportReadResult {
    return this.remember(readExportedConfiguration(text))
  }

  /** Apply the configuration that the window read, then close the window. */
  confirm(): void {
    const pending = this.pending
    if (!pending) return
    this.pending = null
    this.accounts.importConfiguration(pending)
    this.close()
    this.showMainWindow()
  }

  /** Close the import window. Nothing changes. */
  close(): void {
    const window = this.window
    this.pending = null
    if (window && !window.isDestroyed()) window.close()
  }

  private remember(result: ReadResult): ImportReadResult {
    if (!result.ok) {
      this.pending = null
      return { kind: 'error', message: result.message }
    }
    this.pending = result.configuration
    return { kind: 'preview', preview: this.accounts.previewImport(result.configuration) }
  }
}

/** The position that puts the import window in the middle of the parent window. */
function centerOver(parent: BrowserWindow): { x: number; y: number } {
  const bounds = parent.getBounds()
  return {
    x: Math.round(bounds.x + (bounds.width - IMPORT_WINDOW_WIDTH) / 2),
    y: Math.round(bounds.y + Math.max(0, (bounds.height - IMPORT_WINDOW_HEIGHT) / 3))
  }
}
