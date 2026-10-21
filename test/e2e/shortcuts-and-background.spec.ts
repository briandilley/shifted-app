import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import type { FakeGoogleServer } from '../fake-google/server'
import {
  addAccountAndSignIn,
  appBadgeTotal,
  evaluateInContentArea,
  expect,
  findPage,
  launchShifted,
  mainWindowPage,
  openSettingsFromAppMenu,
  readConfig,
  recordedNotifications,
  settingsWindowPage,
  sidebarAccount,
  test,
  unreadBadge,
  visibleGoogleApp,
  windowCount
} from './fixtures'

const ONE = 'one@example.com'
const TWO = 'two@example.com'
const THREE = 'three@example.com'

/** The modifier that stands for Cmd: Cmd on macOS, Ctrl on Windows and Linux. */
const MOD = process.platform === 'darwin' ? 'meta' : 'control'

/**
 * Press a key in the Google app of an account, as the keyboard does: with
 * `webContents.sendInputEvent`, which goes through `before-input-event` like a real key.
 * Playwright's keyboard sends its keys past `before-input-event`, so it cannot test this.
 *
 * @param keyCode An Electron key code, for example `2`, `R`, `Tab`, or `,`.
 * @param modifiers For example `['meta', 'shift']`.
 */
async function pressKey(
  app: ElectronApplication,
  fakeGoogle: FakeGoogleServer,
  address: string,
  googleApp: 'gmail' | 'calendar',
  keyCode: string,
  modifiers: string[] = []
): Promise<void> {
  const url = `${fakeGoogle.url}/${googleApp}/`
  await googlePage(app, fakeGoogle, address, googleApp)
  const sent = await app.evaluate(
    async ({ webContents }, key) => {
      for (const contents of webContents.getAllWebContents()) {
        if (contents.getURL() !== key.url) continue
        const shown = (await contents
          .executeJavaScript(`document.getElementById('address')?.textContent ?? ''`)
          .catch(() => '')) as string
        if (shown !== key.address) continue
        const modifiers = key.modifiers as Electron.KeyboardInputEvent['modifiers']
        contents.sendInputEvent({ type: 'keyDown', keyCode: key.keyCode, modifiers })
        contents.sendInputEvent({ type: 'keyUp', keyCode: key.keyCode, modifiers })
        return true
      }
      return false
    },
    { url, address, keyCode, modifiers }
  )
  if (!sent) throw new Error(`No ${googleApp} page of ${address}.`)
}

/**
 * The page of a Google app view of one account. The fake pages of all accounts have the
 * same URL, so the address in the page tells them apart.
 */
async function googlePage(
  app: ElectronApplication,
  fakeGoogle: FakeGoogleServer,
  address: string,
  googleApp: 'gmail' | 'calendar' = 'gmail'
): Promise<Page> {
  const url = `${fakeGoogle.url}/${googleApp}/`
  const find = async (): Promise<Page | undefined> => {
    for (const page of app.windows()) {
      if (page.isClosed() || page.url() !== url) continue
      const shown = await page
        .evaluate(() => document.getElementById('address')?.textContent ?? null)
        .catch(() => null)
      if (shown === address) return page
    }
    return undefined
  }
  await expect.poll(async () => (await find()) !== undefined, { timeout: 15_000 }).toBe(true)
  const page = await find()
  if (!page) throw new Error(`No ${googleApp} page of ${address}.`)
  return page
}

/** The Google apps that have a view in the main window: the URL path and the address. */
function loadedGoogleApps(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(async ({ BrowserWindow, WebContentsView }) => {
    const main = BrowserWindow.getAllWindows().find(
      (window) => !window.webContents.getURL().includes('#')
    )
    const views = (main?.contentView.children ?? []).filter(
      (view): view is Electron.WebContentsView => view instanceof WebContentsView
    )
    const apps = await Promise.all(
      views.map(async (view) => {
        const address = (await view.webContents
          .executeJavaScript(`document.getElementById('address')?.textContent ?? ''`)
          .catch(() => '')) as string
        return `${new URL(view.webContents.getURL()).pathname}${address}`
      })
    )
    return apps.sort()
  })
}

/** True when the main window shows on screen. */
function mainWindowVisible(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !window.webContents.getURL().includes('#'))
        ?.isVisible() ?? false
  )
}

