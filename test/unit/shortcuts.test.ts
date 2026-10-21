import { describe, expect, it } from 'vitest'
import {
  acceleratorKeys,
  adjacentAccountId,
  matchShortcut,
  SHORTCUTS,
  type KeyInput,
  type ShortcutKeys
} from '../../src/main/shortcuts'

const PLATFORMS = ['darwin', 'win32', 'linux'] as const

/**
 * The known keys of Gmail that use a modifier key, from Gmail's list of keyboard
 * shortcuts. `CommandOrControl` is "⌘/Ctrl" there. `Control` is a key that Gmail lists as
 * "Ctrl" only. A few keys with no modifier, which Shifted must never catch, are at the end.
 */
const GMAIL_KEYS = [
  'Control+.', // Advance to the next chat or compose.
  'Control+,', // Advance to the previous chat or compose.
  'CommandOrControl+Enter', // Send.
  'CommandOrControl+Shift+C', // Add Cc recipients.
  'CommandOrControl+Shift+B', // Add Bcc recipients.
  'CommandOrControl+Shift+F', // Access custom from.
  'CommandOrControl+K', // Insert a link.
  'Command+;', // Go to the next misspelled word (Mac).
  'CommandOrControl+M', // Open spelling suggestions.
  'CommandOrControl+Shift+5', // Previous font.
  'CommandOrControl+Shift+6', // Next font.
  'CommandOrControl+Shift+-', // Decrease text size.
  'CommandOrControl+Shift+Plus', // Increase text size.
  'CommandOrControl+B', // Bold.
  'CommandOrControl+I', // Italics.
  'CommandOrControl+U', // Underline.
  'CommandOrControl+Shift+7', // Numbered list.
  'CommandOrControl+Shift+8', // Bulleted list.
  'CommandOrControl+Shift+9', // Quote.
  'CommandOrControl+[', // Indent less.
  'CommandOrControl+]', // Indent more.
  'CommandOrControl+Shift+L', // Align left.
  'CommandOrControl+Shift+E', // Align center.
  'CommandOrControl+Shift+R', // Align right.
  'CommandOrControl+\\', // Remove formatting.
  'CommandOrControl+Alt+,', // Switch between the side panel and the inbox.
  'CommandOrControl+Alt+.', // Switch between the side panel and the inbox.
  'CommandOrControl+Z', // Undo.
  'CommandOrControl+Y', // Redo.
  'C', // Compose.
  'J', // Older conversation.
  'K', // Newer conversation.
  'Shift+3', // Delete (#).
  'Shift+Escape' // Focus the main window.
]

/**
 * The one allowed exception, chosen by the person: on Windows and Linux, Cmd+, of the
 * shortcut table is Ctrl+,, which Gmail uses for "Advance to the previous chat or
 * compose". See "Phase 07" in docs/decisions.md ("Ctrl+, on Windows and Linux").
 */
function isAllowedException(
  shortcutId: string,
  gmailKey: string,
  platform: NodeJS.Platform
): boolean {
  return shortcutId === 'settings' && gmailKey === 'Control+,' && platform !== 'darwin'
}

function sameKeys(a: ShortcutKeys, b: ShortcutKeys): boolean {
  return (
    a.control === b.control &&
    a.meta === b.meta &&
    a.shift === b.shift &&
    a.alt === b.alt &&
    a.key.toUpperCase() === b.key.toUpperCase()
  )
}

/** A key press as `before-input-event` gives it. */
function press(key: string, code: string, modifiers: Partial<KeyInput> = {}): KeyInput {
  return {
    type: 'keyDown',
    key,
    code,
    control: false,
    meta: false,
    shift: false,
    alt: false,
    ...modifiers
  }
}

