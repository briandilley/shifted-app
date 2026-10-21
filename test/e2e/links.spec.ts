import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import {
  CALENDAR_EVENT_PATH,
  FAKE_ADDRESS,
  FAKE_DOWNLOAD_CONTENT,
  FAKE_DOWNLOAD_NAME,
  MAILTO_LINK,
  OUTSIDE_LINK,
  OUTSIDE_NEW_WINDOW_LINK
} from '../fake-google/server'
import {
  addAccountAndSignIn,
  chooseFromAccountMenu,
  expect,
  gmailViewPage,
  openSettingsFromAppMenu,
  readConfig,
  settingsWindowPage,
  sidebarAccount,
  test,
  testRecords,
  visibleGoogleApp,
  windowCount
} from './fixtures'

/**
 * Click a link with a script in the page. Playwright's own click waits for the
 * navigation, and Shifted stops the navigation, so that click never ends.
 */
async function clickWithoutWaiting(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate((element: HTMLElement) => element.click())
}

interface ChildWindowInfo {
  title: string
  /** True when the child window uses the session of the account. */
  sameSession: boolean
  /** The heading of the fake compose form, or `null`. */
  compose: string | null
}

/** The child windows of Shifted: every window whose title starts with "Shifted: ". */
function childWindows(app: ElectronApplication, accountId: string): Promise<ChildWindowInfo[]> {
  return app.evaluate(async ({ BrowserWindow, session }, partition) => {
    const accountSession = session.fromPartition(partition)
    const windows = BrowserWindow.getAllWindows().filter((window) =>
      window.getTitle().startsWith('Shifted: ')
    )
    return Promise.all(
      windows.map(async (window) => ({
        title: window.getTitle(),
        sameSession: window.webContents.session === accountSession,
        compose: (await window.webContents.executeJavaScript(
          "document.getElementById('compose-title')?.textContent ?? null"
        )) as string | null
      }))
    )
  }, `persist:account-${accountId}`)
}

test('a fake pop-out opens a child window with the session of the same account', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
  const accountId = readConfig(userDataDir).accounts[0]?.id ?? ''

  const gmail = await gmailViewPage(shifted, fakeGoogle)
  await gmail.locator('#pop-out').click()

  await expect.poll(() => windowCount(shifted)).toBe(2)
  await expect
    .poll(() => childWindows(shifted, accountId))
    .toEqual([{ title: `Shifted: ${FAKE_ADDRESS}`, sameSession: true, compose: 'Fake compose' }])
  // The pop-out opens no default browser.
  expect((await testRecords(shifted)).openExternal).toEqual([])

  // Sign out closes the child windows of the account.
  await chooseFromAccountMenu(shifted, sidebarAccount(mainWindow, FAKE_ADDRESS), 'Sign out')
  await expect.poll(() => windowCount(shifted)).toBe(1)
  await expect.poll(() => childWindows(shifted, accountId)).toEqual([])
})

test('a fake Calendar link selects the Calendar tab, and no new window opens', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)

  const gmail = await gmailViewPage(shifted, fakeGoogle)
  await gmail.locator('#calendar-link').click()

  await expect(mainWindow.getByRole('tab', { name: 'Calendar' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({
      url: `${fakeGoogle.url}${CALENDAR_EVENT_PATH}`,
      title: 'Calendar event',
      address: FAKE_ADDRESS
    })
  expect(await windowCount(shifted)).toBe(1)
  expect(readConfig(userDataDir).accounts[0]?.lastGoogleApp).toBe('calendar')
  expect((await testRecords(shifted)).openExternal).toEqual([])
})

test('an outside link is recorded for the default browser and does not load in Shifted', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)

  const gmail = await gmailViewPage(shifted, fakeGoogle)
  // A link to a new window goes through `setWindowOpenHandler`.
  await gmail.locator('#outside-new-window-link').click()
  await expect
    .poll(async () => (await testRecords(shifted)).openExternal)
    .toEqual([OUTSIDE_NEW_WINDOW_LINK])
  // A link in the same page goes through `will-navigate`.
  await clickWithoutWaiting(gmail, '#outside-link')
  await expect
    .poll(async () => (await testRecords(shifted)).openExternal)
    .toEqual([OUTSIDE_NEW_WINDOW_LINK, OUTSIDE_LINK])

  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({ url: `${fakeGoogle.url}/gmail/`, address: FAKE_ADDRESS })
  expect(await windowCount(shifted)).toBe(1)
})