test('Cmd+2 selects account 2, Ctrl+Tab the next account, and Gmail keeps its own keys', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  for (const email of [ONE, TWO, THREE]) {
    await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, email)
  }
  await sidebarAccount(mainWindow, ONE).click()
  await expect(sidebarAccount(mainWindow, ONE)).toHaveAttribute('aria-current', 'true')

  // The focus is in Gmail of account 1. Record the keys that the page gets.
  const gmailOne = await googlePage(shifted, fakeGoogle, ONE)
  await gmailOne.evaluate(() => {
    const keys: string[] = []
    ;(window as { shiftedKeys?: string[] }).shiftedKeys = keys
    window.addEventListener('keydown', (event) => keys.push(event.code), true)
  })

  await pressKey(shifted, fakeGoogle, ONE, 'gmail', '2', [MOD])
  await expect(sidebarAccount(mainWindow, TWO)).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => visibleGoogleApp(shifted)).toMatchObject({ address: TWO })

  await pressKey(shifted, fakeGoogle, TWO, 'gmail', 'Tab', ['control'])
  await expect(sidebarAccount(mainWindow, THREE)).toHaveAttribute('aria-current', 'true')

  // Next and previous wrap around.
  await pressKey(shifted, fakeGoogle, THREE, 'gmail', 'Tab', ['control'])
  await expect(sidebarAccount(mainWindow, ONE)).toHaveAttribute('aria-current', 'true')
  await pressKey(shifted, fakeGoogle, ONE, 'gmail', 'Tab', ['control', 'shift'])
  await expect(sidebarAccount(mainWindow, THREE)).toHaveAttribute('aria-current', 'true')

  // No account at place 9: nothing happens.
  await pressKey(shifted, fakeGoogle, THREE, 'gmail', '9', [MOD])
  await expect(sidebarAccount(mainWindow, THREE)).toHaveAttribute('aria-current', 'true')

  // Gmail got none of the shortcuts, but it gets Cmd+Shift+C (Cc) and other keys.
  await pressKey(shifted, fakeGoogle, ONE, 'gmail', 'C', [MOD, 'shift'])
  await pressKey(shifted, fakeGoogle, ONE, 'gmail', 'J')
  await expect
    .poll(() => gmailOne.evaluate(() => (window as { shiftedKeys?: string[] }).shiftedKeys))
    .toEqual(['KeyC', 'KeyJ'])
})

