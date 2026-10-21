/**
 * The application menu of Shifted. In this phase, its only shortcut of Shifted is Cmd+,
 * (Ctrl+, on Windows and Linux), which opens the configuration window. Prompt 07 adds the
 * other shortcuts.
 */
import { Menu, type MenuItemConstructorOptions } from 'electron'

/** The id of the menu item that opens the configuration window. */
export const SETTINGS_MENU_ITEM_ID = 'settings'

/** The shortcut of the configuration window. */
export const SETTINGS_ACCELERATOR = 'CmdOrCtrl+,'

export interface AppMenuActions {
  openSettings(): void
}

export function appMenuTemplate(
  actions: AppMenuActions,
  platform: NodeJS.Platform = process.platform
): MenuItemConstructorOptions[] {
  const settings: MenuItemConstructorOptions = {
    id: SETTINGS_MENU_ITEM_ID,
    label: platform === 'darwin' ? 'Settings…' : 'Settings',
    accelerator: SETTINGS_ACCELERATOR,
    click: () => actions.openSettings()
  }
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
    { label: 'File', submenu: [settings, { type: 'separator' }, { role: 'quit' }] },
    edit,
    view,
    windowMenu
  ]
}

/** Set the application menu of Shifted. */
export function setAppMenu(actions: AppMenuActions): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(actions)))
}
