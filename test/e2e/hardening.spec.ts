import type { ElectronApplication, Page } from '@playwright/test'
import { TEST_CRASH_CHANNEL } from '../../src/shared/test-hooks'
import {
  addAccountAndSignIn,
  clickAppMenuItem,
  evaluateInContentArea,
  expect,
  findPage,
  openSettingsFromAppMenu,
  settingsWindowPage,
  sidebar,
  test,
  visibleGoogleApp,
  visibleMainWindowPages
} from './fixtures'
import type { FakeGoogleServer } from '../fake-google/server'

const ONE = 'one@example.com'
const TWO = 'two@example.com'

/** Make the Gmail page of the address crash with `process.crash()`, through the test hook. */
async function crashGmail(app: ElectronApplication, url: string): Promise<void> {
  await app.evaluate(
    ({ webContents }, { pageUrl, channel }) => {
      const page = webContents
        .getAllWebContents()
        .find((contents) => !contents.isDestroyed() && contents.getURL() === pageUrl)
      if (!page) throw new Error(`No page with the URL ${pageUrl}.`)
      page.send(channel)
    },
    { pageUrl: url, channel: TEST_CRASH_CHANNEL }
  )
}

/**
 * Wait until the content area shows the fake Gmail again, loaded anew (no marker). Right
 * after a crash, the page can go away during a read, so a failed read counts as nothing.
 */
async function expectGmailReloaded(
  app: ElectronApplication,
  fakeGoogle: FakeGoogleServer
): Promise<void> {
  await expect
    .poll(() => visibleGoogleApp(app).catch(() => null), { timeout: 15_000 })
    .toMatchObject({ url: `${fakeGoogle.url}/gmail/`, marker: null })
}

test('a Google app that crashes reloads on its own, and waits for "Reload" after 3 crashes', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  const gmail = `${fakeGoogle.url}/gmail/`
  const panel = mainWindow.getByText('This page stopped.')

  // The first two crashes reload the page on its own.
  for (let crash = 1; crash <= 2; crash++) {
    await evaluateInContentArea(shifted, 'window.shiftedTestMarker = 1')
    await crashGmail(shifted, gmail)
    await expectGmailReloaded(shifted, fakeGoogle)
  }
  await expect(panel).toBeHidden()

  // The third crash in 5 minutes: the panel stays, and the Google view stays hidden.
  await crashGmail(shifted, gmail)
  await expect(panel).toBeVisible()
  await expect(mainWindow.locator('[data-page-problem="crashed"]')).toBeVisible()
  await mainWindow.waitForTimeout(1500)
  await expect(panel).toBeVisible()
  expect(await visibleMainWindowPages(shifted)).toEqual([])

  // "Reload" loads the page again.
  await mainWindow.getByRole('button', { name: 'Reload' }).click()
  await expectGmailReloaded(shifted, fakeGoogle)
  await expect(panel).toBeHidden()
})

test('a page with a certificate error is blocked, with a message and "Reload"', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  // Shifted answers every certificate error with "no".
  const answer = await shifted.evaluate(({ app, webContents }) => {
    const page = webContents.getAllWebContents()[0]
    let allowed: boolean | undefined
    app.emit(
      'certificate-error',
      { preventDefault: () => undefined },
      page,
      'https://example.com/',
      'net::ERR_CERT_AUTHORITY_INVALID',
      {},
      (value: boolean) => {
        allowed = value
      }
    )
    return allowed
  })
  expect(answer).toBe(false)

  // The blocked page fails to load with a certificate error (-202). The content area
  // shows the message in its place.
  const gmail = `${fakeGoogle.url}/gmail/`
  await shifted.evaluate(({ webContents }, pageUrl) => {
    const page = webContents.getAllWebContents().find((contents) => contents.getURL() === pageUrl)
    page?.emit(
      'did-fail-load',
      { preventDefault: () => undefined },
      -202,
      'ERR_CERT_AUTHORITY_INVALID',
      pageUrl,
      true
    )
  }, gmail)
  await expect(
    mainWindow.getByText('Shifted blocked this page. Its certificate is not valid.')
  ).toBeVisible()
  expect(await visibleMainWindowPages(shifted)).toEqual([])

  await mainWindow.getByRole('button', { name: 'Reload' }).click()
  await expect.poll(() => visibleGoogleApp(shifted)).toMatchObject({ url: gmail, address: ONE })
})

/** Give two accounts unread counts, and wait for the badges. */
async function twoAccountsWithCounts(
  shifted: ElectronApplication,
  mainWindow: Page,
  fakeGoogle: FakeGoogleServer
): Promise<void> {
  await fakeGoogle.setFeed({ address: ONE, feed: 'primary', count: 3 })
  await fakeGoogle.setFeed({ address: TWO, feed: 'primary', count: 120 })
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, TWO)
}

