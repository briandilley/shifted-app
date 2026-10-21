import type { AccountState } from '../../shared/api'
import { NEW_ACCOUNT, unreadText, unreadWarningText } from '../strings'

/** The account name is the email address. A new account has no address yet. */
export function accountName(account: AccountState): string {
  return account.email || NEW_ACCOUNT
}

/** The name that the screens of Shifted show: the nickname, or else the account name. */
export function accountTitle(account: AccountState): string {
  return account.nickname || accountName(account)
}

/** The text that shows when you point to an account: the nickname and the address. */
export function accountTooltip(account: AccountState): string {
  return account.nickname ? `${account.nickname}\n${accountName(account)}` : accountName(account)
}

/** The accessible name of an account: the nickname and the address. */
export function accountLabel(account: AccountState): string {
  return account.nickname ? `${account.nickname}, ${accountName(account)}` : accountName(account)
}

/**
 * What the unread badge of an account says, for screen readers, or `null` when the badge
 * shows nothing.
 */
export function unreadDescription(
  account: Pick<AccountState, 'unreadCount' | 'unreadWarning'>
): string | null {
  if (account.unreadWarning !== null) return unreadWarningText(account.unreadWarning)
  const count = account.unreadCount ?? 0
  return count > 0 ? unreadText(count) : null
}

/**
 * The accessible name of the button of an account in the sidebar: the name of the account
 * and what its unread badge says, for example "work@company.com, 3 unread".
 */
export function sidebarAccountLabel(account: AccountState): string {
  const unread = unreadDescription(account)
  return unread ? `${accountLabel(account)}, ${unread}` : accountLabel(account)
}

/** The letter that the avatar shows when Shifted has no photo. */
export function accountLetter(account: AccountState): string {
  const name = account.email || account.nickname
  return (Array.from(name.trim())[0] ?? '').toUpperCase()
}

/** Black or white, whichever is easier to read on the color. */
export function textColorOn(color: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (!match) return '#ffffff'
  const [r, g, b] = match.slice(1).map((hex) => {
    const channel = parseInt(hex, 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
  return luminance > 0.4 ? '#202124' : '#ffffff'
}
