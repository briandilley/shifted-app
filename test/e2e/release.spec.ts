/**
 * End-to-end tests for rules of `docs/spec/PRODUCT.md` that the spec trace of prompt 10
 * found with no automated test.
 */
import { existsSync } from 'node:fs'
import { relative, isAbsolute } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import {
  accountIdOf,
  accountPickerPage,
  addAccountAndSignIn,
  answerRemoveDialog,
  chooseFromAccountMenu,
  configEmails,
  evaluateInContentArea,
  expect,
  findPage,
  gmailViewPage,
  openSettingsFromAppMenu,
  readConfig,
  recordedNotifications,
  runSecondInstance,
  settingsWindowPage,
  sidebarAccount,
  test,
  visibleGoogleApp,
  visibleMainWindowPages
} from './fixtures'

const ONE = 'one@example.com'
const TWO = 'two@example.com'

/** The Google apps that have a view in the main window, as `<path><address>`. */
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

/**
 * Make every page permission question answer "Don't allow", and count the questions. A
 * denial never reaches the operating system, so no system dialog shows during the test.
 */
async function answerPermissionQuestions(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ dialog }) => {
    const store = globalThis as { shiftedPermissionQuestions?: string[] }
    store.shiftedPermissionQuestions = []
    const answer = (...args: unknown[]): Promise<Electron.MessageBoxReturnValue> => {
      const options = args.find(
        (arg): arg is Electron.MessageBoxOptions =>
          typeof arg === 'object' && arg !== null && 'message' in arg
      )
      store.shiftedPermissionQuestions?.push(options?.message ?? '')
      return Promise.resolve({ response: 1, checkboxChecked: false })
    }
    dialog.showMessageBox = answer as typeof dialog.showMessageBox
  })
}

function permissionQuestions(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(
    () => (globalThis as { shiftedPermissionQuestions?: string[] }).shiftedPermissionQuestions ?? []
  )
}

test('the sign-in window is 480 by 720 points, with the title "Sign in"', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await mainWindow.getByRole('button', { name: 'Add account' }).click()
  await expect(mainWindow.getByText('Signing in…')).toBeVisible()
  await findPage(shifted, (url) => url === `${fakeGoogle.url}/signin`)
  // macOS fits a window to the screen when it shows, so measure the window after it shows.
  await expect
    .poll(() =>
      shifted.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((candidate) => candidate.webContents.getURL().includes('#sign-in'))
          ?.isVisible()
      )
    )
    .toBe(true)
  const signInWindow = await shifted.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes('#sign-in')
    )
    if (!window) return null
    return {
      size: window.getContentSize(),
      frameHeight: window.getSize()[1] ?? 0,
      title: window.getTitle(),
      workAreaHeight: screen.getDisplayMatching(window.getBounds()).workArea.height
    }
  })
  // Shifted asks for 480 by 720 points. On a screen that is too small for that, for
  // example the 1024 by 768 screen of the GitHub Actions runners, macOS and Windows make
  // the window as tall as the work area of the screen. Then the content is the work area
  // less the title bar and the frame.
  const frame = (signInWindow?.frameHeight ?? 0) - (signInWindow?.size[1] ?? 0)
  const fittingHeight = Math.min(720, (signInWindow?.workAreaHeight ?? 0) - frame)
  expect(signInWindow?.title).toBe('Sign in')
  expect(signInWindow?.size).toEqual([480, fittingHeight])
})

test.describe('with a fake microphone', () => {
  // A test computer can have no microphone, for example the Windows and Linux runners of
  // GitHub Actions. Then Chromium answers "NotFoundError" before it asks for permission.
  // Chromium's fake devices give every computer a microphone. The permission request
  // still goes to Shifted, so the test still checks the question and the saved answer.
  test.use({ shiftedArgs: ['--use-fake-device-for-media-stream'] })

  test('the microphone: Shifted asks once, remembers the answer, and the account page resets it', async ({
    shifted,
    mainWindow,
    fakeGoogle,
    userDataDir
  }) => {
    await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
    // Shifted asked for no permission at startup or during sign-in.
    expect(readConfig(userDataDir).accounts[0]?.pagePermissions ?? {}).toEqual({})
    await answerPermissionQuestions(shifted)
    const gmail = await gmailViewPage(shifted, fakeGoogle)
    const useMicrophone = async (): Promise<string> => {
      await gmail.evaluate(() => {
        const status = document.getElementById('microphone-status')
        if (status) status.textContent = ''
        document.getElementById('microphone')?.click()
      })
      await expect
        .poll(() => gmail.evaluate(() => document.getElementById('microphone-status')?.textContent))
        .not.toBe('')
      return (await gmail.evaluate(
        () => document.getElementById('microphone-status')?.textContent ?? ''
      )) as string
    }

    // The first request asks, and Shifted saves the answer for the account.
    expect(await useMicrophone()).toBe('NotAllowedError')
    expect(await permissionQuestions(shifted)).toEqual([
      `Allow ${ONE} to use your camera and microphone?`
    ])
    await expect
      .poll(() => readConfig(userDataDir).accounts[0]?.pagePermissions)
      .toEqual({
        media: 'deny'
      })

    // The second request uses the saved answer and does not ask.
    expect(await useMicrophone()).toBe('NotAllowedError')
    expect(await permissionQuestions(shifted)).toHaveLength(1)

    // The account page shows the saved answer, and "Reset page permissions" forgets it.
    await chooseFromAccountMenu(shifted, sidebarAccount(mainWindow, ONE), 'Notifications')
    const settings = await settingsWindowPage(shifted)
    await expect(settings.getByText('Camera and microphone: Denied')).toBeVisible()
    const reset = settings.getByRole('button', { name: 'Reset page permissions' })
    await reset.click()
    await expect(reset).toBeDisabled()
    await expect.poll(() => readConfig(userDataDir).accounts[0]?.pagePermissions ?? {}).toEqual({})

    // After the reset, the next request asks again.
    expect(await useMicrophone()).toBe('NotAllowedError')
    expect(await permissionQuestions(shifted)).toHaveLength(2)
  })
})

