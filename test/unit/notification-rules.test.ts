import { describe, expect, it } from 'vitest'
import {
  defaultNotificationSwitches,
  defaultQuietHours,
  NOTIFICATION_KINDS,
  parseQuietHours,
  type NotificationKind,
  type QuietHours,
  type Snooze
} from '../../src/shared/api'
import {
  isInDailyRange,
  isQuietTime,
  isSnoozed,
  shouldNotify,
  snoozeFor,
  type NotificationAccount
} from '../../src/main/notification-rules'

/** A local time on Wednesday 21 October 2026. */
function wednesday(hours: number, minutes = 0): Date {
  return new Date(2026, 9, 21, hours, minutes)
}

const SUNDAY = 0
const WEDNESDAY = 3
const THURSDAY = 4
const SATURDAY = 6

function account(
  change: {
    notifications?: Partial<Record<NotificationKind, boolean>>
    quietHours?: Partial<QuietHours>
  } = {}
): NotificationAccount {
  return {
    notifications: { ...defaultNotificationSwitches(), ...change.notifications },
    quietHours: { ...defaultQuietHours(), ...change.quietHours }
  }
}

const NO_SNOOZE = { snooze: null }

describe('shouldNotify: the switches', () => {
  it('shows every kind when all three switches are on, as for a new account', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(shouldNotify(kind, account(), wednesday(12), NO_SNOOZE)).toBe(true)
    }
  })

  it('drops only the kind whose switch is off', () => {
    for (const off of NOTIFICATION_KINDS) {
      const withOneOff = account({ notifications: { [off]: false } })
      for (const kind of NOTIFICATION_KINDS) {
        expect(shouldNotify(kind, withOneOff, wednesday(12), NO_SNOOZE)).toBe(kind !== off)
      }
    }
  })
})

describe('snooze', () => {
  const now = wednesday(14, 10)

  it('30 minutes and 1 hour end that long after now', () => {
    expect(snoozeFor('30-minutes', now)).toEqual({ until: now.getTime() + 30 * 60_000 })
    expect(snoozeFor('1-hour', now)).toEqual({ until: now.getTime() + 60 * 60_000 })
  })

  it('"8:00 tomorrow" ends at 8:00 local time on the next day', () => {
    const until = snoozeFor('tomorrow-8', now).until
    expect(until).toBe(new Date(2026, 9, 22, 8, 0).getTime())
    // Also just before midnight, and at the end of a month.
    expect(snoozeFor('tomorrow-8', wednesday(23, 59)).until).toBe(
      new Date(2026, 9, 22, 8, 0).getTime()
    )
    expect(snoozeFor('tomorrow-8', new Date(2026, 9, 31, 9, 0)).until).toBe(
      new Date(2026, 10, 1, 8, 0).getTime()
    )
  })

  it('"until I turn it off" has no end', () => {
    expect(snoozeFor('until-turned-off', now)).toEqual({ until: null })
    expect(isSnoozed({ until: null }, new Date(2099, 0, 1))).toBe(true)
  })

  it('each snooze choice stops every kind of every account until its end', () => {
    for (const choice of ['30-minutes', '1-hour', 'tomorrow-8', 'until-turned-off'] as const) {
      const state = { snooze: snoozeFor(choice, now) }
      for (const kind of NOTIFICATION_KINDS) {
        expect(shouldNotify(kind, account(), now, state)).toBe(false)
        expect(shouldNotify(kind, account(), new Date(now.getTime() + 29 * 60_000), state)).toBe(
          false
        )
      }
    }
  })

  it('a snooze that ended stops nothing', () => {
    const thirty = { snooze: snoozeFor('30-minutes', now) }
    const hour = { snooze: snoozeFor('1-hour', now) }
    const morning = { snooze: snoozeFor('tomorrow-8', now) }
    expect(shouldNotify('new-mail', account(), new Date(now.getTime() + 30 * 60_000), thirty)).toBe(
      true
    )
    expect(shouldNotify('new-mail', account(), new Date(now.getTime() + 59 * 60_000), hour)).toBe(
      false
    )
    expect(shouldNotify('new-mail', account(), new Date(now.getTime() + 60 * 60_000), hour)).toBe(
      true
    )
    expect(shouldNotify('calendar', account(), new Date(2026, 9, 22, 7, 59), morning)).toBe(false)
    expect(shouldNotify('calendar', account(), new Date(2026, 9, 22, 8, 0), morning)).toBe(true)
  })

  it('no snooze stops nothing', () => {
    const none: Snooze | null = null
    expect(isSnoozed(none, now)).toBe(false)
  })
})