test('Cmd+Shift+2 selects the Calendar tab, and Cmd+R and Cmd+, work from a Google page', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await pressKey(shifted, fakeGoogle, ONE, 'gmail', '2', [MOD, 'shift'])
  await expect(mainWindow.getByRole('tab', { name: 'Calendar' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({ url: `${fakeGoogle.url}/calendar/`, address: ONE })

  // Cmd+R reloads the Google app in the content area: the reload clears the marker.
  await evaluateInContentArea(shifted, 'window.shiftedTestMarker = 1')
  await expect.poll(() => visibleGoogleApp(shifted)).toMatchObject({ marker: 1 })
  await pressKey(shifted, fakeGoogle, ONE, 'calendar', 'R', [MOD])
  await expect.poll(() => visibleGoogleApp(shifted)).toMatchObject({ marker: null })

  await pressKey(shifted, fakeGoogle, ONE, 'calendar', '1', [MOD, 'shift'])
  await expect(mainWindow.getByRole('tab', { name: 'Gmail' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  // Cmd+, opens the configuration window.
  await pressKey(shifted, fakeGoogle, ONE, 'gmail', ',', [MOD])
  const settings = await settingsWindowPage(shifted)
  await expect(settings.getByRole('heading', { name: 'General' })).toBeVisible()

  // The app menu shows the keys of the shortcut table.
  const accelerators = await shifted.evaluate(({ Menu }) =>
    ['account-1', 'next-account', 'calendar-tab', 'reload', 'add-account'].map(
      (id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.accelerator
    )
  )
  expect(accelerators).toEqual([
    'CommandOrControl+1',
    'Control+Tab',
    'CommandOrControl+Shift+2',
    'CommandOrControl+R',
    'CommandOrControl+Shift+N'
  ])
})

test.describe('with short test timers', () => {
  test.use({
    shiftedEnv: { SHIFTED_TEST_SLEEP_MS: '1500', SHIFTED_TEST_READ_INTERVAL_MS: '1000' }
  })

  test('"Selected account only": account 2 sleeps after you leave it, and its badge still changes', async ({
    shifted,
    mainWindow,
    fakeGoogle,
    userDataDir
  }) => {
    await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
    await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, TWO)
    // "Everything" is the default: Gmail and Calendar of both accounts load.
    await expect
      .poll(() => loadedGoogleApps(shifted))
      .toEqual([`/calendar/${ONE}`, `/calendar/${TWO}`, `/gmail/${ONE}`, `/gmail/${TWO}`])

    await openSettingsFromAppMenu(shifted)
    const settings = await settingsWindowPage(shifted)
    const backgroundLoading = settings.getByLabel('Background loading')
    await expect(backgroundLoading).toHaveValue('everything')
    await backgroundLoading.selectOption({ label: 'Selected account only' })
    await expect
      .poll(() => readConfig(userDataDir).general.backgroundLoading)
      .toBe('selected-account-only')

    // Leave account 2. After the timer, its views are closed.
    await sidebarAccount(mainWindow, ONE).click()
    await expect
      .poll(() => loadedGoogleApps(shifted), { timeout: 15_000 })
      .toEqual([`/calendar/${ONE}`, `/gmail/${ONE}`])

    // The feed polling continues: a change to the fake feed still changes its badge.
    await fakeGoogle.setFeed({ address: TWO, feed: 'primary', count: 4 })
    await expect(unreadBadge(mainWindow, TWO)).toHaveText('4', { timeout: 15_000 })

    // Open the sleeping account: its Gmail loads again.
    await sidebarAccount(mainWindow, TWO).click()
    await expect
      .poll(() => visibleGoogleApp(shifted))
      .toMatchObject({ url: `${fakeGoogle.url}/gmail/`, address: TWO })

    // Back to "Everything": the apps of account 1 wake, and nothing sleeps.
    await backgroundLoading.selectOption({ label: 'Everything' })
    await expect
      .poll(() => loadedGoogleApps(shifted))
      .toEqual([`/calendar/${ONE}`, `/calendar/${TWO}`, `/gmail/${ONE}`, `/gmail/${TWO}`])
  })

  test('closing the main window hides it, and new-mail notifications continue', async ({
    shifted,
    mainWindow,
    fakeGoogle
  }) => {
    await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
    await expect.poll(() => mainWindowVisible(shifted)).toBe(true)

    // On Linux with no tray, for example under `xvfb-run`, closing the main window quits
    // Shifted, because nothing could show the window again.
    const hasTray = await shifted.evaluate(
      () =>
        (globalThis as { shiftedTestRecords?: { hasTray: boolean } }).shiftedTestRecords?.hasTray ??
        false
    )
    if (process.platform === 'linux' && !hasTray) {
      const quit = new Promise<void>((resolve) => shifted.once('close', () => resolve()))
      await shifted.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((window) => !window.webContents.getURL().includes('#'))
          ?.close()
      })
      await quit
      return
    }

    await shifted.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => !window.webContents.getURL().includes('#'))
        ?.close()
    })
    await expect.poll(() => mainWindowVisible(shifted)).toBe(false)
    // Shifted keeps running, with its main window.
    expect(await windowCount(shifted)).toBe(1)

    await fakeGoogle.addFeedEntry({
      address: ONE,
      entry: {
        id: 'late',
        title: 'Sent while the window was closed',
        authorName: 'Ana',
        authorEmail: 'ana@example.com',
        issued: '2026-10-21T09:00:00Z'
      }
    })
    await expect
      .poll(() => recordedNotifications(shifted), { timeout: 15_000 })
      .toMatchObject([
        { kind: 'new-mail', title: ONE, body: 'Ana\nSent while the window was closed' }
      ])

    // macOS: a click on the Dock icon (`activate`) shows the main window again.
    await shifted.evaluate(({ app }) => app.emit('activate'))
    await expect.poll(() => mainWindowVisible(shifted)).toBe(true)
  })

  test('"Open at login" saves the choice, and Shifted opened at login starts hidden', async ({
    fakeGoogle,
    userDataDir
  }) => {
    const first = await launchShifted(fakeGoogle, userDataDir)
    try {
      const mainWindow = await mainWindowPage(first)
      await addAccountAndSignIn(first, mainWindow, fakeGoogle, ONE)

      await openSettingsFromAppMenu(first)
      const settings = await settingsWindowPage(first)
      const openAtLogin = settings.getByRole('switch', { name: 'Open at login' })
      await expect(openAtLogin).not.toBeChecked()
      // The switch shows the saved value, so it changes after the main process saves it.
      await openAtLogin.click()
      await expect(openAtLogin).toBeChecked()
      await expect.poll(() => readConfig(userDataDir).general.openAtLogin).toBe(true)
      // In test mode, Shifted only records the request. It never changes the login items.
      expect(
        await first.evaluate(
          () =>
            (globalThis as { shiftedTestRecords?: { openAtLogin: boolean[] } }).shiftedTestRecords
              ?.openAtLogin
        )
      ).toEqual([true])
    } finally {
      await first.close()
    }

    // Start Shifted as the login item does.
    await fakeGoogle.setFeed({ address: ONE, feed: 'primary', count: 6 })
    const atLogin = await launchShifted(fakeGoogle, userDataDir, {
      shiftedArgs: ['--opened-at-login'],
      shiftedEnv: { SHIFTED_TEST_READ_INTERVAL_MS: '1000' }
    })
    try {
      await mainWindowPage(atLogin)
      // The feeds start at once, with the main window hidden.
      await expect.poll(() => appBadgeTotal(atLogin), { timeout: 15_000 }).toBe(6)
      await findPage(atLogin, (url) => url === `${fakeGoogle.url}/gmail/`)
      expect(await mainWindowVisible(atLogin)).toBe(false)
    } finally {
      await atLogin.close()
    }
  })
})

