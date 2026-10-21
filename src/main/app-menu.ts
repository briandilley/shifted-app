/**
 * The application menu of Shifted. Its shortcuts of Shifted are Cmd+, (Ctrl+, on Windows
 * and Linux), which opens the configuration window, and Cmd+Shift+S (Ctrl+Shift+S), which
 * opens the snooze choices as a small menu. Prompt 07 adds the other shortcuts.
 */
import { Menu, type MenuItemConstructorOptions } from 'electron'
import { SNOOZE_CHOICE_NAMES, SNOOZE_CHOICES, type Snooze, type SnoozeChoice } from '../shared/api'

/** The id of the menu item that opens the configuration window. */
export const SETTINGS_MENU_ITEM_ID = 'settings'

/** The shortcut of the configuration window. */
export const SETTINGS_ACCELERATOR = 'CmdOrCtrl+,'

/** The id of the "Snooze" submenu. */
export const SNOOZE_MENU_ITEM_ID = 'snooze'

/** The id of the menu item that opens the snooze choices as a small menu. */
export const SNOOZE_CHOICES_MENU_ITEM_ID = 'snooze-choices'

/** The shortcut that opens the snooze choices. */
export const SNOOZE_ACCELERATOR = 'CmdOrCtrl+Shift+S'

/** The label of the item that stops the snooze. */
export const STOP_SNOOZE_LABEL = 'Stop snooze'

export interface SnoozeMenuActions {
  snooze(choice: SnoozeChoice): void
  stopSnooze(): void
}

export interface AppMenuActions extends SnoozeMenuActions {
  openSettings(): void
  /** Open the snooze choices as a small menu. */
  showSnoozeChoices(): void
}

/** The time of day of a snooze end, for example "14:30", or with the day if it is not today. */
export function snoozeEndText(until: number, now: Date = new Date()): string {
  const end = new Date(until)
  const time = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (end.toDateString() === now.toDateString()) return time
  return `${end.toLocaleDateString([], { weekday: 'long' })} ${time}`
}

/** The line that says whether a snooze runs, for example "Snoozed until 14:30". */
export function snoozeStateText(snooze: Snooze | null, now: Date = new Date()): string {
  if (!snooze) return 'Notifications are on'
  if (snooze.until === null) return 'Snoozed until you turn it off'
  return `Snoozed until ${snoozeEndText(snooze.until, now)}`
}

/**
 * The snooze choices and "Stop snooze". The "Snooze" submenu of the app menu and the
 * small menu of Cmd+Shift+S use the same items.
 */
export function snoozeMenuTemplate(
  actions: SnoozeMenuActions,
  snooze: Snooze | null
): MenuItemConstructorOptions[] {
  return [
    { label: snoozeStateText(snooze), enabled: false },
    { type: 'separator' },
    ...SNOOZE_CHOICES.map((choice): MenuItemConstructorOptions => ({
      id: `snooze-${choice}`,
      label: SNOOZE_CHOICE_NAMES[choice],
      click: () => actions.snooze(choice)
    })),
    { type: 'separator' },
    {
      id: 'stop-snooze',
      label: STOP_SNOOZE_LABEL,
      enabled: snooze !== null,
      click: () => actions.stopSnooze()
    }
  ]
}

export function appMenuTemplate(
  actions: AppMenuActions,
  snooze: Snooze | null,
  platform: NodeJS.Platform = process.platform
): MenuItemConstructorOptions[] {
  const settings: MenuItemConstructorOptions = {
    id: SETTINGS_MENU_ITEM_ID,
    label: platform === 'darwin' ? 'Settings…' : 'Settings',
    accelerator: SETTINGS_ACCELERATOR,
    click: () => actions.openSettings()
  }
  const snoozeItems: MenuItemConstructorOptions[] = [
    {
      id: SNOOZE_MENU_ITEM_ID,
      label: 'Snooze',
      submenu: snoozeMenuTemplate(actions, snooze)
    },
    {
      id: SNOOZE_CHOICES_MENU_ITEM_ID,
      label: 'Snooze Notifications…',
      accelerator: SNOOZE_ACCELERATOR,
      click: () => actions.showSnoozeChoices()
    }
  ]
  // The Edit menu gives copy, paste, and undo to the Google apps on macOS.
  const edit: MenuItemConstructorOptions = { role: 'editMenu' }
  const view: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }
  const windowMenu: MenuItemConstructorOptions = { role: 'windowMenu' }

  if (platform === 'darwin') {
    return [
      {
        label: 'Shifted',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          settings,
          { type: 'separator' },
          ...snoozeItems,
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      edit,
      view,
      windowMenu
    ]
  }
  return [
    {
      label: 'File',
      submenu: [
        settings,
        { type: 'separator' },
        ...snoozeItems,
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    edit,
    view,
    windowMenu
  ]
}

/** Set the application menu of Shifted. Call it again when the snooze changes. */
export function setAppMenu(actions: AppMenuActions, snooze: Snooze | null): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(actions, snooze)))
}

/** The small menu of the snooze choices that Cmd+Shift+S opens. */
export function buildSnoozeMenu(actions: SnoozeMenuActions, snooze: Snooze | null): Menu {
  return Menu.buildFromTemplate(snoozeMenuTemplate(actions, snooze))
}
