import type { MenuItemConstructorOptions } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mailtoAddress,
  pageMenuTemplate,
  type PageMenuActions,
  type PageMenuParams,
  type PageMenuSource
} from '../../src/main/page-menu-items'

const OUTSIDE = 'https://example.com/doc'
const GMAIL = 'https://mail.google.com/mail/u/0/#inbox'
const CALENDAR_EVENT = 'https://calendar.google.com/calendar/event?action=VIEW&eid=abc'
const IMAGE = 'https://lh3.googleusercontent.com/a/photo=s96'

const NO_EDIT = {
  canUndo: false,
  canRedo: false,
  canCut: false,
  canCopy: false,
  canPaste: false,
  canDelete: false,
  canSelectAll: false,
  canEditRichly: false
}

/** A right-click on an empty place of the page. */
function params(values: Partial<PageMenuParams> = {}): PageMenuParams {
  return {
    linkURL: '',
    srcURL: '',
    mediaType: 'none',
    selectionText: '',
    isEditable: false,
    editFlags: NO_EDIT,
    misspelledWord: '',
    dictionarySuggestions: [],
    ...values
  }
}

function fakeActions(): PageMenuActions {
  return {
    edit: vi.fn(),
    replaceMisspelling: vi.fn(),
    addToDictionary: vi.fn(),
    copyText: vi.fn(),
    copyImage: vi.fn(),
    saveImage: vi.fn(),
    openInDefaultBrowser: vi.fn(),
    lookUp: vi.fn()
  }
}

/** The labels of the items, with "-" for a separator. */
function labels(template: MenuItemConstructorOptions[]): string[] {
  return template.map((item) => (item.type === 'separator' ? '-' : (item.label ?? '')))
}

