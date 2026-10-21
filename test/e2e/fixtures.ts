import {
  test as base,
  expect,
  _electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { startFakeGoogle, type FakeGoogleServer } from '../fake-google/server'

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
 * the main window.
 */
export function visibleMainWindowPages(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ BrowserWindow, WebContentsView }) => {
    const main = BrowserWindow.getAllWindows().find(
      (window) => !window.webContents.getURL().includes('#sign-in')
    )
    if (!main) return []
    return main.contentView.children
      .filter((view): view is Electron.WebContentsView => view instanceof WebContentsView)
      .filter((view) => view.getVisible() && view.getBounds().height > 0)
      .map((view) => view.webContents.getURL())
  })
}

export { expect } from '@playwright/test'
