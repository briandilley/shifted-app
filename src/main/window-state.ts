/**
 * The size and position of the main window. See "Running in the background" in
 * `docs/spec/PRODUCT.md`.
 *
 * Shifted saves them in `window-state.json` in its user data folder, a short time after
 * the last change. At startup, it puts the main window back. If the saved position is off
 * every screen, it centers the window on the main screen.
 *
 * Only `WindowStateKeeper` needs Electron, so that unit tests can check the rules.
 */
import type { BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const WINDOW_STATE_FILE_NAME = 'window-state.json'

/** The wait after the last change of the size or the position before Shifted saves them. */
export const SAVE_DELAY_MS = 500

/**
 * The smallest part of the window, in points, that must be on a screen. Then the person
 * can still see it and drag it.
 */
export const MIN_VISIBLE = { width: 100, height: 40 } as const

export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

/** The saved size and position of the main window. */
export interface WindowState {
  /** The bounds of the window when it is not maximized. */
  bounds: Rectangle
  maximized: boolean
}

function isRectangle(value: unknown): value is Rectangle {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every(
    (key) => typeof record[key] === 'number' && Number.isFinite(record[key])
  )
}

/** Read a saved window state. `undefined` if the value is not a valid window state. */
export function parseWindowState(value: unknown): WindowState | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { bounds, maximized } = value as Record<string, unknown>
  if (!isRectangle(bounds) || bounds.width <= 0 || bounds.height <= 0) return undefined
  return { bounds: { ...bounds }, maximized: maximized === true }
}

/** The part of two rectangles that they share, or `undefined` if they do not overlap. */
function intersection(a: Rectangle, b: Rectangle): Rectangle | undefined {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= x || bottom <= y) return undefined
  return { x, y, width: right - x, height: bottom - y }
}

/** True when enough of the window is on one of the screens (`MIN_VISIBLE`). */
export function isOnScreen(bounds: Rectangle, workAreas: readonly Rectangle[]): boolean {
  return workAreas.some((area) => {
    const part = intersection(bounds, area)
    return (
      part !== undefined && part.width >= MIN_VISIBLE.width && part.height >= MIN_VISIBLE.height
    )
  })
}

/**
 * The bounds of the main window at startup.
 *
 * @param saved The saved bounds, or `undefined`.
 * @param workAreas The work areas of all screens.
 * @param primary The work area of the main screen.
 * @param size The size of a new window, and the minimum size.
 * @returns The saved bounds if they are on a screen. Otherwise the saved size (or the
 *   default size), no larger than the main screen, centered on the main screen.
 */
export function restoredBounds(
  saved: Rectangle | undefined,
  workAreas: readonly Rectangle[],
  primary: Rectangle,
  size: { width: number; height: number; minWidth: number; minHeight: number }
): Rectangle {
  if (saved && isOnScreen(saved, workAreas)) return { ...saved }
  const width = Math.max(size.minWidth, Math.min(saved?.width ?? size.width, primary.width))
  const height = Math.max(size.minHeight, Math.min(saved?.height ?? size.height, primary.height))
  return {
    x: Math.round(primary.x + (primary.width - width) / 2),
    y: Math.round(primary.y + (primary.height - height) / 2),
    width,
    height
  }
}

/** Reads and writes `window-state.json`, and saves the state of the main window. */
export class WindowStateKeeper {
  private timer: ReturnType<typeof setTimeout> | null = null
  /**
   * False until the window shows for the first time. A window that starts hidden is not
   * maximized yet, so saving it then would lose the saved "maximized".
   */
  private shown = false

  constructor(private readonly path: string) {}

  /** The saved state, or `undefined` if there is none or the file is broken. */
  load(): WindowState | undefined {
    try {
      return parseWindowState(JSON.parse(readFileSync(this.path, 'utf8')))
    } catch {
      return undefined
    }
  }

  /**
   * Save the size and the position of the window a short time after each change. Save at
   * once when the window closes or hides. Save nothing before the window first shows.
   */
  track(window: BrowserWindow): void {
    this.shown = window.isVisible()
    window.once('show', () => {
      this.shown = true
    })
    const later = (): void => {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        this.save(window)
      }, SAVE_DELAY_MS)
    }
    for (const event of ['resize', 'move', 'maximize', 'unmaximize'] as const) {
      window.on(event as 'resize', later)
    }
    const now = (): void => {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      this.save(window)
    }
    window.on('close', now)
    window.on('hide', now)
  }

  private save(window: BrowserWindow): void {
    if (!this.shown || window.isDestroyed() || window.isMinimized() || window.isFullScreen()) {
      return
    }
    const state: WindowState = { bounds: window.getNormalBounds(), maximized: window.isMaximized() }
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      const temporaryPath = `${this.path}.tmp`
      writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
      renameSync(temporaryPath, this.path)
    } catch (error) {
      console.error('Shifted could not save the size and position of the main window:', error)
    }
  }
}
