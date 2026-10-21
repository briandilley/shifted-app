import {
  test as base,
  expect,
  _electron,
  type ElectronApplication,
  type Locator,
  type Page
} from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { FAKE_ADDRESS, startFakeGoogle, type FakeGoogleServer } from '../fake-google/server'

export const APP_ROOT = resolve(__dirname, '../..')

export interface ShiftedFixtures {
  /** The fake Google test server of this test. */
  fakeGoogle: FakeGoogleServer
  /** The user data folder of this test. Each test gets its own new folder. */
  userDataDir: string
  /** Shifted, started from the build in `out/` with `SHIFTED_TEST_SERVER` set. */
  shifted: ElectronApplication
  /** The page of the main window. */
  mainWindow: Page
}

/** Start the built Shifted with the fake Google server and a user data folder. */
export async function launchShifted(
  fakeGoogle: FakeGoogleServer,
  userDataDir: string
): Promise<ElectronApplication> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  delete env['ELECTRON_RENDERER_URL']
  delete env['ELECTRON_RUN_AS_NODE']
  env['SHIFTED_TEST_SERVER'] = fakeGoogle.url
  env['SHIFTED_USER_DATA_DIR'] = userDataDir
  return _electron.launch({ args: [APP_ROOT], cwd: APP_ROOT, env })
}

export const test = base.extend<ShiftedFixtures>({
  // eslint-disable-next-line no-empty-pattern
  fakeGoogle: async ({}, use) => {
    const server = await startFakeGoogle()
    await use(server)
    await server.close()
  },
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'shifted-e2e-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },
  shifted: async ({ fakeGoogle, userDataDir }, use) => {
    const app = await launchShifted(fakeGoogle, userDataDir)
    await use(app)
    await app.close()
  },
  mainWindow: async ({ shifted }, use) => {
    await use(await mainWindowPage(shifted))
  }
})

/** Wait for an open page of Shifted whose URL matches, and return it. */
export async function findPage(
  app: ElectronApplication,
  match: (url: string) => boolean,
  timeout = 15_000
): Promise<Page> {
  const find = (): Page | undefined =>
    app.windows().find((page) => !page.isClosed() && match(page.url()))
  await expect.poll(() => find() !== undefined, { timeout }).toBe(true)
  const page = find()
  if (!page) throw new Error('The page closed.')
  return page
}

/** The React screen of the main window. */
export async function mainWindowPage(app: ElectronApplication): Promise<Page> {
  const page = await findPage(
    app,
    (url) => url.startsWith('file:') && url.includes('/renderer/index.html') && !url.includes('#')
  )
  await page.waitForLoadState('domcontentloaded')
  return page
}

/** The number of open windows of Shifted. */
export function windowCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
}

/**
 * The URLs of the Google pages that show in the main window: the visible child views of
 * the main window. The main window is the only window whose screen has no URL hash.
 */
export function visibleMainWindowPages(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ BrowserWindow, WebContentsView }) => {
    const main = BrowserWindow.getAllWindows().find(
      (window) => !window.webContents.getURL().includes('#')
    )
    if (!main) return []
    return main.contentView.children
      .filter((view): view is Electron.WebContentsView => view instanceof WebContentsView)
      .filter((view) => view.getVisible() && view.getBounds().height > 0)
      .map((view) => view.webContents.getURL())
  })
}

/** What the content area shows: the Google app in the one visible view of the main window. */
export interface VisibleGoogleApp {
  url: string
  title: string
  /** The address that the fake page shows. */
  address: string | null
  /** The value of `window.shiftedTestMarker` in the page. A reload clears it. */
  marker: unknown
}

/**
 * Run a script in the one visible view of the main window.
 *
 * @returns The result, or `null` if no view or more than one view is visible.
 */
export function evaluateInContentArea(app: ElectronApplication, script: string): Promise<unknown> {
  return app.evaluate(async ({ BrowserWindow, WebContentsView }, code) => {
    const main = BrowserWindow.getAllWindows().find(
      (window) => !window.webContents.getURL().includes('#')
    )
    const visible = (main?.contentView.children ?? [])
      .filter((view): view is Electron.WebContentsView => view instanceof WebContentsView)
      .filter((view) => view.getVisible() && view.getBounds().height > 0)
    const [view] = visible
    if (!view || visible.length !== 1) return null
    return view.webContents.executeJavaScript(code) as Promise<unknown>
  }, script)
}