function item(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions {
  const found = template.find((candidate) => candidate.label === label)
  if (!found) throw new Error(`No item "${label}" in ${labels(template).join(', ')}`)
  return found
}

function click(template: MenuItemConstructorOptions[], label: string): void {
  ;(item(template, label).click as () => void)()
}

function menu(
  values: Partial<PageMenuParams>,
  source: PageMenuSource = 'gmail',
  actions: PageMenuActions = fakeActions(),
  platform: NodeJS.Platform = 'linux'
): MenuItemConstructorOptions[] {
  return pageMenuTemplate(params(values), source, actions, platform)
}

describe('pageMenuTemplate', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env['SHIFTED_TEST_SERVER']
    delete process.env['SHIFTED_TEST_SERVER']
  })

  afterEach(() => {
    if (saved === undefined) delete process.env['SHIFTED_TEST_SERVER']
    else process.env['SHIFTED_TEST_SERVER'] = saved
  })

  it('shows no menu on an empty place of the page', () => {
    expect(menu({})).toEqual([])
    expect(menu({ selectionText: '   ' })).toEqual([])
  })

  it('opens an outside link in the default browser and copies its address', () => {
    const actions = fakeActions()
    const template = menu({ linkURL: OUTSIDE }, 'gmail', actions)
    expect(labels(template)).toEqual(['Open link in browser', 'Copy link address'])
    click(template, 'Open link in browser')
    expect(actions.openInDefaultBrowser).toHaveBeenCalledWith(OUTSIDE)
    click(template, 'Copy link address')
    expect(actions.copyText).toHaveBeenCalledWith(OUTSIDE)
  })

  it('opens an outside link in the default browser from Calendar and a child window', () => {
    for (const source of ['calendar', 'child-window'] as const) {
      expect(labels(menu({ linkURL: OUTSIDE }, source))).toEqual([
        'Open link in browser',
        'Copy link address'
      ])
    }
  })

  it('never opens a Gmail or Calendar link in the default browser', () => {
    for (const linkURL of [GMAIL, CALENDAR_EVENT]) {
      for (const source of ['gmail', 'calendar', 'child-window'] as const) {
        expect(labels(menu({ linkURL }, source))).toEqual(['Copy link address'])
      }
    }
  })

  it('never opens a link of the sign-in window in the default browser', () => {
    expect(labels(menu({ linkURL: OUTSIDE }, 'sign-in'))).toEqual(['Copy link address'])
  })

  it('has no link items for a blocked scheme or in a screen of Shifted', () => {
    expect(menu({ linkURL: 'javascript:void(0)' })).toEqual([])
    expect(menu({ linkURL: 'file:///etc/passwd' })).toEqual([])
    expect(menu({ linkURL: OUTSIDE }, 'shifted-screen')).toEqual([])
  })

  it('copies the address of a mailto: link', () => {
    const actions = fakeActions()
    const template = menu({ linkURL: 'mailto:friend@example.com?subject=Hello' }, 'gmail', actions)
    expect(labels(template)).toEqual(['Copy email address'])
    click(template, 'Copy email address')
    expect(actions.copyText).toHaveBeenCalledWith('friend@example.com')
  })

  it('copies and saves an image', () => {
    const actions = fakeActions()
    const template = menu({ mediaType: 'image', srcURL: IMAGE }, 'gmail', actions)
    expect(labels(template)).toEqual(['Copy image', 'Copy image address', 'Save image'])
    click(template, 'Copy image')
    expect(actions.copyImage).toHaveBeenCalled()
    click(template, 'Copy image address')
    expect(actions.copyText).toHaveBeenCalledWith(IMAGE)
    click(template, 'Save image')
    expect(actions.saveImage).toHaveBeenCalledWith(IMAGE)
  })

  it('has no image items in the sign-in window or a screen of Shifted', () => {
    expect(menu({ mediaType: 'image', srcURL: IMAGE }, 'sign-in')).toEqual([])
    expect(menu({ mediaType: 'image', srcURL: IMAGE }, 'shifted-screen')).toEqual([])
  })

  it('shows an image link with the link items first', () => {
    const template = menu({ linkURL: OUTSIDE, mediaType: 'image', srcURL: IMAGE })
    expect(labels(template)).toEqual([
      'Open link in browser',
      'Copy link address',
      '-',
      'Copy image',
      'Copy image address',
      'Save image'
    ])
  })

  it('copies selected text', () => {
    const actions = fakeActions()
    const template = menu(
      { selectionText: 'Lunch at noon', editFlags: { ...NO_EDIT, canCopy: true } },
      'gmail',
      actions
    )
    expect(labels(template)).toEqual(['Copy'])
    click(template, 'Copy')
    expect(actions.edit).toHaveBeenCalledWith('copy')
  })

  it('looks up selected text on macOS only', () => {
    const actions = fakeActions()
    const selected = {
      selectionText: '  Lunch at\nnoon  ',
      editFlags: { ...NO_EDIT, canCopy: true }
    }
    const template = menu(selected, 'gmail', actions, 'darwin')
    expect(labels(template)).toEqual(['Copy', '-', 'Look up “Lunch at noon”'])
    click(template, 'Look up “Lunch at noon”')
    expect(actions.lookUp).toHaveBeenCalled()
    expect(labels(menu(selected, 'gmail', fakeActions(), 'win32'))).toEqual(['Copy'])
  })

  it('shortens a long selection in "Look up"', () => {
    const template = menu({ selectionText: 'a'.repeat(40) }, 'gmail', fakeActions(), 'darwin')
    expect(labels(template)).toContain(`Look up “${'a'.repeat(30)}…”`)
  })

  it('gives a text field every edit command, on only when the page allows it', () => {
    const actions = fakeActions()
    const template = menu(
      { isEditable: true, editFlags: { ...NO_EDIT, canPaste: true, canSelectAll: true } },
      'gmail',
      actions
    )
    expect(labels(template)).toEqual([
      'Undo',
      'Redo',
      '-',
      'Cut',
      'Copy',
      'Paste',
      'Paste and match style',
      'Select all'
    ])
    expect(template.filter((entry) => entry.enabled).map((entry) => entry.label)).toEqual([
      'Paste',
      'Paste and match style',
      'Select all'
    ])
    click(template, 'Paste')
    expect(actions.edit).toHaveBeenCalledWith('paste')
    click(template, 'Paste and match style')
    expect(actions.edit).toHaveBeenCalledWith('pasteAndMatchStyle')
  })

  it('gives a text field in a screen of Shifted and in the sign-in window the edit commands', () => {
    for (const source of ['shifted-screen', 'sign-in'] as const) {
      expect(labels(menu({ isEditable: true }, source))).toContain('Paste')
    }
  })

  it('shows the spelling suggestions first, and adds a word to the dictionary', () => {
    const actions = fakeActions()
    const template = menu(
      {
        isEditable: true,
        misspelledWord: 'tommorow',
        dictionarySuggestions: ['tomorrow', 'tom morrow']
      },
      'gmail',
      actions
    )
    expect(labels(template).slice(0, 4)).toEqual([
      'tomorrow',
      'tom morrow',
      'Add to dictionary',
      '-'
    ])
    click(template, 'tomorrow')
    expect(actions.replaceMisspelling).toHaveBeenCalledWith('tomorrow')
    click(template, 'Add to dictionary')
    expect(actions.addToDictionary).toHaveBeenCalledWith('tommorow')
  })

  it('shows at most 5 spelling suggestions, or says that there are none', () => {
    const many = menu({
      isEditable: true,
      misspelledWord: 'teh',
      dictionarySuggestions: ['the', 'ten', 'tech', 'tea', 'tee', 'teeth']
    })
    expect(labels(many).slice(0, 6)).toEqual([
      'the',
      'ten',
      'tech',
      'tea',
      'tee',
      'Add to dictionary'
    ])
    const none = menu({ isEditable: true, misspelledWord: 'qzx' })
    expect(item(none, 'No spelling suggestions').enabled).toBe(false)
  })

  it('shows no spelling items outside a text field', () => {
    expect(menu({ misspelledWord: 'teh', dictionarySuggestions: ['the'] })).toEqual([])
  })
})

describe('mailtoAddress', () => {
  it('reads the address of a mailto: link', () => {
    expect(mailtoAddress('mailto:friend@example.com')).toBe('friend@example.com')
    expect(mailtoAddress('mailto:friend@example.com?subject=Hello')).toBe('friend@example.com')
    expect(mailtoAddress('mailto:Alex%20Example%20%3Calex@example.com%3E')).toBe(
      'Alex Example <alex@example.com>'
    )
  })

  it('returns null for every other URL', () => {
    expect(mailtoAddress(OUTSIDE)).toBeNull()
    expect(mailtoAddress('not a url')).toBeNull()
  })
})
