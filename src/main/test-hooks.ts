/**
 * Test hooks for the end-to-end tests.
 *
 * In test mode (`SHIFTED_TEST_SERVER` is set), Shifted does not open the default browser
 * and does not open a file manager. It records the request in
 * `globalThis.shiftedTestRecords`, where the end-to-end tests read it with
 * `electronApp.evaluate`.
 */
import type { Notification } from 'electron'
import type { NotificationKind } from '../shared/api'
import { isTestMode } from './google-urls'

/**
 * A notification that Shifted would show. In test mode, Shifted does not show the
 * notifications of new mail, Calendar, and Chat. It records them here.
 */
export interface RecordedNotification {
  accountId: string
  kind: NotificationKind
  title: string
  body: string
  /** Do what a click on the notification does. */
  click(): void
}

export interface ShiftedTestRecords {
  /** The URLs that Shifted would open in the default browser. */
  openExternal: string[]
  /** The files that Shifted would show in the file manager. */
  showItemInFolder: string[]
  /** The download notifications that Shifted showed, so that a test can click one. */
  downloadNotifications: Notification[]
  /** The total that the app badge shows now. */
  appBadgeTotal: number
  /** The notifications of new mail, Calendar, and Chat that passed the rules, in order. */
  notifications: RecordedNotification[]
  /**
   * How many times "Make Shifted the default email app" ran. In test mode, Shifted never
   * changes the default email app of the computer.
   */
  makeDefaultEmailApp: number
  /**
   * The values that "Open at login" asked for, in order. In test mode, Shifted never
   * changes the login items of the computer.
   */
  openAtLogin: boolean[]
}

interface TestRecordsHolder {
  shiftedTestRecords?: ShiftedTestRecords
}

/** The test records, or `undefined` when Shifted is not in test mode. */
export function testRecords(): ShiftedTestRecords | undefined {
  if (!isTestMode()) return undefined
  const holder = globalThis as TestRecordsHolder
  holder.shiftedTestRecords ??= {
    openExternal: [],
    showItemInFolder: [],
    downloadNotifications: [],
    appBadgeTotal: 0,
    notifications: [],
    makeDefaultEmailApp: 0,
    openAtLogin: []
  }
  return holder.shiftedTestRecords
}

/**
 * A time that an end-to-end test makes shorter, in milliseconds, from an environment
 * variable. Only in test mode. `undefined` when the variable is not set or not a number.
 *
 * - `SHIFTED_TEST_SLEEP_MS`: the time from leaving a Google app to its sleep.
 * - `SHIFTED_TEST_READ_INTERVAL_MS`: the time between two reads of the feed of an account.
 */
export function testDurationMs(
  name: 'SHIFTED_TEST_SLEEP_MS' | 'SHIFTED_TEST_READ_INTERVAL_MS'
): number | undefined {
  if (!isTestMode()) return undefined
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : undefined
}