test('the account page signs out and removes, and the session is in the app data folder', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, TWO)
  const oneId = accountIdOf(userDataDir, ONE)
  const folder = await shifted.evaluate(
    ({ session }, partition) => session.fromPartition(partition).storagePath,
    `persist:account-${oneId}`
  )
  // The session of the account is in the app data folder, with config.json and the photos.
  const inside = relative(userDataDir, folder ?? '')
  expect(inside.length > 0 && !inside.startsWith('..') && !isAbsolute(inside)).toBe(true)
  expect(existsSync(folder ?? '')).toBe(true)

  await sidebarAccount(mainWindow, ONE).click()
  await expect(sidebarAccount(mainWindow, ONE)).toHaveAttribute('aria-current', 'true')
  await chooseFromAccountMenu(shifted, sidebarAccount(mainWindow, ONE), 'Notifications')
  const settings = await settingsWindowPage(shifted)
  await settings.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(mainWindow.getByText('This account is signed out.')).toBeVisible()
  await expect.poll(() => visibleMainWindowPages(shifted)).toEqual([])

  await answerRemoveDialog(shifted, 'Remove')
  await settings.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(sidebarAccount(mainWindow, ONE)).toHaveCount(0)
  await expect.poll(() => configEmails(userDataDir)).toEqual([TWO])
  await expect.poll(() => existsSync(folder ?? '')).toBe(false)
})

test.describe('with short test timers', () => {
  test.use({
    shiftedEnv: { SHIFTED_TEST_SLEEP_MS: '1500', SHIFTED_TEST_READ_INTERVAL_MS: '1000' }
  })

  test('Gmail asleep: new mail still notifies, and a mailto: link loads Gmail with the new message', async ({
    shifted,
    mainWindow,
    fakeGoogle,
    userDataDir
  }) => {
    await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
    await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, TWO)

    await openSettingsFromAppMenu(shifted)
    const settings = await settingsWindowPage(shifted)
    await settings.getByLabel('Background loading').selectOption({ label: 'Selected account only' })
    await expect
      .poll(() => readConfig(userDataDir).general.backgroundLoading)
      .toBe('selected-account-only')

    // Leave account 2. After the timer, Gmail of account 2 is asleep.
    await sidebarAccount(mainWindow, ONE).click()
    await expect
      .poll(() => loadedGoogleApps(shifted), { timeout: 15_000 })
      .toEqual([`/calendar/${ONE}`, `/gmail/${ONE}`])

    // New-mail notifications come from the feed, so they work while Gmail is asleep.
    await fakeGoogle.addFeedEntry({
      address: TWO,
      entry: {
        id: 'asleep',
        title: 'Sent while Gmail was asleep',
        authorName: 'Ana',
        authorEmail: 'ana@example.com',
        issued: '2026-10-21T09:00:00Z'
      }
    })
    await expect
      .poll(() => recordedNotifications(shifted), { timeout: 15_000 })
      .toMatchObject([{ kind: 'new-mail', title: TWO, body: 'Ana\nSent while Gmail was asleep' }])
    expect(await loadedGoogleApps(shifted)).toEqual([`/calendar/${ONE}`, `/gmail/${ONE}`])

    const link = 'mailto:bob@example.com?subject=Asleep'
    expect(await runSecondInstance(fakeGoogle, userDataDir, [link])).toBe(0)
    const picker = await accountPickerPage(shifted)
    await picker.getByRole('option', { name: TWO }).click()

    await expect(sidebarAccount(mainWindow, TWO)).toHaveAttribute('aria-current', 'true')
    await expect
      .poll(() => visibleGoogleApp(shifted))
      .toMatchObject({
        url: `${fakeGoogle.url}/gmail/?extsrc=mailto&url=${encodeURIComponent(link)}`,
        address: TWO
      })
    expect(
      await evaluateInContentArea(
        shifted,
        `document.getElementById('compose-url')?.textContent ?? null`
      )
    ).toBe(link)
  })
})
