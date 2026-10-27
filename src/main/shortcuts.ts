/**
 * The keyboard shortcuts of Shifted, as one table. See "Keyboard shortcuts" in
 * `docs/spec/PRODUCT.md`. The shortcuts are fixed in version 1.
 *
 * `CommandOrControl` is Cmd on macOS and Ctrl on Windows and Linux. Ctrl+Tab and
 * Ctrl+Shift+Tab use Ctrl on all three platforms.
 *
 * The app menu shows each shortcut (see `app-menu.ts`). A Google page gets the keys
 * before the app menu does, so Shifted also catches the shortcuts in the
 * `before-input-event` handler of each web contents (see `catchShortcuts`). Shifted
 * catches no key that is not in the table, so Gmail and Calendar keep all their own keys.
 *
 * Only `catchShortcuts` needs Electron, so that unit tests can check the table.
 */
import type { WebContents } from 'electron'
import type { GoogleApp } from '../shared/api'

/** What a shortcut does. */
export type ShortcutAction =
  /** Select the account at this place in the sidebar. The first place is 0. */
  | { kind: 'select-account'; index: number }
  | { kind: 'next-account' }
  | { kind: 'previous-account' }
  /** Select this tab of the selected account. */
  | { kind: 'google-app'; googleApp: GoogleApp }
  /** Reload the Google app in the content area. */
  | { kind: 'reload' }
  | { kind: 'find' }
  /** Open the configuration window. */
  | { kind: 'settings' }
  /** Start the add-account flow. */
  | { kind: 'add-account' }
  /** Open the snooze choices. */
  | { kind: 'snooze' }

export interface Shortcut {
  /** The id of the menu item of the shortcut. */
  id: string
  action: ShortcutAction
  /** The keys, as an Electron accelerator. */
  accelerator: string
}

/** The number of accounts that have a shortcut: Cmd+1 to Cmd+9. */
export const NUMBERED_ACCOUNTS = 9

/** The shortcut table. */
export const SHORTCUTS: readonly Shortcut[] = [
  ...Array.from({ length: NUMBERED_ACCOUNTS }, (_, index): Shortcut => ({
    id: `account-${index + 1}`,
    action: { kind: 'select-account', index },
    accelerator: `CommandOrControl+${index + 1}`
  })),
  { id: 'next-account', action: { kind: 'next-account' }, accelerator: 'Control+Tab' },
  {
    id: 'previous-account',
    action: { kind: 'previous-account' },
    accelerator: 'Control+Shift+Tab'
  },
  {
    id: 'gmail-tab',
    action: { kind: 'google-app', googleApp: 'gmail' },
    accelerator: 'CommandOrControl+Shift+1'
  },
  {
    id: 'calendar-tab',
    action: { kind: 'google-app', googleApp: 'calendar' },
    accelerator: 'CommandOrControl+Shift+2'
  },
  { id: 'reload', action: { kind: 'reload' }, accelerator: 'CommandOrControl+R' },
  { id: 'find', action: { kind: 'find' }, accelerator: 'CommandOrControl+F' },
  { id: 'settings', action: { kind: 'settings' }, accelerator: 'CommandOrControl+,' },
  { id: 'add-account', action: { kind: 'add-account' }, accelerator: 'CommandOrControl+Shift+N' },
  { id: 'snooze-choices', action: { kind: 'snooze' }, accelerator: 'CommandOrControl+Shift+S' }
]

/** The shortcut with this menu item id. Throws for an unknown id. */
export function shortcut(id: string): Shortcut {
  const found = SHORTCUTS.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`No shortcut "${id}".`)
  return found
}

/** The keys of an accelerator: the modifier keys that it needs, and the main key. */
export interface ShortcutKeys {
  control: boolean
  meta: boolean
  shift: boolean
  alt: boolean
  /** The main key: a digit, an upper-case letter, `,`, or `Tab`. */
  key: string
}