describe('the shortcut table', () => {
  it('has the shortcuts of PRODUCT.md, with CommandOrControl for Cmd', () => {
    expect(SHORTCUTS.map((shortcut) => shortcut.accelerator)).toEqual([
      'CommandOrControl+1',
      'CommandOrControl+2',
      'CommandOrControl+3',
      'CommandOrControl+4',
      'CommandOrControl+5',
      'CommandOrControl+6',
      'CommandOrControl+7',
      'CommandOrControl+8',
      'CommandOrControl+9',
      'Control+Tab',
      'Control+Shift+Tab',
      'CommandOrControl+Shift+1',
      'CommandOrControl+Shift+2',
      'CommandOrControl+R',
      'CommandOrControl+,',
      'CommandOrControl+Shift+N',
      'CommandOrControl+Shift+S'
    ])
  })

  it('has no duplicate keys and no duplicate ids on any platform', () => {
    expect(new Set(SHORTCUTS.map((shortcut) => shortcut.id)).size).toBe(SHORTCUTS.length)
    for (const platform of PLATFORMS) {
      const keys = SHORTCUTS.map((shortcut) => acceleratorKeys(shortcut.accelerator, platform))
      keys.forEach((one, index) => {
        keys.slice(index + 1).forEach((other) => expect(sameKeys(one, other)).toBe(false))
      })
    }
  })

  it('has no key that Gmail uses, except Ctrl+, on Windows and Linux', () => {
    const conflicts: string[] = []
    for (const platform of PLATFORMS) {
      for (const shortcut of SHORTCUTS) {
        const keys = acceleratorKeys(shortcut.accelerator, platform)
        for (const gmailKey of GMAIL_KEYS) {
          if (!sameKeys(keys, acceleratorKeys(gmailKey, platform))) continue
          if (isAllowedException(shortcut.id, gmailKey, platform)) continue
          conflicts.push(`${platform}: ${shortcut.accelerator} = Gmail ${gmailKey}`)
        }
      }
    }
    expect(conflicts).toEqual([])
  })

  it('takes Ctrl+, from Gmail only on Windows and Linux', () => {
    const settings = SHORTCUTS.find((shortcut) => shortcut.id === 'settings')
    const gmail = acceleratorKeys('Control+,', 'darwin')
    expect(sameKeys(acceleratorKeys(settings?.accelerator ?? '', 'darwin'), gmail)).toBe(false)
    for (const platform of ['win32', 'linux'] as const) {
      expect(
        sameKeys(
          acceleratorKeys(settings?.accelerator ?? '', platform),
          acceleratorKeys('Control+,', platform)
        )
      ).toBe(true)
    }
  })

  it('uses Cmd on macOS and Ctrl on Windows and Linux for CommandOrControl', () => {
    expect(acceleratorKeys('CommandOrControl+Shift+2', 'darwin')).toEqual({
      control: false,
      meta: true,
      shift: true,
      alt: false,
      key: '2'
    })
    expect(acceleratorKeys('CommandOrControl+Shift+2', 'win32')).toEqual({
      control: true,
      meta: false,
      shift: true,
      alt: false,
      key: '2'
    })
    // Ctrl+Tab uses Ctrl on all three platforms.
    expect(acceleratorKeys('Control+Tab', 'darwin').control).toBe(true)
  })
})

describe('matchShortcut', () => {
  it('matches Cmd+2 on macOS and Ctrl+2 on Windows and Linux', () => {
    expect(matchShortcut(press('2', 'Digit2', { meta: true }), 'darwin')?.id).toBe('account-2')
    expect(matchShortcut(press('2', 'Digit2', { control: true }), 'win32')?.id).toBe('account-2')
    expect(matchShortcut(press('2', 'Digit2', { control: true }), 'darwin')).toBeUndefined()
    expect(matchShortcut(press('2', 'Digit2', { meta: true }), 'linux')).toBeUndefined()
  })

  it('matches a digit with Shift by its place on the keyboard', () => {
    const calendar = press('@', 'Digit2', { meta: true, shift: true })
    expect(matchShortcut(calendar, 'darwin')?.id).toBe('calendar-tab')
  })

  it('matches letters in either case, comma, and Tab', () => {
    expect(matchShortcut(press('r', 'KeyR', { meta: true }), 'darwin')?.id).toBe('reload')
    expect(matchShortcut(press('N', 'KeyN', { control: true, shift: true }), 'linux')?.id).toBe(
      'add-account'
    )
    expect(matchShortcut(press(',', 'Comma', { control: true }), 'win32')?.id).toBe('settings')
    expect(matchShortcut(press('Tab', 'Tab', { control: true }), 'darwin')?.id).toBe('next-account')
    expect(matchShortcut(press('Tab', 'Tab', { control: true, shift: true }), 'win32')?.id).toBe(
      'previous-account'
    )
  })

  it('catches no other key', () => {
    // Gmail keeps Cmd+Shift+C (Cc), Cmd+Shift+R (align right), and plain letters.
    expect(matchShortcut(press('c', 'KeyC', { meta: true, shift: true }), 'darwin')).toBeUndefined()
    expect(matchShortcut(press('r', 'KeyR', { meta: true, shift: true }), 'darwin')).toBeUndefined()
    expect(matchShortcut(press('r', 'KeyR'), 'darwin')).toBeUndefined()
    expect(matchShortcut(press('2', 'Digit2', { meta: true, alt: true }), 'darwin')).toBeUndefined()
    expect(matchShortcut(press('Tab', 'Tab'), 'win32')).toBeUndefined()
    expect(matchShortcut(press('0', 'Digit0', { control: true }), 'win32')).toBeUndefined()
  })

  it('acts only on a key press, not on a key release', () => {
    const release = { ...press('2', 'Digit2', { meta: true }), type: 'keyUp' }
    expect(matchShortcut(release, 'darwin')).toBeUndefined()
  })
})

describe('next and previous account', () => {
  const ids = ['a', 'b', 'c']

  it('moves to the next and the previous account', () => {
    expect(adjacentAccountId(ids, 'a', 1)).toBe('b')
    expect(adjacentAccountId(ids, 'b', -1)).toBe('a')
  })

  it('wraps around at both ends', () => {
    expect(adjacentAccountId(ids, 'c', 1)).toBe('a')
    expect(adjacentAccountId(ids, 'a', -1)).toBe('c')
  })

  it('starts at the first or the last account with no selected account', () => {
    expect(adjacentAccountId(ids, null, 1)).toBe('a')
    expect(adjacentAccountId(ids, null, -1)).toBe('c')
    expect(adjacentAccountId(ids, 'gone', 1)).toBe('a')
  })

  it('stays on the one account, and gives nothing with no account', () => {
    expect(adjacentAccountId(['a'], 'a', 1)).toBe('a')
    expect(adjacentAccountId(['a'], 'a', -1)).toBe('a')
    expect(adjacentAccountId([], null, 1)).toBeNull()
  })
})
