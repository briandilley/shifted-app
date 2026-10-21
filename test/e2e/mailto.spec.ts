import type { ElectronApplication, Page } from '@playwright/test'
import {
  accountIdOf,
  accountPickerPage,
  addAccountAndSignIn,
  evaluateInContentArea,
  expect,
  openSettingsFromAppMenu,
  readConfig,
  runSecondInstance,
  settingsWindowPage,
  sidebarAccount,
  test,
  visibleGoogleApp,
  windowCount
} from './fixtures'

const ONE = 'one@example.com'
const TWO = 'two@example.com'

const FIRST_LINK = 'mailto:bob@example.com?subject=Hello%20Bob&body=Hi'
const SECOND_LINK = 'mailto:carol@example.com,dan@example.com?subject=Second'

/**
 * Press a key that closes the account picker. The window closes on the key press, before
 * the key comes up, so Playwright can report a closed page. Wait for the close instead.
 */
async function pressToClose(picker: Page, key: string): Promise<void> {
  await Promise.all([
    picker.waitForEvent('close'),
    picker.keyboard.press(key).catch(() => undefined)
  ])
}

/** The `url` parameter that the fake Gmail in the content area received, or `null`. */
function composeUrlInContentArea(app: ElectronApplication): Promise<unknown> {
  return evaluateInContentArea(app, `document.getElementById('compose-url')?.textContent ?? null`)
}

test('a mailto: link from another app shows the account picker, then Gmail of the chosen account', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, TWO)
  await sidebarAccount(mainWindow, ONE).click()

  // Windows and Linux start a second copy of Shifted with the link. It gives the link to
  // this copy and quits.
  expect(await runSecondInstance(fakeGoogle, userDataDir, [FIRST_LINK])).toBe(0)

  const picker = await accountPickerPage(shifted)
  await expect(
    picker.getByRole('heading', { name: 'New message to bob@example.com' })
  ).toBeVisible()
  const options = picker.getByRole('option')
  await expect(options).toHaveCount(2)
  // No account was used for a mailto: link yet, so the first account is selected.
  await expect(picker.getByRole('option', { name: ONE })).toHaveAttribute('aria-selected', 'true')

  await picker.getByRole('option', { name: TWO }).click()

  await expect.poll(() => windowCount(shifted)).toBe(1)
  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({
      url: `${fakeGoogle.url}/gmail/?extsrc=mailto&url=${encodeURIComponent(FIRST_LINK)}`,
      address: TWO
    })
  // Gmail gets the whole link.
  expect(await composeUrlInContentArea(shifted)).toBe(FIRST_LINK)
  await expect(sidebarAccount(mainWindow, TWO)).toHaveAttribute('aria-current', 'true')
  await expect(mainWindow.getByRole('tab', { name: 'Gmail' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(readConfig(userDataDir).mailto).toEqual({
    defaultAccountId: null,
    lastAccountId: accountIdOf(userDataDir, TWO)
  })

  // The next link selects the account used last. Escape closes the picker, and no new
  // message opens.
  expect(await runSecondInstance(fakeGoogle, userDataDir, [SECOND_LINK])).toBe(0)
  const second = await accountPickerPage(shifted)
  await expect(
    second.getByRole('heading', { name: 'New message to carol@example.com, dan@example.com' })
  ).toBeVisible()
  await expect(second.getByRole('option', { name: TWO })).toHaveAttribute('aria-selected', 'true')
  await expect(second.getByRole('option', { name: TWO })).toBeFocused()
  await pressToClose(second, 'Escape')
  await expect.poll(() => windowCount(shifted)).toBe(1)
  expect(await composeUrlInContentArea(shifted)).toBe(FIRST_LINK)

  // Enter picks the selected account.
  expect(await runSecondInstance(fakeGoogle, userDataDir, [SECOND_LINK])).toBe(0)
  const third = await accountPickerPage(shifted)
  await expect(third.getByRole('option', { name: TWO })).toBeFocused()
  await third.keyboard.press('ArrowUp')
  await expect(third.getByRole('option', { name: ONE })).toHaveAttribute('aria-selected', 'true')
  await pressToClose(third, 'Enter')
  await expect.poll(() => windowCount(shifted)).toBe(1)
  await expect.poll(() => visibleGoogleApp(shifted)).toMatchObject({ address: ONE })
  expect(await composeUrlInContentArea(shifted)).toBe(SECOND_LINK)
})

test('"Always use this account" skips the picker until the configuration clears it', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, TWO)
  await sidebarAccount(mainWindow, ONE).click()

  expect(await runSecondInstance(fakeGoogle, userDataDir, [FIRST_LINK])).toBe(0)
  const picker = await accountPickerPage(shifted)
  await picker.getByRole('checkbox', { name: 'Always use this account' }).check()
  await picker.getByRole('option', { name: TWO }).click()
  await expect.poll(() => composeUrlInContentArea(shifted)).toBe(FIRST_LINK)
  expect(readConfig(userDataDir).mailto?.defaultAccountId).toBe(accountIdOf(userDataDir, TWO))

  // The second link skips the picker and opens in account 2 at once.
  await sidebarAccount(mainWindow, ONE).click()
  expect(await runSecondInstance(fakeGoogle, userDataDir, [SECOND_LINK])).toBe(0)
  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({
      url: `${fakeGoogle.url}/gmail/?extsrc=mailto&url=${encodeURIComponent(SECOND_LINK)}`,
      address: TWO
    })
  expect(await windowCount(shifted)).toBe(1)

  // The configuration window names the account and clears it.
  await openSettingsFromAppMenu(shifted)
  const settings = await settingsWindowPage(shifted)
  await expect(settings.locator('[data-mailto-default]')).toHaveText(
    `Email links from other apps always use ${TWO}.`
  )
  const clear = settings.getByRole('button', { name: 'Clear the always-use account' })
  await clear.click()
  await expect(clear).toBeDisabled()
  expect(readConfig(userDataDir).mailto?.defaultAccountId).toBeNull()

  // The picker shows again.
  expect(await runSecondInstance(fakeGoogle, userDataDir, [FIRST_LINK])).toBe(0)
  const again = await accountPickerPage(shifted)
  await expect(again.getByRole('option', { name: TWO })).toHaveAttribute('aria-selected', 'true')
})