/** The Google app that the content area shows, or `null` if it shows none. */
export async function visibleGoogleApp(app: ElectronApplication): Promise<VisibleGoogleApp | null> {
  const value = await evaluateInContentArea(
    app,
    `({
      url: location.href,
      title: document.title,
      address: document.getElementById('address')?.textContent ?? null,
      marker: window.shiftedTestMarker ?? null
    })`
  )
  return value as VisibleGoogleApp | null
}

export interface ConfigFile {
  version: number
  general: { askWhereToSave: boolean }
  accounts: {
    id: string
    email: string
    nickname: string
    color: string
    order: number
    lastGoogleApp: string
    pagePermissions: Record<string, string>
    unreadCountSource?: string
    automaticFeed?: string | null
  }[]
}

export function readConfig(userDataDir: string): ConfigFile {
  return JSON.parse(readFileSync(join(userDataDir, 'config.json'), 'utf8')) as ConfigFile
}

/** The email addresses of the accounts in `config.json`, in the order of the sidebar. */
export function configEmails(userDataDir: string): string[] {
  return [...readConfig(userDataDir).accounts]
    .sort((a, b) => a.order - b.order)
    .map((account) => account.email)
}

/** The sidebar of the main window. */
export function sidebar(mainWindow: Page): Locator {
  return mainWindow.getByRole('navigation', { name: 'Accounts' })
}

/** The button of an account in the sidebar, by its nickname or address. */
export function sidebarAccount(mainWindow: Page, name: string): Locator {
  return sidebar(mainWindow).getByRole('button', { name })
}

/** The accessible names of the accounts in the sidebar, from top to bottom. */
export function sidebarAccountNames(mainWindow: Page): Promise<string[]> {
  return sidebar(mainWindow)
    .locator('button[data-account-id]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? ''))
}

/** The text of the passkey help in the top line of the sign-in window. */
export const PASSKEY_HELP =
  process.platform === 'win32'
    ? 'If Google asks for a passkey, Windows Hello opens.'
    : 'Passkeys do not work in Shifted on this computer. If Google asks for a passkey, click "Try another way" and use your password.'

/**
 * Sign in on the fake sign-in page of the open sign-in window.
 *
 * @param email The address to sign in with. Without it, the fake page uses its default.
 */
export async function signInOnFakePage(
  app: ElectronApplication,
  fakeGoogle: FakeGoogleServer,
  email?: string
): Promise<void> {
  await expect.poll(() => windowCount(app)).toBe(2)
  const topLine = await findPage(app, (url) => url.endsWith('#sign-in'))
  await expect(topLine.getByText(PASSKEY_HELP)).toBeVisible()

  const signInPage = await findPage(app, (url) => url === `${fakeGoogle.url}/signin`)
  if (email !== undefined) await signInPage.getByLabel('Email').fill(email)
  await signInPage.getByRole('button', { name: 'Sign in' }).click()
}

/** Wait until the content area shows the fake Gmail of this address, and no other window is open. */
export async function expectFakeGmail(
  app: ElectronApplication,
  fakeGoogle: FakeGoogleServer,
  email = FAKE_ADDRESS
): Promise<void> {
  await expect.poll(() => windowCount(app)).toBe(1)
  await expect
    .poll(() => visibleGoogleApp(app))
    .toMatchObject({ url: `${fakeGoogle.url}/gmail/`, address: email })
}

/** Click "Add account", sign in on the fake sign-in page, and wait for Gmail. */
export async function addAccountAndSignIn(
  app: ElectronApplication,
  mainWindow: Page,
  fakeGoogle: FakeGoogleServer,
  email?: string
): Promise<void> {
  await mainWindow.getByRole('button', { name: 'Add account' }).click()
  await expect(mainWindow.getByText('Signing in…')).toBeVisible()
  await signInOnFakePage(app, fakeGoogle, email)
  await expectFakeGmail(app, fakeGoogle, email)
  // Shifted reads the address from the feed and shows it in the sidebar.
  await expect(sidebarAccount(mainWindow, email ?? FAKE_ADDRESS)).toBeVisible()
}

/** Make the confirmation dialog of "Remove" answer with this button. */
export async function answerRemoveDialog(
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

interface MenuStore {
  shiftedTestMenu?: Electron.Menu | null
}

/**
 * Right-click an account in the sidebar and choose an item of its context menu.
 *
 * A native menu cannot be clicked from Playwright, so the test replaces `Menu.popup`
 * in the main process. It keeps the menu, and the test clicks the item in its place.
 *
 * @returns The labels of the menu items.
 */
export async function chooseFromAccountMenu(
  app: ElectronApplication,
  account: Locator,
  label: string
): Promise<string[]> {
  await app.evaluate(({ Menu }) => {
    const store = globalThis as MenuStore
    store.shiftedTestMenu = null
    Menu.prototype.popup = function (this: Electron.Menu): void {
      store.shiftedTestMenu = this
    }
  })
  await account.click({ button: 'right' })
  await expect
    .poll(() => app.evaluate(() => Boolean((globalThis as MenuStore).shiftedTestMenu)))
    .toBe(true)
  return app.evaluate((_electron, wanted) => {
    const store = globalThis as MenuStore
    const menu = store.shiftedTestMenu
    store.shiftedTestMenu = null
    const items = menu?.items ?? []
    const item = items.find((candidate) => candidate.label === wanted)
    if (!item) throw new Error(`The context menu has no item "${wanted}".`)
    if (!item.enabled) throw new Error(`The item "${wanted}" is not enabled.`)
    ;(item.click as () => void)()
    return items.filter((candidate) => candidate.type !== 'separator').map((i) => i.label)
  }, label)
}

/** Click the menu item that opens the configuration window, as Cmd+, does. */
export async function openSettingsFromAppMenu(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('settings')
    if (!item) throw new Error('The app menu has no Settings item.')
    ;(item.click as () => void)()
  })
}

