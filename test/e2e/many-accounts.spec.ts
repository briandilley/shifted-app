import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import { accountBackdrop, type ColorMode } from '../../src/shared/account-colors'
import type { FakeGoogleServer } from '../fake-google/server'
import {
  addAccountAndSignIn,
  answerRemoveDialog,
  chooseFromAccountMenu,
  configEmails,
  evaluateInContentArea,
  expect,
  expectFakeGmail,
  launchShifted,
  mainWindowPage,
  openSettingsFromAppMenu,
  readConfig,
  settingsWindowPage,
  sidebarAccount,
  sidebarAccountNames,
  signInOnFakePage,
  test,
  visibleGoogleApp,
  visibleMainWindowPages,
  windowCount
} from './fixtures'

const ONE = 'one@example.com'
const TWO = 'two@example.com'
const THREE = 'three@example.com'

/** Add the accounts one after the other. */
async function addAccounts(
  app: ElectronApplication,
  mainWindow: Page,
  fakeGoogle: FakeGoogleServer,
  emails: string[]
): Promise<void> {
  for (const email of emails) await addAccountAndSignIn(app, mainWindow, fakeGoogle, email)
}

/** A color `#RRGGBB` as the computed style of a page writes it: `rgb(r, g, b)`. */
function cssRgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

/** The background color of the frame view of the main window, as the page computes it. */
function frameViewBackground(mainWindow: Page): Promise<string> {
  return mainWindow
    .locator('[data-frame-view]')
    .evaluate((frame) => getComputedStyle(frame).backgroundColor)
}

/** The background color of the main window, as `BrowserWindow.getBackgroundColor` gives it. */
function mainWindowBackgroundColor(app: ElectronApplication): Promise<string | undefined> {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => !window.webContents.getURL().includes('#'))
      ?.getBackgroundColor()
      .toUpperCase()
  )
}

/** The id of the account with this address in `config.json`. */
function accountId(userDataDir: string, email: string): string {
  return readConfig(userDataDir).accounts.find((account) => account.email === email)?.id ?? ''
}

test('three accounts: each one shows its own Gmail, avatar, and color', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccounts(shifted, mainWindow, fakeGoogle, [ONE, TWO, THREE])
  expect(await sidebarAccountNames(mainWindow)).toEqual([ONE, TWO, THREE])
  // Each new account gets the next color of the set.
  expect(readConfig(userDataDir).accounts.map((account) => account.color)).toEqual([
    '#1A73E8',
    '#D93025',
    '#188038'
  ])

  for (const email of [ONE, TWO, THREE, ONE]) {
    const account = sidebarAccount(mainWindow, email)
    await account.click()
    await expect(account).toHaveAttribute('aria-current', 'true')
    await expect
      .poll(() => visibleGoogleApp(shifted))
      .toMatchObject({ url: `${fakeGoogle.url}/gmail/`, address: email })
    await expect(mainWindow.getByRole('tab', { name: 'Gmail' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  }
  await expect(sidebarAccount(mainWindow, TWO)).not.toHaveAttribute('aria-current', 'true')

  // Shifted saved the profile photo of each account and shows it in the ring.
  for (const email of [ONE, TWO, THREE]) {
    const photo = join(userDataDir, 'photos', `${accountId(userDataDir, email)}.png`)
    await expect.poll(() => existsSync(photo)).toBe(true)
    await expect(sidebarAccount(mainWindow, email).locator('img')).toBeVisible()
  }
})

test('switch from account 1 to account 2: the frame view takes the backdrop of account 2', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccounts(shifted, mainWindow, fakeGoogle, [ONE, TWO])
  const mode: ColorMode = await mainWindow.evaluate(() =>
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  )
  const [colorOne, colorTwo] = readConfig(userDataDir).accounts.map((account) => account.color)
  const backdropOne = accountBackdrop(colorOne, mode)
  const backdropTwo = accountBackdrop(colorTwo, mode)
  expect(backdropOne).not.toBe(backdropTwo)

  await sidebarAccount(mainWindow, ONE).click()
  await expect.poll(() => frameViewBackground(mainWindow)).toBe(cssRgb(backdropOne))
  await expect.poll(() => mainWindowBackgroundColor(shifted)).toBe(backdropOne)

  await sidebarAccount(mainWindow, TWO).click()
  await expect(sidebarAccount(mainWindow, TWO)).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => frameViewBackground(mainWindow)).toBe(cssRgb(backdropTwo))
  await expect.poll(() => mainWindowBackgroundColor(shifted)).toBe(backdropTwo)
})

