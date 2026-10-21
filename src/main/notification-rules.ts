/**
 * The rules that decide whether a notification shows: the switches of each account,
 * snooze, and quiet hours. See "Notifications" in `docs/spec/PRODUCT.md`.
 *
 * This module needs no Electron, so that unit tests can use it. Quiet hours and
 * "8:00 tomorrow" use the local time of the computer.
 */
import type {
  NotificationKind,
  NotificationSwitches,
  QuietHours,
  Snooze,
  SnoozeChoice
} from '../shared/api'

/** The parts of an account that the rules read. */
export interface NotificationAccount {
  notifications: NotificationSwitches
  quietHours: QuietHours
}

/** The parts of the state of Shifted that the rules read. */
export interface NotificationState {
  /** The snooze, or `null` when notifications are not snoozed. */
  snooze: Snooze | null
}

const MINUTE_MS = 60_000

/** The hour of "8:00 tomorrow". */
export const SNOOZE_MORNING_HOUR = 8

/**
 * The end of a new snooze.
 *
 * @param choice The snooze choice of the person.
 * @param now The time when the person chose it.
 * @returns The snooze. "8:00 tomorrow" is 8:00 local time on the next calendar day.
 */
export function snoozeFor(choice: SnoozeChoice, now: Date): Snooze {
  switch (choice) {
    case '30-minutes':
      return { until: now.getTime() + 30 * MINUTE_MS }
    case '1-hour':
      return { until: now.getTime() + 60 * MINUTE_MS }
    case 'tomorrow-8': {
      const morning = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      morning.setHours(SNOOZE_MORNING_HOUR, 0, 0, 0)
      return { until: morning.getTime() }
    }
    case 'until-turned-off':
      return { until: null }
  }
}

/** True when the snooze stops notifications at this time. */
export function isSnoozed(snooze: Snooze | null, now: Date): boolean {
  if (!snooze) return false
  return snooze.until === null || now.getTime() < snooze.until
}

/** The minutes after midnight of a time `HH:MM`. */
export function minutesOfDay(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':')
  return Number.parseInt(hours, 10) * 60 + Number.parseInt(minutes, 10)
}

/**
 * True when the daily range from `start` to `end` holds the minute. The range includes
 * its start and stops just before its end. A range whose start is after its end crosses
 * midnight. The same start and end give no range.
 */
export function isInDailyRange(minute: number, start: string, end: string): boolean {
  const from = minutesOfDay(start)
  const to = minutesOfDay(end)
  if (from === to) return false
  if (from < to) return minute >= from && minute < to
  return minute >= from || minute < to
}

/**
 * True when the quiet hours of an account hold this time: inside the daily range, or on
 * a day that is quiet all day. Quiet hours that are off hold no time.
 */
export function isQuietTime(quietHours: QuietHours, now: Date): boolean {
  if (!quietHours.enabled) return false
  if (quietHours.days.includes(now.getDay())) return true
  const minute = now.getHours() * 60 + now.getMinutes()
  return isInDailyRange(minute, quietHours.start, quietHours.end)
}

/**
 * Decide whether a notification of one account shows.
 *
 * A notification shows only when the switch of its kind is on for the account, snooze
 * does not run, and the quiet hours of the account do not hold the time. A notification
 * that this function stops is dropped. It does not show later.
 *
 * @param kind The kind of the notification.
 * @param account The switches and the quiet hours of the account.
 * @param now The time of the notification.
 * @param state The snooze.
 */
export function shouldNotify(
  kind: NotificationKind,
  account: NotificationAccount,
  now: Date,
  state: NotificationState
): boolean {
  if (!account.notifications[kind]) return false
  if (isSnoozed(state.snooze, now)) return false
  return !isQuietTime(account.quietHours, now)
}
