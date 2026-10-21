import { describe, expect, it } from 'vitest'
import {
  isDataImageUrl,
  MAX_BODY_LENGTH,
  MAX_TITLE_LENGTH,
  parsePageNotification
} from '../../src/shared/page-notifications'
import { appMenuTemplate, snoozeMenuTemplate, snoozeStateText } from '../../src/main/app-menu'

describe('parsePageNotification', () => {
  it('reads what the preload script sends', () => {
    expect(
      parsePageNotification({
        id: 4,
        title: 'Meeting in 10 minutes',
        body: 'Planning',
        tag: 'reminder-1',
        icon: 'https://example.com/icon.png',
        source: 'notification'
      })
    ).toEqual({
      id: 4,
      title: 'Meeting in 10 minutes',
      body: 'Planning',
      tag: 'reminder-1',
      icon: 'https://example.com/icon.png',
      source: 'notification'
    })
  })

  it('refuses a value with no valid id, and fills or cuts the other fields', () => {
    expect(parsePageNotification(null)).toBeUndefined()
    expect(parsePageNotification({ id: -1 })).toBeUndefined()
    expect(parsePageNotification({ id: 1.5 })).toBeUndefined()
    expect(parsePageNotification({ id: '1' })).toBeUndefined()
    const long = parsePageNotification({
      id: 1,
      title: 'x'.repeat(MAX_TITLE_LENGTH + 10),
      body: 'y'.repeat(MAX_BODY_LENGTH + 10),
      tag: 3,
      source: 'something else'
    })
    expect(long?.title).toHaveLength(MAX_TITLE_LENGTH)
    expect(long?.body).toHaveLength(MAX_BODY_LENGTH)
    expect(long?.tag).toBe('')
    expect(long?.icon).toBe('')
    expect(long?.source).toBe('notification')
  })

  it('knows a PNG or JPEG data URL', () => {
    expect(isDataImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isDataImageUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isDataImageUrl('https://example.com/icon.png')).toBe(false)
  })
})

describe('the snooze menus', () => {
  const actions = {
    openSettings: () => undefined,
    snooze: () => undefined,
    stopSnooze: () => undefined,
    showSnoozeChoices: () => undefined
  }

  it('have the four choices and "Stop snooze", which is off when no snooze runs', () => {
    const items = snoozeMenuTemplate(actions, null)
    const labels = items.filter((item) => item.type !== 'separator').map((item) => item.label)
    expect(labels).toEqual([
      'Notifications are on',
      'For 30 minutes',
      'For 1 hour',
      'Until 8:00 tomorrow',
      'Until I turn it off',
      'Stop snooze'
    ])
    expect(items.find((item) => item.label === 'Stop snooze')?.enabled).toBe(false)
    const snoozed = snoozeMenuTemplate(actions, { until: null })
    expect(snoozed.find((item) => item.label === 'Stop snooze')?.enabled).toBe(true)
  })

  it('the app menu has the "Snooze" submenu and Cmd+Shift+S on each platform', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const appMenu = appMenuTemplate(actions, null, platform)[0]
      const submenu = Array.isArray(appMenu?.submenu) ? appMenu.submenu : []
      expect(submenu.find((item) => item.id === 'snooze')?.label).toBe('Snooze')
      expect(submenu.find((item) => item.id === 'snooze-choices')?.accelerator).toBe(
        'CmdOrCtrl+Shift+S'
      )
    }
  })

  it('says when the snooze ends', () => {
    const now = new Date(2026, 9, 21, 14, 0)
    expect(snoozeStateText(null, now)).toBe('Notifications are on')
    expect(snoozeStateText({ until: null }, now)).toBe('Snoozed until you turn it off')
    expect(snoozeStateText({ until: new Date(2026, 9, 21, 14, 30).getTime() }, now)).toMatch(
      /^Snoozed until (14:30|2:30\s?PM)$/
    )
    // A snooze that ends on another day names the day.
    expect(snoozeStateText({ until: new Date(2026, 9, 22, 8, 0).getTime() }, now)).toMatch(
      /^Snoozed until Thursday (08|8):00/
    )
  })
})