describe('quiet hours', () => {
  it('stop notifications inside the range and not outside it', () => {
    const work = account({ quietHours: { enabled: true, start: '12:00', end: '13:30' } })
    expect(shouldNotify('new-mail', work, wednesday(11, 59), NO_SNOOZE)).toBe(true)
    expect(shouldNotify('new-mail', work, wednesday(12, 0), NO_SNOOZE)).toBe(false)
    expect(shouldNotify('chat', work, wednesday(13, 29), NO_SNOOZE)).toBe(false)
    // The range stops just before its end.
    expect(shouldNotify('calendar', work, wednesday(13, 30), NO_SNOOZE)).toBe(true)
  })

  it('a range can cross midnight, for example 22:00 to 7:00', () => {
    const night = account({ quietHours: { enabled: true, start: '22:00', end: '07:00' } })
    expect(shouldNotify('new-mail', night, wednesday(21, 59), NO_SNOOZE)).toBe(true)
    expect(shouldNotify('new-mail', night, wednesday(22, 0), NO_SNOOZE)).toBe(false)
    expect(shouldNotify('new-mail', night, wednesday(23, 59), NO_SNOOZE)).toBe(false)
    expect(shouldNotify('new-mail', night, wednesday(0, 0), NO_SNOOZE)).toBe(false)
    expect(shouldNotify('new-mail', night, wednesday(6, 59), NO_SNOOZE)).toBe(false)
    expect(shouldNotify('new-mail', night, wednesday(7, 0), NO_SNOOZE)).toBe(true)
    expect(shouldNotify('new-mail', night, wednesday(12, 0), NO_SNOOZE)).toBe(true)
  })

  it('a day in the weekdays is quiet all day, and the other days are not', () => {
    const weekend = account({
      quietHours: { enabled: true, start: '00:00', end: '00:00', days: [SATURDAY, SUNDAY] }
    })
    const saturday = new Date(2026, 9, 24, 12, 0)
    const sunday = new Date(2026, 9, 25, 0, 0)
    const monday = new Date(2026, 9, 26, 0, 0)
    expect(saturday.getDay()).toBe(SATURDAY)
    expect(shouldNotify('new-mail', weekend, saturday, NO_SNOOZE)).toBe(false)
    expect(shouldNotify('new-mail', weekend, sunday, NO_SNOOZE)).toBe(false)
    expect(shouldNotify('new-mail', weekend, monday, NO_SNOOZE)).toBe(true)
    expect(shouldNotify('new-mail', weekend, wednesday(12), NO_SNOOZE)).toBe(true)
  })

  it('the example of the spec: quiet outside 9:00 to 18:00, Monday to Friday', () => {
    const work = account({
      quietHours: { enabled: true, start: '18:00', end: '09:00', days: [SATURDAY, SUNDAY] }
    })
    expect(shouldNotify('new-mail', work, wednesday(9, 0), NO_SNOOZE)).toBe(true)
    expect(shouldNotify('new-mail', work, wednesday(17, 59), NO_SNOOZE)).toBe(true)
    expect(shouldNotify('new-mail', work, wednesday(18, 0), NO_SNOOZE)).toBe(false)
    expect(shouldNotify('new-mail', work, wednesday(8, 59), NO_SNOOZE)).toBe(false)
    expect(shouldNotify('new-mail', work, new Date(2026, 9, 24, 12, 0), NO_SNOOZE)).toBe(false)
  })

  it('quiet hours that are off stop nothing', () => {
    const off = account({
      quietHours: { enabled: false, start: '00:00', end: '23:59', days: [WEDNESDAY] }
    })
    expect(shouldNotify('new-mail', off, wednesday(12), NO_SNOOZE)).toBe(true)
    expect(isQuietTime(off.quietHours, wednesday(12))).toBe(false)
  })

  it('the same start and end give no daily range', () => {
    expect(isInDailyRange(0, '08:00', '08:00')).toBe(false)
    expect(isInDailyRange(8 * 60, '08:00', '08:00')).toBe(false)
    const quiet = { enabled: true, start: '08:00', end: '08:00', days: [THURSDAY] }
    expect(isQuietTime(quiet, wednesday(8))).toBe(false)
  })
})

describe('parseQuietHours', () => {
  it('accepts valid quiet hours and refuses wrong values', () => {
    expect(parseQuietHours({ enabled: true, start: '09:30', end: '17:00', days: [5, 1] })).toEqual({
      enabled: true,
      start: '09:30',
      end: '17:00',
      days: [1, 5]
    })
    expect(
      parseQuietHours({ enabled: true, start: '9:30', end: '17:00', days: [] })
    ).toBeUndefined()
    expect(
      parseQuietHours({ enabled: true, start: '09:30', end: '17:60', days: [] })
    ).toBeUndefined()
    expect(
      parseQuietHours({ enabled: true, start: '09:30', end: '17:00', days: [1.5] })
    ).toBeUndefined()
    expect(
      parseQuietHours({ enabled: 'yes', start: '09:30', end: '17:00', days: [] })
    ).toBeUndefined()
    expect(parseQuietHours(null)).toBeUndefined()
  })
})
