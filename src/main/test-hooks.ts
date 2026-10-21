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
    makeDefaultEmailApp: 0
  }
  return holder.shiftedTestRecords
}
