/**
 * The context menu of an account in the sidebar: Rename, Color, Notifications, Sign out,
 * and Remove.
 */
import { Menu, type MenuItemConstructorOptions } from 'electron'
import { accountSettingsPage, type AccountState, type SettingsRequest } from '../shared/api'

export interface AccountMenuActions {
  /** Open the configuration window at a page. */
  openSettings(request: SettingsRequest): void
  signOut(accountId: string): void
  /** Ask the person to confirm, then remove the account. */
  remove(accountId: string): void
}

/** The items of the context menu of an account. */
export function accountMenuTemplate(
  account: AccountState,
  actions: AccountMenuActions
): MenuItemConstructorOptions[] {
  const page = accountSettingsPage(account.id)
  return [
    { label: 'Rename', click: () => actions.openSettings({ page, focus: 'nickname' }) },
    { label: 'Color', click: () => actions.openSettings({ page, focus: 'color' }) },
    // Prompt 05 adds the notification fields to the account page.
    { label: 'Notifications', click: () => actions.openSettings({ page }) },
    { type: 'separator' },
    {
      label: 'Sign out',
      enabled: account.status === 'signed-in',
      click: () => actions.signOut(account.id)
    },
    { label: 'Remove', click: () => actions.remove(account.id) }
  ]
}

export function buildAccountMenu(account: AccountState, actions: AccountMenuActions): Menu {
  return Menu.buildFromTemplate(accountMenuTemplate(account, actions))
}
