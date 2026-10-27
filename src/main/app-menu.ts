/**
 * The application menu of Shifted. It shows every shortcut of the shortcut table
 * (`shortcuts.ts`), so that the menu shows the keys. A click on a menu item, or its
 * shortcut when the app menu gets the keys, runs the same action as the shortcut.
 */
import { Menu, type MenuItemConstructorOptions } from 'electron'
import { SNOOZE_CHOICE_NAMES, SNOOZE_CHOICES, type Snooze, type SnoozeChoice } from '../shared/api'
import { NUMBERED_ACCOUNTS, shortcut, type ShortcutAction } from './shortcuts'

/** The id of the menu item that opens the configuration window. */
export const SETTINGS_MENU_ITEM_ID = 'settings'

/** The shortcut of the configuration window. */
export const SETTINGS_ACCELERATOR = shortcut(SETTINGS_MENU_ITEM_ID).accelerator

/** The id of the "Snooze" submenu. */
export const SNOOZE_MENU_ITEM_ID = 'snooze'

/** The id of the menu item that opens the snooze choices as a small menu. */
export const SNOOZE_CHOICES_MENU_ITEM_ID = 'snooze-choices'

/** The shortcut that opens the snooze choices. */
export const SNOOZE_ACCELERATOR = shortcut(SNOOZE_CHOICES_MENU_ITEM_ID).accelerator

/** The id of the item of the Help menu that opens the "Memory use" window. */
export const MEMORY_USE_MENU_ITEM_ID = 'memory-use'

/** The label of the item that stops the snooze. */
export const STOP_SNOOZE_LABEL = 'Stop snooze'

export interface SnoozeMenuActions {
  snooze(choice: SnoozeChoice): void
  stopSnooze(): void
}

export interface AppMenuActions extends SnoozeMenuActions {
  /** Run the action of a shortcut: Settings, Add account, the accounts, and so on. */
  runShortcut(action: ShortcutAction): void
  /** Open the "Memory use" window. */
  showMemoryUse(): void
}

/** A menu item that runs the action of a shortcut, with the keys of the shortcut. */
function shortcutItem(
  actions: AppMenuActions,
  id: string,
  label: string,
  enabled = true
): MenuItemConstructorOptions {
  const { action, accelerator } = shortcut(id)
  return { id, label, accelerator, enabled, click: () => actions.runShortcut(action) }
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

/**
 * The application menu.
 *
 * @param accountNames The names of the accounts, in the order of the sidebar. The
 *   Accounts menu has an item for each place from 1 to 9. A place with no account shows
 *   "Account N" and is off.
 */
export function appMenuTemplate(
  actions: AppMenuActions,
  snooze: Snooze | null,
  accountNames: readonly string[] = [],
  platform: NodeJS.Platform = process.platform
): MenuItemConstructorOptions[] {
  const settings = shortcutItem(
    actions,
    SETTINGS_MENU_ITEM_ID,
    platform === 'darwin' ? 'Settings…' : 'Settings'
  )
  const snoozeItems: MenuItemConstructorOptions[] = [
    {
      id: SNOOZE_MENU_ITEM_ID,
      label: 'Snooze',
      submenu: snoozeMenuTemplate(actions, snooze)
    },
    shortcutItem(actions, SNOOZE_CHOICES_MENU_ITEM_ID, 'Snooze notifications…')
  ]
  // The Edit menu gives copy, paste, and undo to the Google apps on macOS.
  const edit: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' },
      { type: 'separator' },
      shortcutItem(actions, 'find', 'Find in page…')
    ]
  }
  const view: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      shortcutItem(actions, 'reload', 'Reload'),
      { type: 'separator' },
      shortcutItem(actions, 'gmail-tab', 'Gmail'),
      shortcutItem(actions, 'calendar-tab', 'Calendar'),
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }
  const accounts: MenuItemConstructorOptions = {
    label: 'Accounts',
    submenu: [
      shortcutItem(actions, 'add-account', 'Add account'),
      { type: 'separator' },
      shortcutItem(actions, 'next-account', 'Next account'),
      shortcutItem(actions, 'previous-account', 'Previous account'),
      { type: 'separator' },
      ...Array.from({ length: NUMBERED_ACCOUNTS }, (_, index) => {
        const name = accountNames[index]
        return shortcutItem(
          actions,
          `account-${index + 1}`,
          name ?? `Account ${index + 1}`,
          name !== undefined
        )
      })
    ]
  }
  const windowMenu: MenuItemConstructorOptions = { role: 'windowMenu' }
  // The Help menu shows the memory of each Google app of each account.
  const help: MenuItemConstructorOptions = {
    role: 'help',
    submenu: [
      { id: MEMORY_USE_MENU_ITEM_ID, label: 'Memory use', click: () => actions.showMemoryUse() }
    ]
  }

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
      accounts,
      windowMenu,
      help
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
    accounts,
    windowMenu,
    help
  ]
}

/**
 * Set the application menu of Shifted. Call it again when the snooze or the names and
 * the order of the accounts change.
 */
export function setAppMenu(
  actions: AppMenuActions,
  snooze: Snooze | null,
  accountNames: readonly string[]
): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(actions, snooze, accountNames)))
}

/** The small menu of the snooze choices that Cmd+Shift+S opens. */
export function buildSnoozeMenu(actions: SnoozeMenuActions, snooze: Snooze | null): Menu {
  return Menu.buildFromTemplate(snoozeMenuTemplate(actions, snooze))
}