test('a mailto: link with no accounts shows "Add an account first"', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await expect(mainWindow.getByText('No accounts yet')).toBeVisible()
  expect(await runSecondInstance(fakeGoogle, userDataDir, [FIRST_LINK])).toBe(0)
  await expect(mainWindow.getByText('Add an account first')).toBeVisible()
  expect(await windowCount(shifted)).toBe(1)
})

test('a second copy of Shifted with no link quits and leaves one copy', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await expect(mainWindow.getByText('No accounts yet')).toBeVisible()
  expect(await runSecondInstance(fakeGoogle, userDataDir, [])).toBe(0)
  expect(await windowCount(shifted)).toBe(1)
})

test('the General page shows the default email app and its button', async ({
  shifted,
  mainWindow
}) => {
  await expect(mainWindow.getByText('No accounts yet')).toBeVisible()
  await openSettingsFromAppMenu(shifted)
  const settings = await settingsWindowPage(shifted)
  const status = settings.locator('[data-default-email-app]')
  // In test mode, Shifted never changes the default email app of the computer.
  await expect(status).toHaveText('Shifted is not the default email app.')
  await settings.getByRole('button', { name: 'Make Shifted the default email app' }).click()
  await expect(status).toHaveText('Shifted is the default email app.')
  const calls = await shifted.evaluate(
    () =>
      (globalThis as { shiftedTestRecords?: { makeDefaultEmailApp: number } }).shiftedTestRecords
        ?.makeDefaultEmailApp ?? 0
  )
  expect(calls).toBe(1)
  await expect(
    settings.getByRole('button', { name: 'Clear the always-use account' })
  ).toBeDisabled()
})

test('a mailto: link from the open-url event of macOS shows the account picker', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await shifted.evaluate(({ app }, link) => {
    app.emit('open-url', { preventDefault: () => undefined }, link)
  }, FIRST_LINK)
  const picker = await accountPickerPage(shifted)
  await expect(
    picker.getByRole('heading', { name: 'New message to bob@example.com' })
  ).toBeVisible()
  await picker.getByRole('option', { name: ONE }).click()
  await expect.poll(() => composeUrlInContentArea(shifted)).toBe(FIRST_LINK)
})