test('a mailto: link opens a new message in Gmail of the same account', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)

  const gmail = await gmailViewPage(shifted, fakeGoogle)
  await gmail.locator('#mailto-link').click()

  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({
      url: `${fakeGoogle.url}/gmail/?extsrc=mailto&url=${encodeURIComponent(MAILTO_LINK)}`,
      address: FAKE_ADDRESS
    })
  expect(await windowCount(shifted)).toBe(1)
  expect((await testRecords(shifted)).openExternal).toEqual([])
})

test('a fake download lands in a temporary Downloads folder', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  const downloads = mkdtempSync(join(tmpdir(), 'shifted-downloads-'))
  try {
    await shifted.evaluate(({ app }, dir) => app.setPath('downloads', dir), downloads)
    await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
    const gmail = await gmailViewPage(shifted, fakeGoogle)

    await clickWithoutWaiting(gmail, '#download-link')
    const first = join(downloads, FAKE_DOWNLOAD_NAME)
    await expect
      .poll(() => (existsSync(first) ? readFileSync(first, 'utf8') : null))
      .toBe(FAKE_DOWNLOAD_CONTENT)
    await expect.poll(async () => (await testRecords(shifted)).downloadNotifications).toBe(1)

    // The same name again gets " (1)" before the extension.
    await clickWithoutWaiting(gmail, '#download-link')
    const second = join(downloads, 'report (1).txt')
    await expect
      .poll(() => (existsSync(second) ? readFileSync(second, 'utf8') : null))
      .toBe(FAKE_DOWNLOAD_CONTENT)
    await expect.poll(async () => (await testRecords(shifted)).downloadNotifications).toBe(2)

    // A download that Gmail opens in a new window lands in the folder too. The child window
    // shows nothing, so it closes.
    await gmail.locator('#download-new-window-link').click()
    const third = join(downloads, 'report (2).txt')
    await expect
      .poll(() => (existsSync(third) ? readFileSync(third, 'utf8') : null))
      .toBe(FAKE_DOWNLOAD_CONTENT)
    await expect.poll(() => windowCount(shifted)).toBe(1)
    await expect.poll(async () => (await testRecords(shifted)).downloadNotifications).toBe(3)

    // A click on the notification shows the file in the file manager.
    await shifted.evaluate(() => {
      const records = (
        globalThis as { shiftedTestRecords?: { downloadNotifications: Electron.Notification[] } }
      ).shiftedTestRecords
      records?.downloadNotifications.at(-1)?.emit('click')
    })
    await expect.poll(async () => (await testRecords(shifted)).showItemInFolder).toEqual([third])
    expect((await testRecords(shifted)).openExternal).toEqual([])
  } finally {
    rmSync(downloads, { recursive: true, force: true })
  }
})

test('the General page saves "Ask where to save each file"', async ({
  shifted,
  mainWindow,
  userDataDir
}) => {
  // Wait until Shifted shows its main window, so that the app menu exists.
  await expect(mainWindow.getByText('No accounts yet')).toBeVisible()
  await openSettingsFromAppMenu(shifted)
  const settings = await settingsWindowPage(shifted)
  const askWhereToSave = settings.getByRole('switch', { name: 'Ask where to save each file' })
  await expect(askWhereToSave).not.toBeChecked()
  // The switch shows the saved value, so it changes after the main process saves it.
  await askWhereToSave.click()
  await expect(askWhereToSave).toBeChecked()
  await expect.poll(() => readConfig(userDataDir).general.askWhereToSave).toBe(true)
  await askWhereToSave.click()
  await expect(askWhereToSave).not.toBeChecked()
  await expect.poll(() => readConfig(userDataDir).general.askWhereToSave).toBe(false)
})