test('the sidebar buttons have the account name and the unread count as their names', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await twoAccountsWithCounts(shifted, mainWindow, fakeGoogle)
  const accounts = sidebar(mainWindow)
  await expect(
    accounts.getByRole('button', { name: `${ONE}, 3 unread`, exact: true })
  ).toBeVisible()
  await expect(
    accounts.getByRole('button', { name: `${TWO}, 120 unread`, exact: true })
  ).toBeVisible()

  // A failed read: the name says why there is no count.
  await fakeGoogle.setFeedFailure(true)
  await mainWindow.getByRole('button', { name: `${ONE}, 3 unread` }).click()
  await expect(
    accounts.getByRole('button', {
      name: `${ONE}, unread count not available: Gmail answered with an error (HTTP 500)`,
      exact: true
    })
  ).toBeVisible()
})

test('the keyboard moves through the sidebar and the tab bar', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await twoAccountsWithCounts(shifted, mainWindow, fakeGoogle)
  const first = sidebar(mainWindow).getByRole('button', { name: ONE })
  const second = sidebar(mainWindow).getByRole('button', { name: TWO })
  // The second account is selected after its sign-in.
  await expect(second).toHaveAttribute('aria-current', 'true')

  // The list is one stop of the Tab key: only the selected account can get the focus.
  await expect(second).toHaveAttribute('tabindex', '0')
  await expect(first).toHaveAttribute('tabindex', '-1')

  await second.focus()
  await mainWindow.keyboard.press('ArrowUp')
  await expect(first).toBeFocused()
  // The arrow keys only move the focus. Enter selects the account.
  await expect(second).toHaveAttribute('aria-current', 'true')
  await mainWindow.keyboard.press('Enter')
  await expect(first).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => visibleGoogleApp(shifted)).toMatchObject({ address: ONE })
  await mainWindow.keyboard.press('ArrowDown')
  await expect(second).toBeFocused()
  await mainWindow.keyboard.press('ArrowUp')
  await expect(first).toBeFocused()

  // The tab bar uses the roles `tablist` and `tab`, and the arrow keys switch the tab.
  const tabs = mainWindow.getByRole('tablist', { name: 'Google apps' })
  const gmailTab = tabs.getByRole('tab', { name: 'Gmail' })
  const calendarTab = tabs.getByRole('tab', { name: 'Calendar' })
  await expect(gmailTab).toHaveAttribute('aria-selected', 'true')
  await gmailTab.focus()
  await mainWindow.keyboard.press('ArrowRight')
  await expect(calendarTab).toBeFocused()
  await expect(calendarTab).toHaveAttribute('aria-selected', 'true')
  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({ url: `${fakeGoogle.url}/calendar/` })
  await mainWindow.keyboard.press('ArrowLeft')
  await expect(gmailTab).toHaveAttribute('aria-selected', 'true')
})

/** The fields of the page that have no label: no `<label>`, no `aria-label`, no `aria-labelledby`. */
function fieldsWithNoLabel(page: Page): Promise<string[]> {
  return page.locator('input, select, textarea').evaluateAll((fields) =>
    fields
      .filter((field) => {
        const labels = (field as HTMLInputElement).labels
        const hasLabel = labels !== null && [...labels].some((label) => label.textContent?.trim())
        return (
          !hasLabel &&
          !field.getAttribute('aria-label')?.trim() &&
          !field.getAttribute('aria-labelledby')
        )
      })
      .map((field) => field.outerHTML)
  )
}

test('every field of the configuration window has a label', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await openSettingsFromAppMenu(shifted)
  const settings = await settingsWindowPage(shifted)

  await expect(settings.getByRole('heading', { name: 'General' })).toBeVisible()
  expect(await settings.locator('input, select, textarea').count()).toBeGreaterThan(0)
  expect(await fieldsWithNoLabel(settings)).toEqual([])

  await settings.getByRole('button', { name: 'Notifications', exact: true }).click()
  await expect(settings.getByRole('heading', { name: 'Notifications' })).toBeVisible()
  expect(await fieldsWithNoLabel(settings)).toEqual([])

  await settings.getByRole('button', { name: ONE }).click()
  await expect(settings.getByLabel('Nickname')).toBeVisible()
  expect(await settings.locator('input, select, textarea').count()).toBeGreaterThan(10)
  expect(await fieldsWithNoLabel(settings)).toEqual([])
})

test('"Memory use" in the Help menu shows the memory of each Google app', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await clickAppMenuItem(shifted, 'memory-use')
  const memory = await findPage(shifted, (url) => url.endsWith('#memory'))
  const table = memory.locator('[data-memory-table]')
  await expect(table).toBeVisible()
  const gmailRow = table.getByRole('row').filter({ hasText: ONE }).filter({ hasText: 'Gmail' })
  await expect(gmailRow).toHaveCount(1)
  await expect(gmailRow).toContainText(/\d+ MB/)
  await expect(table.getByRole('row').filter({ hasText: 'Calendar' })).toHaveCount(1)
  await expect(memory.locator('[data-memory-total]')).toHaveText(/^\d+ MB$/)
})

test('with reduced motion, the selection tile does not move', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  const tile = mainWindow.locator('[data-selection-tile]')
  const duration = (): Promise<string> =>
    tile.evaluate((element) => getComputedStyle(element).transitionDuration)
  await mainWindow.emulateMedia({ reducedMotion: 'no-preference' })
  expect(await duration()).not.toBe('0s')
  await mainWindow.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(duration).toBe('0s')
})