/**
 * The keys of an accelerator on one platform. `CommandOrControl` is Meta (Cmd) on macOS
 * and Control on Windows and Linux.
 */
export function acceleratorKeys(
  accelerator: string,
  platform: NodeJS.Platform = process.platform
): ShortcutKeys {
  const parts = accelerator.split('+')
  const key = parts.pop() ?? ''
  const keys: ShortcutKeys = { control: false, meta: false, shift: false, alt: false, key }
  for (const part of parts) {
    switch (part) {
      case 'CommandOrControl':
      case 'CmdOrCtrl':
        if (platform === 'darwin') keys.meta = true
        else keys.control = true
        break
      case 'Command':
      case 'Cmd':
      case 'Meta':
        keys.meta = true
        break
      case 'Control':
      case 'Ctrl':
        keys.control = true
        break
      case 'Shift':
        keys.shift = true
        break
      case 'Alt':
      case 'Option':
        keys.alt = true
        break
      default:
        throw new Error(`Unknown modifier "${part}" in "${accelerator}".`)
    }
  }
  return keys
}

/** A key press, as the `before-input-event` handler gets it. */
export interface KeyInput {
  type: string
  key: string
  code: string
  control: boolean
  meta: boolean
  shift: boolean
  alt: boolean
  isAutoRepeat?: boolean
}

/**
 * True when the key press is the main key of a shortcut.
 *
 * - A digit matches by its place on the keyboard (`code`), because Shift changes the
 *   character of a digit key, for example Shift+1 gives `!`.
 * - A letter and `,` match by the character (`key`), so that the shortcut follows the
 *   keyboard layout, like the app menu.
 */
function isMainKey(input: KeyInput, key: string): boolean {
  if (/^\d$/.test(key)) return input.code === `Digit${key}`
  if (key === 'Tab') return input.key === 'Tab'
  return input.key.toUpperCase() === key.toUpperCase()
}

/**
 * The shortcut of a key press, or `undefined` if the key press is not in the table. The
 * modifier keys must match exactly, so that Gmail keeps every other combination.
 */
export function matchShortcut(
  input: KeyInput,
  platform: NodeJS.Platform = process.platform
): Shortcut | undefined {
  if (input.type !== 'keyDown' && input.type !== 'rawKeyDown') return undefined
  return SHORTCUTS.find((candidate) => {
    const keys = acceleratorKeys(candidate.accelerator, platform)
    return (
      input.control === keys.control &&
      input.meta === keys.meta &&
      input.shift === keys.shift &&
      input.alt === keys.alt &&
      isMainKey(input, keys.key)
    )
  })
}

/**
 * The account after (`step` 1) or before (`step` -1) the selected account in the
 * sidebar. The order wraps around. With no selected account, the next account is the
 * first one, and the previous account is the last one.
 *
 * @returns The id of the account, or `null` when there is no account.
 */
export function adjacentAccountId(
  accountIds: readonly string[],
  selectedAccountId: string | null,
  step: 1 | -1
): string | null {
  const count = accountIds.length
  if (count === 0) return null
  const index = selectedAccountId === null ? -1 : accountIds.indexOf(selectedAccountId)
  if (index === -1) return (step === 1 ? accountIds[0] : accountIds[count - 1]) ?? null
  return accountIds[(index + step + count) % count] ?? null
}

/**
 * Catch the shortcuts in a web contents before its page gets them. When a key press is
 * in the table, the page does not get it, and `run` does the action. A held key repeats
 * only "next account" and "previous account", so that one long press of Cmd+Shift+N
 * starts one add-account flow.
 */
export function catchShortcuts(contents: WebContents, run: (action: ShortcutAction) => void): void {
  contents.on('before-input-event', (event, input) => {
    const found = matchShortcut(input)
    if (!found) return
    event.preventDefault()
    const repeats = found.action.kind === 'next-account' || found.action.kind === 'previous-account'
    if (input.isAutoRepeat && !repeats) return
    run(found.action)
  })
}
