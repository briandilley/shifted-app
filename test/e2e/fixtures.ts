import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'
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
    const page = await shifted.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  }
})

export { expect } from '@playwright/test'
