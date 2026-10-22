import { existsSync } from 'node:fs'
import type { ElectronApplication } from '@playwright/test'
import {
  addAccountAndSignIn,
  answerRemoveDialog,
  chooseFromAccountMenu,
  expect,
  expectFakeGmail,
  expectSessionFolderDeleted,
  findPage,
  launchShifted,
  mainWindowPage,
  readConfig,
  sidebarAccount,
  signInOnFakePage,
  test,
  visibleMainWindowPages
} from './fixtures'

/** The partition folder of the session of an account. */
function partitionFolder(app: ElectronApplication, accountId: string): Promise<string | null> {
  return app.evaluate(
    ({ session }, id) => session.fromPartition(`persist:account-${id}`).storagePath,
    accountId
  )
}

test('add an account: sign in, the sign-in window closes, and the main window shows Gmail', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)

  // Shifted reads the email address from the title of the Atom feed and saves it.
  const config = readConfig(userDataDir)
  expect(config.version).toBe(1)
  expect(config.accounts).toHaveLength(1)
  expect(config.accounts[0]).toMatchObject({ email: 'test@example.com', lastGoogleApp: 'gmail' })

  // The account has its own persistent session with the user agent of Shifted.
  const accountId = config.accounts[0]?.id ?? ''
  const userAgent = await shifted.evaluate(
    ({ session }, id) => session.fromPartition(`persist:account-${id}`).getUserAgent(),
    accountId
  )
  expect(userAgent).toMatch(/\bShifted\/\d+\.\d+\.\d+/)
  expect(userAgent).toMatch(/\bElectron\/\d+/)
})

test('the account is still signed in after Shifted restarts', async ({
  fakeGoogle,
  userDataDir
}) => {
  const first = await launchShifted(fakeGoogle, userDataDir)
  try {
    await addAccountAndSignIn(first, await mainWindowPage(first), fakeGoogle)
    await expect.poll(() => readConfig(userDataDir).accounts[0]?.email).toBe('test@example.com')
  } finally {
    await first.close()
  }

  const second = await launchShifted(fakeGoogle, userDataDir)
  try {
    const mainWindow = await mainWindowPage(second)
    await expectFakeGmail(second, fakeGoogle)
    await expect(sidebarAccount(mainWindow, 'test@example.com')).toBeVisible()
    // No sign-in window opened.
    expect(second.windows().some((page) => page.url().includes('#sign-in'))).toBe(false)
  } finally {
    await second.close()
  }
})

test('a signed-out account shows "This account is signed out." and can sign in again', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)

  // Clear the fake cookie, then reload Gmail. The fake Gmail goes to the sign-in page.
  await fakeGoogle.signOut()
  await shifted.evaluate(({ webContents }, gmailUrl) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL() === gmailUrl)
      ?.reload()
  }, `${fakeGoogle.url}/gmail/`)

  await expect(mainWindow.getByText('This account is signed out.')).toBeVisible()
  await expect.poll(() => visibleMainWindowPages(shifted)).toEqual([])
  // Google's sign-in page never shows in the main window.
  expect(shifted.windows().some((page) => page.url() === `${fakeGoogle.url}/signin`)).toBe(false)

  await mainWindow.getByRole('button', { name: 'Sign in again' }).click()
  await expect(mainWindow.getByText('Signing in…')).toBeVisible()
  await signInOnFakePage(shifted, fakeGoogle)
  await expectFakeGmail(shifted, fakeGoogle)
  expect(readConfig(userDataDir).accounts).toHaveLength(1)
})

test('remove the account: Shifted asks to confirm, then deletes its partition folder', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
  const accountId = readConfig(userDataDir).accounts[0]?.id ?? ''
  const folder = await partitionFolder(shifted, accountId)
  expect(folder).toBeTruthy()
  expect(existsSync(folder ?? '')).toBe(true)
  const account = sidebarAccount(mainWindow, 'test@example.com')

  // Cancel keeps the account.
  await answerRemoveDialog(shifted, 'Cancel')
  await chooseFromAccountMenu(shifted, account, 'Remove')
  await expect(account).toBeVisible()
  expect(readConfig(userDataDir).accounts).toHaveLength(1)

  await answerRemoveDialog(shifted, 'Remove')
  await chooseFromAccountMenu(shifted, account, 'Remove')
  await expect(mainWindow.getByText('No accounts yet')).toBeVisible()
  await expect(account).toHaveCount(0)
  expect(readConfig(userDataDir).accounts).toEqual([])
  await expect.poll(() => visibleMainWindowPages(shifted)).toEqual([])
  await expectSessionFolderDeleted(shifted, fakeGoogle, userDataDir, folder ?? '')
})

test('closing the sign-in window of a new account removes the account', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await mainWindow.getByRole('button', { name: 'Add account' }).click()
  await expect(mainWindow.getByText('Signing in…')).toBeVisible()
  await findPage(shifted, (url) => url === `${fakeGoogle.url}/signin`)
  const accountId = readConfig(userDataDir).accounts[0]?.id ?? ''
  const folder = await partitionFolder(shifted, accountId)

  await shifted.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes('#sign-in'))
      ?.close()
  })

  await expect(mainWindow.getByText('No accounts yet')).toBeVisible()
  await expect.poll(() => readConfig(userDataDir).accounts).toEqual([])
  await expectSessionFolderDeleted(shifted, fakeGoogle, userDataDir, folder ?? '')
})
