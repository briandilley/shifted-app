// TEMPORARY debug spec for CI. Removed before the final commit.
import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import {
  addAccountAndSignIn,
  answerRemoveDialog,
  chooseFromAccountMenu,
  expect,
  findPage,
  readConfig,
  sidebarAccount,
  test
} from './fixtures'

test('debug sign-in window metrics', async ({ shifted, mainWindow, fakeGoogle }) => {
  await mainWindow.getByRole('button', { name: 'Add account' }).click()
  await findPage(shifted, (url) => url === `${fakeGoogle.url}/signin`)
  const info = await shifted.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find((c) =>
      c.webContents.getURL().includes('#sign-in')
    )
    if (!window) return null
    const display = screen.getDisplayMatching(window.getBounds())
    return {
      content: window.getContentSize(),
      size: window.getSize(),
      bounds: window.getBounds(),
      contentBounds: window.getContentBounds(),
      workArea: display.workArea,
      displayBounds: display.bounds,
      scale: display.scaleFactor,
      primaryWorkArea: screen.getPrimaryDisplay().workArea
    }
  })
  console.log('SIGNIN', JSON.stringify(info))
})

test('debug removal on this platform', async ({ shifted, mainWindow, fakeGoogle, userDataDir }) => {
  const proc = shifted.process()
  proc.stderr?.on('data', (d) => console.log('ERR', String(d)))
  proc.stdout?.on('data', (d) => console.log('OUT', String(d)))
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
  const id = readConfig(userDataDir).accounts[0]?.id ?? ''
  const folder = await shifted.evaluate(
    ({ session }, i) => session.fromPartition(`persist:account-${i}`).storagePath,
    id
  )
  console.log('FOLDER', folder)
  await answerRemoveDialog(shifted, 'Remove')
  const start = Date.now()
  await chooseFromAccountMenu(shifted, sidebarAccount(mainWindow, 'test@example.com'), 'Remove')
  await expect(mainWindow.getByText('No accounts yet')).toBeVisible({ timeout: 60_000 })
  console.log('REMOVED after ms', Date.now() - start)
  const out: string[] = []
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) walk(p)
      else {
        try {
          unlinkSync(p)
          out.push(`deleted ${p}`)
        } catch (error) {
          out.push(`LOCKED ${(error as NodeJS.ErrnoException).code} ${p}`)
        }
      }
    }
  }
  if (folder && existsSync(folder)) walk(folder)
  else out.push('folder gone')
  const report = out
  console.log('REPORT\n' + report.join('\n'))
})
