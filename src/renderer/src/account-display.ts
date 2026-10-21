import { accountColorName, type AccountState, type GoogleApp } from '../../shared/api'

/** The account name is the email address. A new account has no address yet. */
export function accountName(account: AccountState): string {
  return account.email || 'New account'
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
export function unreadDescription(account: AccountState): string | null {
  if (account.unreadWarning !== null) return `Unread count not available: ${account.unreadWarning}`
  const count = account.unreadCount ?? 0
  return count > 0 ? `${count} unread` : null
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

/** The name of an account color, for example "Blue". */
export function colorName(color: string): string {
  return accountColorName(color)
}

export const GOOGLE_APP_NAMES: Readonly<Record<GoogleApp, string>> = {
  gmail: 'Gmail',
  calendar: 'Calendar'
}