test('the Calendar tab stays selected when you switch to another account and back', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccounts(shifted, mainWindow, fakeGoogle, [ONE, TWO])
  const gmailTab = mainWindow.getByRole('tab', { name: 'Gmail' })
  const calendarTab = mainWindow.getByRole('tab', { name: 'Calendar' })

  await sidebarAccount(mainWindow, TWO).click()
  await calendarTab.click()
  await expect(calendarTab).toHaveAttribute('aria-selected', 'true')
  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({ url: `${fakeGoogle.url}/calendar/`, title: 'Calendar', address: TWO })
  await expect.poll(() => readConfig(userDataDir).accounts[1]?.lastGoogleApp).toBe('calendar')
  // A mark in the page. If Shifted reloads the page, the mark goes away.
  await evaluateInContentArea(shifted, 'window.shiftedTestMarker = "calendar-two"')

  await sidebarAccount(mainWindow, ONE).click()
  await expect(gmailTab).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => visibleGoogleApp(shifted)).toMatchObject({ address: ONE, title: /Gmail/ })

  await sidebarAccount(mainWindow, TWO).click()
  await expect(calendarTab).toHaveAttribute('aria-selected', 'true')
  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({ title: 'Calendar', address: TWO, marker: 'calendar-two' })

  // Back to Gmail of account 2: the Gmail view was kept, and only one view shows.
  await gmailTab.click()
  await expect.poll(() => visibleGoogleApp(shifted)).toMatchObject({ address: TWO })
  expect(await visibleMainWindowPages(shifted)).toEqual([`${fakeGoogle.url}/gmail/`])
})

test('drag account 3 to the top: the order stays after a restart', async ({
  fakeGoogle,
  userDataDir
}) => {
  const first = await launchShifted(fakeGoogle, userDataDir)
  try {
    const mainWindow = await mainWindowPage(first)
    await addAccounts(first, mainWindow, fakeGoogle, [ONE, TWO, THREE])

    const from = await sidebarAccount(mainWindow, THREE).boundingBox()
    const to = await sidebarAccount(mainWindow, ONE).boundingBox()
    if (!from || !to) throw new Error('The sidebar shows no accounts.')
    await mainWindow.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await mainWindow.mouse.down()
    await mainWindow.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 12 })
    await mainWindow.mouse.up()

    await expect.poll(() => sidebarAccountNames(mainWindow)).toEqual([THREE, ONE, TWO])
    await expect.poll(() => configEmails(userDataDir)).toEqual([THREE, ONE, TWO])
    expect(readConfig(userDataDir).accounts.map((account) => account.order)).toEqual([0, 1, 2])
  } finally {
    await first.close()
  }

  const second = await launchShifted(fakeGoogle, userDataDir)
  try {
    const mainWindow = await mainWindowPage(second)
    await expect.poll(() => sidebarAccountNames(mainWindow)).toEqual([THREE, ONE, TWO])
    // The first account in the sidebar is selected after the start.
    await expectFakeGmail(second, fakeGoogle, THREE)
  } finally {
    await second.close()
  }
})

