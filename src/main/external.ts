/**
 * The places outside Shifted: the default browser and the file manager.
 *
 * In test mode, Shifted only records the request (see `test-hooks.ts`).
 */
import { shell } from 'electron'
import { isDefaultBrowserUrl } from './link-rules'
import { testRecords } from './test-hooks'

/** Open a URL in the default browser. Only `http:` and `https:` URLs open. */
export function openInDefaultBrowser(url: string): void {
  if (!isDefaultBrowserUrl(url)) return
  const records = testRecords()
  if (records) {
    records.openExternal.push(url)
    return
  }
  shell.openExternal(url).catch((error: unknown) => {
    console.error('Shifted could not open the default browser:', error)
  })
}

/** Show a file in Finder, File Explorer, or the file manager. */
export function showInFolder(path: string): void {
  const records = testRecords()
  if (records) {
    records.showItemInFolder.push(path)
    return
  }
  shell.showItemInFolder(path)
}