/** The page of the configuration window. */
export function settingsWindowPage(app: ElectronApplication): Promise<Page> {
  return findPage(app, (url) => url.startsWith('file:') && url.includes('#settings'))
}

/** The page of the Gmail view in the main window, by its URL. */
export function gmailViewPage(
  app: ElectronApplication,
  fakeGoogle: FakeGoogleServer
): Promise<Page> {
  return findPage(app, (url) => url === `${fakeGoogle.url}/gmail/`)
}

/** The unread badge on the avatar of an account in the sidebar. */
export function unreadBadge(mainWindow: Page, name: string): Locator {
  return sidebarAccount(mainWindow, name).locator('[data-unread-badge]')
}

/** The total that the app badge shows now (see `src/main/app-badge.ts`). */
export function appBadgeTotal(app: ElectronApplication): Promise<number> {
  return app.evaluate(
    () =>
      (globalThis as { shiftedTestRecords?: { appBadgeTotal: number } }).shiftedTestRecords
        ?.appBadgeTotal ?? 0
  )
}

/** What Shifted recorded in test mode in place of the default browser and the file manager. */
export interface TestRecords {
  openExternal: string[]
  showItemInFolder: string[]
  downloadNotifications: number
}

interface TestRecordsHolder {
  shiftedTestRecords?: {
    openExternal: string[]
    showItemInFolder: string[]
    downloadNotifications: unknown[]
  }
}

/** Read the test records of Shifted (see `src/main/test-hooks.ts`). */
export function testRecords(app: ElectronApplication): Promise<TestRecords> {
  return app.evaluate(() => {
    const records = (globalThis as TestRecordsHolder).shiftedTestRecords
    return {
      openExternal: [...(records?.openExternal ?? [])],
      showItemInFolder: [...(records?.showItemInFolder ?? [])],
      downloadNotifications: records?.downloadNotifications.length ?? 0
    }
  })
}

export { expect } from '@playwright/test'
