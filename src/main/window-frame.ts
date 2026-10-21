/**
 * The window frame and the backdrop color of the windows of Shifted. See "Window frame on
 * each platform" and "How to build it in Electron" in `docs/spec/DESIGN.md`.
 *
 * The background color of each window is its backdrop, so that no white flash shows
 * before the React page draws. Shifted follows the light or dark mode of the operating
 * system: `nativeTheme.themeSource` stays at `system`.
 */
import { nativeTheme, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { accountBackdrop, THEME_TOKENS, type ColorMode } from '../shared/account-colors'
import type { ShiftedState } from '../shared/api'

/** The height of the top row of the main window, in points. It is the drag region. */
export const TOP_ROW_HEIGHT = 40

/** The corner radius of each Google view, in points: the radius of the content area. */
export const GOOGLE_VIEW_RADIUS = 12

/** The minimum size of the main window, in points. */
export const MAIN_WINDOW_MIN_SIZE = { width: 900, height: 600 } as const

/** The light or dark mode of the operating system now. */
export function colorMode(): ColorMode {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

/** The color of the selected account, or `null` when the main window shows no account. */
export function selectedAccountColor(state: ShiftedState): string | null {
  return state.accounts.find((account) => account.id === state.selectedAccountId)?.color ?? null
}

/** The backdrop of the main window for this state, in the mode of the operating system. */
export function mainWindowBackdrop(state: ShiftedState): string {
  return accountBackdrop(selectedAccountColor(state), colorMode())
}

/** The window buttons of Windows and Linux, on the backdrop of the top row. */
function titleBarOverlay(backdrop: string): Electron.TitleBarOverlay {
  return { color: backdrop, symbolColor: THEME_TOKENS[colorMode()].text, height: TOP_ROW_HEIGHT }
}

/**
 * The frame of the main window. On macOS, the traffic lights sit on the backdrop above the
 * sidebar. On Windows and Linux, the window buttons are an overlay on the top row.
 */
export function mainWindowFrameOptions(backdrop: string): BrowserWindowConstructorOptions {
  const common: BrowserWindowConstructorOptions = {
    minWidth: MAIN_WINDOW_MIN_SIZE.width,
    minHeight: MAIN_WINDOW_MIN_SIZE.height,
    backgroundColor: backdrop
  }
  if (process.platform === 'darwin') {
    return { ...common, titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 } }
  }
  return { ...common, titleBarStyle: 'hidden', titleBarOverlay: titleBarOverlay(backdrop) }
}

/**
 * Keep the background color of the main window, and the window buttons of Windows and
 * Linux, on the backdrop of the selected account. Call `update` after each change of the
 * state. A change of the mode of the operating system updates the window by itself.
 */
export class MainWindowBackdrop {
  private backdrop: string
  private mode: ColorMode

  constructor(
    private readonly window: BrowserWindow,
    private readonly state: () => ShiftedState
  ) {
    this.backdrop = mainWindowBackdrop(state())
    this.mode = colorMode()
    const onThemeUpdated = (): void => this.update()
    nativeTheme.on('updated', onThemeUpdated)
    window.on('closed', () => {
      nativeTheme.removeListener('updated', onThemeUpdated)
    })
  }

  /** Apply the backdrop of the selected account, if the backdrop or the mode changed. */
  update(): void {
    if (this.window.isDestroyed()) return
    const backdrop = mainWindowBackdrop(this.state())
    const mode = colorMode()
    if (backdrop === this.backdrop && mode === this.mode) return
    this.backdrop = backdrop
    this.mode = mode
    this.window.setBackgroundColor(backdrop)
    if (process.platform !== 'darwin') this.window.setTitleBarOverlay(titleBarOverlay(backdrop))
  }
}

/**
 * Keep the background color of another window of Shifted on `--base`, in the mode of the
 * operating system. These windows keep the frame of the operating system.
 */
export function followBaseBackground(window: BrowserWindow): void {
  const apply = (): void => {
    if (!window.isDestroyed()) window.setBackgroundColor(THEME_TOKENS[colorMode()].base)
  }
  nativeTheme.on('updated', apply)
  window.on('closed', () => {
    nativeTheme.removeListener('updated', apply)
  })
}

/** The background color of a new window that is not the main window: `--base`. */
export function baseBackgroundColor(): string {
  return THEME_TOKENS[colorMode()].base
}