test('rename an account in the configuration window: the sidebar shows the nickname', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccounts(shifted, mainWindow, fakeGoogle, [ONE, TWO])
  const account = sidebarAccount(mainWindow, TWO)

  const labels = await chooseFromAccountMenu(shifted, account, 'Rename')
  expect(labels).toEqual(['Rename', 'Color', 'Notifications', 'Sign out', 'Remove'])

  const settings = await settingsWindowPage(shifted)
  const title = await shifted.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes('#settings'))
      ?.getTitle()
  )
  expect(title).toBe('Settings')
  const nickname = settings.getByLabel('Nickname')
  await expect(nickname).toBeFocused()
  await nickname.fill('Work')
  // Changes save at once. There is no Save button.
  await expect.poll(() => readConfig(userDataDir).accounts[1]?.nickname).toBe('Work')
  await expect(settings.getByRole('button', { name: 'Save' })).toHaveCount(0)

  await account.hover()
  await expect(account).toHaveAttribute('title', `Work\n${TWO}`)
  await expect(sidebarAccount(mainWindow, 'Work')).toBeVisible()

  // A new color shows in the ring of the avatar at once. The swatches show the saved
  // color, so the radio is checked after the main process saves it: click, then wait.
  const purpleSwatch = settings.getByRole('radio', { name: 'Purple' })
  await purpleSwatch.click()
  await expect(purpleSwatch).toBeChecked()
  await expect.poll(() => readConfig(userDataDir).accounts[1]?.color).toBe('#A142F4')
  await expect(account.locator('[data-color]')).toHaveAttribute('data-color', '#A142F4')

  // The backdrop of the main window and of the account page takes the new tint at once.
  const mode: ColorMode = await mainWindow.evaluate(() =>
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  )
  const purple = cssRgb(accountBackdrop('#A142F4', mode))
  await expect.poll(() => frameViewBackground(mainWindow)).toBe(purple)
  const settingsBackdrop = (): Promise<string> =>
    settings
      .locator('[data-backdrop]')
      .evaluate((element) => getComputedStyle(element).backgroundColor)
  await expect.poll(settingsBackdrop).toBe(purple)
  // The backdrop of the General page is --base.
  await settings
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'General' })
    .click()
  await expect.poll(settingsBackdrop).toBe(cssRgb(accountBackdrop(null, mode)))
})

test('remove an account from the context menu: it is gone from the sidebar and the configuration', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccounts(shifted, mainWindow, fakeGoogle, [ONE, TWO])
  const removedId = accountId(userDataDir, ONE)

  // Cmd+, opens the configuration window, with one entry for each account.
  await openSettingsFromAppMenu(shifted)
  const settings = await settingsWindowPage(shifted)
  const pages = settings.getByRole('navigation', { name: 'Settings pages' })
  await expect(pages.getByRole('button', { name: 'General' })).toBeVisible()
  await expect(pages.getByRole('button', { name: 'Notifications' })).toBeVisible()
  await expect(pages.getByRole('button', { name: ONE })).toBeVisible()
  await expect(pages.getByRole('button', { name: TWO })).toBeVisible()
  const accelerator = await shifted.evaluate(
    ({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('settings')?.accelerator
  )
  expect(accelerator).toBe('CommandOrControl+,')

  await answerRemoveDialog(shifted, 'Remove')
  await chooseFromAccountMenu(shifted, sidebarAccount(mainWindow, ONE), 'Remove')

  await expect(sidebarAccount(mainWindow, ONE)).toHaveCount(0)
  expect(await sidebarAccountNames(mainWindow)).toEqual([TWO])
  await expect(pages.getByRole('button', { name: ONE })).toHaveCount(0)
  await expect(pages.getByRole('button', { name: TWO })).toBeVisible()
  await expect.poll(() => configEmails(userDataDir)).toEqual([TWO])
  await expect.poll(() => existsSync(join(userDataDir, 'photos', `${removedId}.png`))).toBe(false)
  // The other account is now selected.
  await expect.poll(() => visibleGoogleApp(shifted)).toMatchObject({ address: TWO })
})

test('sign out from the context menu clears the session and shows the signed-out panel', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccounts(shifted, mainWindow, fakeGoogle, [ONE, TWO])
  const twoId = accountId(userDataDir, TWO)
  const cookieCount = (id: string): Promise<number> =>
    shifted.evaluate(
      async ({ session }, partition) =>
        (await session.fromPartition(partition).cookies.get({})).length,
      `persist:account-${id}`
    )
  expect(await cookieCount(twoId)).toBeGreaterThan(0)

  await chooseFromAccountMenu(shifted, sidebarAccount(mainWindow, TWO), 'Sign out')
  await expect(mainWindow.getByText('This account is signed out.')).toBeVisible()
  await expect.poll(() => visibleMainWindowPages(shifted)).toEqual([])
  await expect.poll(() => cookieCount(twoId)).toBe(0)
  // The other account stays signed in.
  expect(await cookieCount(accountId(userDataDir, ONE))).toBeGreaterThan(0)
  expect(configEmails(userDataDir)).toEqual([ONE, TWO])

  // "Sign in again" shows the sign-in page, because the session is clear.
  await mainWindow.getByRole('button', { name: 'Sign in again' }).click()
  await signInOnFakePage(shifted, fakeGoogle, TWO)
  await expectFakeGmail(shifted, fakeGoogle, TWO)
  expect(await windowCount(shifted)).toBe(1)
})
