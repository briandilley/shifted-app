/**
 * Test hooks for the end-to-end tests.
 *
 * In test mode (`SHIFTED_TEST_SERVER` is set), Shifted does not open the default browser
 * and does not open a file manager. It records the request in
 * `globalThis.shiftedTestRecords`, where the end-to-end tests read it with
 * `electronApp.evaluate`.
 */
import type { Notification } from 'electron'
import { isTestMode } from './google-urls'

export interface ShiftedTestRecords {
  /** The URLs that Shifted would open in the default browser. */
  openExternal: string[]
  /** The files that Shifted would show in the file manager. */
  showItemInFolder: string[]
  /** The download notifications that Shifted showed, so that a test can click one. */
  downloadNotifications: Notification[]
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
    downloadNotifications: []
  }
  return holder.shiftedTestRecords
}
