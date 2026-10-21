/**
 * The tray icon of Windows and Linux. See "Running in the background" in
 * `docs/spec/PRODUCT.md`.
 *
 * The icon is the app icon with the total unread count, drawn in code. A click on the
 * icon shows the main window. The menu of the icon has Show, Snooze, and Quit.
 *
 * On Linux, the tray needs a desktop that supports status icons. Shifted asks the session
 * bus for the StatusNotifierItem host, `org.kde.StatusNotifierWatcher`. If it is not
 * there, Shifted makes no tray, and closing the main window quits Shifted.
 */
import { Menu, nativeImage, Tray, type NativeImage } from 'electron'
import { execFileSync } from 'node:child_process'
import icon from '../../resources/icon.png?asset'
import { unreadBadgeText, type Snooze } from '../shared/api'
import { snoozeMenuTemplate, type SnoozeMenuActions } from './app-menu'
import { drawTrayIconBitmap } from './badge-image'

/** The size of the tray icon image in pixels. Shifted shows it at 16 by 16 points. */
const TRAY_ICON_PIXELS = 32

/** The names of the items of the tray menu. */
export const TRAY_MENU_LABELS = { show: 'Show', snooze: 'Snooze', quit: 'Quit' } as const

export interface TrayActions extends SnoozeMenuActions {
  /** Show the main window and bring it to the front. */
  show(): void
  quit(): void
}

/** True when the desktop of this Linux session shows status icons. */
function linuxHasStatusIcons(): boolean {
  try {
    const answer = execFileSync(
      'gdbus',
      [
        'call',
        '--session',
        '--dest',
        'org.freedesktop.DBus',
        '--object-path',
        '/org/freedesktop/DBus',
        '--method',
        'org.freedesktop.DBus.NameHasOwner',
        'org.kde.StatusNotifierWatcher'
      ],
      { encoding: 'utf8', timeout: 2_000, stdio: ['ignore', 'pipe', 'ignore'] }
    )
    return answer.includes('true')
  } catch {
    return false
  }
}

/**
 * True when Shifted makes a tray icon: always on Windows, on Linux only on a desktop that
 * shows status icons, and never on macOS, which has the Dock.
 */
export function isTrayAvailable(): boolean {
  if (process.platform === 'win32') return true
  if (process.platform === 'linux') return linuxHasStatusIcons()
  return false
}

export class ShiftedTray {
  private readonly tray: Tray
  private readonly appIcon: NativeImage
  private total = 0
  private snooze: Snooze | null

  constructor(
    private readonly actions: TrayActions,
    snooze: Snooze | null
  ) {
    this.snooze = snooze
    this.appIcon = nativeImage
      .createFromPath(icon)
      .resize({ width: TRAY_ICON_PIXELS, height: TRAY_ICON_PIXELS, quality: 'best' })
    this.tray = new Tray(this.image())
    this.tray.setToolTip('Shifted')
    this.tray.on('click', () => actions.show())
    this.updateMenu()
  }

  /** Show this total unread count on the icon. */
  setTotal(total: number): void {
    if (total === this.total) return
    this.total = total
    this.tray.setImage(this.image())
    this.tray.setToolTip(total > 0 ? `Shifted: ${total} unread` : 'Shifted')
  }

  /** Show this snooze state in the Snooze submenu. */
  setSnooze(snooze: Snooze | null): void {
    this.snooze = snooze
    this.updateMenu()
  }

  destroy(): void {
    if (!this.tray.isDestroyed()) this.tray.destroy()
  }

  private updateMenu(): void {
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: TRAY_MENU_LABELS.show, click: () => this.actions.show() },
        {
          label: TRAY_MENU_LABELS.snooze,
          submenu: snoozeMenuTemplate(this.actions, this.snooze)
        },
        { type: 'separator' },
        { label: TRAY_MENU_LABELS.quit, click: () => this.actions.quit() }
      ])
    )
  }

  /** The app icon with the total unread count. */
  private image(): NativeImage {
    const size = this.appIcon.getSize()
    const bitmap = drawTrayIconBitmap(
      { width: size.width, height: size.height, pixels: this.appIcon.toBitmap() },
      unreadBadgeText(this.total)
    )
    return nativeImage.createFromBitmap(bitmap.pixels, {
      width: bitmap.width,
      height: bitmap.height,
      scaleFactor: 2
    })
  }
}