test('the main window comes back at its saved size and position', async ({
  fakeGoogle,
  userDataDir
}) => {
  const first = await launchShifted(fakeGoogle, userDataDir)
  // A place that is not the default (1200 by 800, centered), inside the work area of the
  // main screen. The screen of a test computer can be small (1024 by 768 on the macOS
  // runner of GitHub Actions), and macOS moves a window that does not fit onto the screen.
  const bounds = await first
    .evaluate(({ screen }) => {
      const area = screen.getPrimaryDisplay().workArea
      return {
        x: area.x + 40,
        y: area.y + 30,
        width: Math.max(900, Math.min(1000, area.width - 80)),
        height: Math.max(600, Math.min(700, area.height - 60))
      }
    })
    .catch(async (error: unknown) => {
      await first.close()
      throw error
    })
  try {
    const mainWindow = await mainWindowPage(first)
    await expect(mainWindow.getByText('No accounts yet')).toBeVisible()
    await first.evaluate(({ BrowserWindow }, wanted) => {
      BrowserWindow.getAllWindows()
        .find((window) => !window.webContents.getURL().includes('#'))
        ?.setBounds(wanted)
    }, bounds)
    // Shifted saves a short time after the last change.
    await expect.poll(() => existsSync(join(userDataDir, 'window-state.json'))).toBe(true)
  } finally {
    await first.close()
  }

  const second = await launchShifted(fakeGoogle, userDataDir)
  try {
    await mainWindowPage(second)
    const restored = await second.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !window.webContents.getURL().includes('#'))
        ?.getBounds()
    )
    expect(restored).toEqual(bounds)
  } finally {
    await second.close()
  }
})

test('a main window saved as maximized stays hidden when Shifted opened at login', async ({
  fakeGoogle,
  userDataDir
}) => {
  // On a small screen, for example the 1024 by 768 screen of the macOS runner of GitHub
  // Actions, a new main window fills the work area, and macOS saves it as maximized.
  writeFileSync(
    join(userDataDir, 'window-state.json'),
    JSON.stringify({ bounds: { x: 40, y: 60, width: 1000, height: 700 }, maximized: true })
  )
  const atLogin = await launchShifted(fakeGoogle, userDataDir, {
    shiftedArgs: ['--opened-at-login']
  })
  try {
    const mainWindow = await mainWindowPage(atLogin)
    await expect(mainWindow.getByText('No accounts yet')).toBeAttached()
    expect(await mainWindowVisible(atLogin)).toBe(false)

    // The window comes back maximized when it shows.
    await atLogin.evaluate(({ app }) => app.emit('activate'))
    await expect.poll(() => mainWindowVisible(atLogin)).toBe(true)
    await expect
      .poll(() =>
        atLogin.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => !window.webContents.getURL().includes('#'))
            ?.isMaximized()
        )
      )
      .toBe(true)
  } finally {
    await atLogin.close()
  }
})
