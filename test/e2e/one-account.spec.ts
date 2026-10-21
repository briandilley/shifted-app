import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import type { FakeGoogleServer } from '../fake-google/server'
import {
  expect,
  findPage,
  launchShifted,
  mainWindowPage,
  test,
  visibleMainWindowPages,
  windowCount
} from './fixtures'

interface ConfigFile {
  version: number
  accounts: { id: string; email: string; lastGoogleApp: string }[]
}

function readConfig(userDataDir: string): ConfigFile {
  return JSON.parse(readFileSync(join(userDataDir, 'config.json'), 'utf8')) as ConfigFile
}

function isFakeGmail(fakeGoogle: FakeGoogleServer): (url: string) => boolean {
  return (url) => url.startsWith(`${fakeGoogle.url}/gmail/`)
}

/** Wait until the main window shows the fake Gmail, and no other window is open. */
async function expectFakeGmailInMainWindow(
  app: ElectronApplication,
  fakeGoogle: FakeGoogleServer
): Promise<void> {
  await expect.poll(() => windowCount(app)).toBe(1)
  await expect.poll(() => visibleMainWindowPages(app)).toEqual([`${fakeGoogle.url}/gmail/`])
  const gmail = await findPage(app, isFakeGmail(fakeGoogle))
  await expect(gmail.getByRole('heading', { name: 'Fake Gmail' })).toBeVisible()
}

/** Click "Sign in" on the fake sign-in page of the open sign-in window. */
async function signInOnFakePage(
  app: ElectronApplication,
  fakeGoogle: FakeGoogleServer
): Promise<void> {
  await expect.poll(() => windowCount(app)).toBe(2)
  const topLine = await findPage(app, (url) => url.endsWith('#sign-in'))
  const help =
    process.platform === 'win32'
      ? 'If Google asks for a passkey, Windows Hello opens.'
      : 'Passkeys do not work in Shifted on this computer. If Google asks for a passkey, click "Try another way" and use your password.'
  await expect(topLine.getByText(help)).toBeVisible()

  const signInPage = await findPage(app, (url) => url === `${fakeGoogle.url}/signin`)
  await signInPage.getByRole('button', { name: 'Sign in' }).click()
}

/** Click "Add account", then sign in on the fake sign-in page. */
async function addAccountAndSignIn(
  app: ElectronApplication,
  mainWindow: Page,
  fakeGoogle: FakeGoogleServer
): Promise<void> {
  await mainWindow.getByRole('button', { name: 'Add account' }).click()
  await expect(mainWindow.getByText('Signing in…')).toBeVisible()
  await signInOnFakePage(app, fakeGoogle)
  await expectFakeGmailInMainWindow(app, fakeGoogle)
}

/** Make the confirmation dialog of "Remove account" answer with this button. */
async function answerRemoveDialog(
  app: ElectronApplication,
  button: 'Remove' | 'Cancel'
): Promise<void> {
  await app.evaluate(
    ({ dialog }, response) => {
      const answer = (): Promise<Electron.MessageBoxReturnValue> =>
        Promise.resolve({ response, checkboxChecked: false })
      dialog.showMessageBox = answer as typeof dialog.showMessageBox
    },
    button === 'Remove' ? 0 : 1
  )
}

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
  await expect(mainWindow.getByText('test@example.com')).toBeVisible()
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
    await expectFakeGmailInMainWindow(second, fakeGoogle)
    await expect(mainWindow.getByText('test@example.com')).toBeVisible()
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
  await expectFakeGmailInMainWindow(shifted, fakeGoogle)
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

  // Cancel keeps the account.
  await answerRemoveDialog(shifted, 'Cancel')
  await mainWindow.getByRole('button', { name: 'Remove account' }).click()
  await expect(mainWindow.getByRole('button', { name: 'Remove account' })).toBeVisible()
  expect(readConfig(userDataDir).accounts).toHaveLength(1)

  await answerRemoveDialog(shifted, 'Remove')
  await mainWindow.getByRole('button', { name: 'Remove account' }).click()
  await expect(mainWindow.getByText('No accounts yet')).toBeVisible()
  await expect.poll(() => existsSync(folder ?? '')).toBe(false)
  expect(readConfig(userDataDir).accounts).toEqual([])
  await expect.poll(() => visibleMainWindowPages(shifted)).toEqual([])
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
  await expect.poll(() => existsSync(folder ?? '')).toBe(false)
})
