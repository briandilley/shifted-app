/**
 * "Export configuration…" and "Email it to myself" of the General page. See "Move to
 * another computer" in `docs/spec/PRODUCT.md`.
 *
 * Shifted writes an exported configuration only after a click on "Export configuration…".
 * "Email it to myself" only opens a new message in Gmail. It never sends mail.
 */
import { app, dialog, type BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { ExportFileResult } from '../shared/api'
import type { Accounts } from './accounts'
import { emailLink, exportFileName, toFileForm, toTextForm } from './config-transfer'

/**
 * Show a save dialog in the Documents folder, with the name `Shifted configuration
 * <YYYY-MM-DD>.json`, then write the file form there.
 */
export async function exportConfigurationToFile(
  accounts: Accounts,
  parent: BrowserWindow | null
): Promise<ExportFileResult> {
  const now = new Date()
  const options: Electron.SaveDialogOptions = {
    title: 'Export configuration',
    defaultPath: join(app.getPath('documents'), exportFileName(now)),
    filters: [{ name: 'Shifted configuration', extensions: ['json'] }]
  }
  const { canceled, filePath } =
    parent && !parent.isDestroyed()
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return { kind: 'canceled' }
  try {
    await writeFile(filePath, toFileForm(accounts.exportConfiguration(now)), 'utf8')
  } catch (error) {
    console.error('Shifted could not save the exported configuration:', error)
    return { kind: 'error', message: `Shifted could not save ${basename(filePath)}.` }
  }
  return { kind: 'saved', fileName: basename(filePath) }
}

/**
 * Open a new message to the address of the selected account, in Gmail of that account,
 * with the text form of the exported configuration. The person clicks Send.
 *
 * @param compose Opens a `mailto:` link in Gmail of the account and brings the main
 *   window to the front: the compose path of `mailto:` links.
 * @returns False when the selected account has no address or is not signed in.
 */
export function emailConfigurationToSelf(
  accounts: Accounts,
  compose: (accountId: string, mailtoUrl: string) => void
): boolean {
  const state = accounts.state()
  const account = state.accounts.find((candidate) => candidate.id === state.selectedAccountId)
  if (!account || !account.email || account.status !== 'signed-in') return false
  const link = emailLink(account.email, toTextForm(accounts.exportConfiguration()))
  compose(account.id, link)
  return true
}
