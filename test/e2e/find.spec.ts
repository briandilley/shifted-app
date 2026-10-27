import type { ElectronApplication } from '@playwright/test'
import type { ShiftedApi } from '../../src/shared/api'
import {
  addAccountAndSignIn,
  expect,
  findPage,
  launchShifted,
  mainWindowPage,
  sidebarAccount,
  test
} from './fixtures'

const MOD = process.platform === 'darwin' ? 'meta' : 'control'

test('Find works inside a Google page restored at startup', async ({ fakeGoogle, userDataDir }) => {
  const first = await launchShifted(fakeGoogle, userDataDir)
  try {
    await addAccountAndSignIn(first, await mainWindowPage(first), fakeGoogle)
  } finally {
    await first.close()
  }
  const second = await launchShifted(fakeGoogle, userDataDir)
  try {
    await mainWindowPage(second)
    const gmail = await findPage(second, (url) => url === `${fakeGoogle.url}/gmail/`)
    await expect(gmail.locator('#address')).toBeVisible()
    await press(second, gmail.url(), 'F', [MOD])
    const bar = await findPage(second, (url) => url.endsWith('#find'))
    await bar.getByRole('textbox').fill('test@example.com')
    await expect(bar.getByRole('status')).toHaveText('1 of 1')
  } finally {
    await second.close()
  }
})

/** Send native keys through the shortcut handler, including inside a Google page. */
async function press(
  app: ElectronApplication,
  url: string,
  keyCode: string,
  modifiers: string[] = []
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow, WebContentsView }, key) => {
      const contents = BrowserWindow.getAllWindows()
        .flatMap((window) => [
          window.webContents,
          ...window.contentView.children
            .filter(
              (view): view is Electron.WebContentsView =>
                view instanceof WebContentsView && view.getVisible()
            )
            .map((view) => view.webContents)
        ])
        .find((page) => page.getURL() === key.url)
      if (!contents) throw new Error('The page is not open.')
      contents.focus()
      const modifiers = key.modifiers as Electron.KeyboardInputEvent['modifiers']
      contents.sendInputEvent({ type: 'keyDown', keyCode: key.keyCode, modifiers })
      contents.sendInputEvent({ type: 'keyUp', keyCode: key.keyCode, modifiers })
    },
    { url, keyCode, modifiers }
  )
}

test('Find searches the email page and moves between matches', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
  const gmail = await findPage(shifted, (url) => url === `${fakeGoogle.url}/gmail/`)
  await gmail.evaluate(() => {
    const email = document.createElement('article')
    email.textContent = 'Find this needle. Another NEEDLE. A final needle.'
    document.body.append(email)
  })
  await press(shifted, gmail.url(), 'F', [MOD])
  const bar = await findPage(shifted, (url) => url.endsWith('#find'), 3000)
  const input = bar.getByRole('textbox', { name: 'Find in page' })
  await expect(input).toBeFocused()
  await input.fill('needle')
  await expect(bar.getByRole('status')).toHaveText('1 of 3')
  await press(shifted, bar.url(), 'F', [MOD])
  await expect(input).toBeFocused()
  expect(
    await input.evaluate(
      (element: HTMLInputElement) => element.selectionEnd! - element.selectionStart!
    )
  ).toBe(6)
  await input.press('Enter')
  await expect(bar.getByRole('status')).toHaveText('2 of 3')
  await input.press('Shift+Enter')
  await expect(bar.getByRole('status')).toHaveText('1 of 3')
  await bar.getByRole('button', { name: 'Previous match' }).click()
  await expect(bar.getByRole('status')).toHaveText('3 of 3')
  await bar.getByRole('button', { name: 'Next match' }).click()
  await expect(bar.getByRole('status')).toHaveText('1 of 3')
  await bar.screenshot({ path: test.info().outputPath('find-bar.png') })
  await shifted.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => !window.webContents.getURL().includes('#'))
      ?.setSize(920, 600)
  })
  await expect
    .poll(() =>
      shifted.evaluate(({ BrowserWindow, WebContentsView }) => {
        const main = BrowserWindow.getAllWindows().find(
          (window) => !window.webContents.getURL().includes('#')
        )!
        const views = main.contentView.children.filter(
          (view): view is Electron.WebContentsView =>
            view instanceof WebContentsView && view.getVisible()
        )
        const bar = views.find((view) => view.webContents.getURL().endsWith('#find'))!.getBounds()
        const page = views.find((view) => !view.webContents.getURL().endsWith('#find'))!.getBounds()
        return bar.x + bar.width === page.x + page.width && bar.y === page.y
      })
    )
    .toBe(true)
  await input.fill('not present anywhere')
  await expect(bar.getByRole('status')).toHaveText('No matches')
  await input.fill('')
  await expect(bar.getByRole('status')).toHaveText('')
  await press(shifted, bar.url(), 'Escape')
  await expect.poll(() => bar.isClosed()).toBe(true)
  expect(
    await shifted.evaluate(
      ({ webContents }, url) =>
        webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === url)
          ?.isFocused(),
      gmail.url()
    )
  ).toBe(true)
})

test('Find follows the visible Google app and closes on account changes and navigation', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, 'one@example.com')
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, 'two@example.com')
  await press(shifted, mainWindow.url(), 'F', [MOD])
  const bar = await findPage(shifted, (url) => url.endsWith('#find'))
  await bar.getByRole('textbox').fill('two@example.com')
  await expect(bar.getByRole('status')).toHaveText('1 of 1')
  await sidebarAccount(mainWindow, 'one@example.com').click()
  await expect.poll(() => bar.isClosed()).toBe(true)
  await mainWindow.getByRole('tab', { name: 'Calendar' }).click()
  const calendar = await findPage(shifted, (url) => url === `${fakeGoogle.url}/calendar/`)
  await press(shifted, mainWindow.url(), 'F', [MOD])
  const calendarBar = await findPage(shifted, (url) => url.endsWith('#find'))
  await calendarBar.getByRole('textbox').fill('calendar')
  await expect(calendarBar.getByRole('status')).toHaveText('1 of 1')
  await press(shifted, calendar.url(), 'Escape')
  await expect.poll(() => calendarBar.isClosed()).toBe(true)
  await press(shifted, mainWindow.url(), 'F', [MOD])
  const navigationBar = await findPage(shifted, (url) => url.endsWith('#find'))
  await press(shifted, mainWindow.url(), '1', [MOD, 'shift'])
  await expect.poll(() => navigationBar.isClosed()).toBe(true)
  await press(shifted, mainWindow.url(), 'F', [MOD])
  const reloadBar = await findPage(shifted, (url) => url.endsWith('#find'))
  await press(shifted, mainWindow.url(), 'R', [MOD])
  await expect.poll(() => reloadBar.isClosed()).toBe(true)
})

test('Find searches a child window and releases the bar when that window closes', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
  const gmail = await findPage(shifted, (url) => url === `${fakeGoogle.url}/gmail/`)
  await gmail.locator('#pop-out').click()
  const child = await findPage(shifted, (url) => url === 'about:blank')
  await expect(child.locator('#compose-title')).toHaveText('Fake compose')
  await press(shifted, child.url(), 'F', [MOD])
  const bar = await findPage(shifted, (url) => url.endsWith('#find'))
  await bar.getByRole('textbox').fill('Fake compose')
  await expect(bar.getByRole('status')).toHaveText('1 of 1')
  await shifted.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL() === 'about:blank')
      ?.close()
  })
  await expect.poll(() => bar.isClosed()).toBe(true)
})

test('Find is available in the Edit menu and does nothing without a Google page', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await expect(mainWindow.getByText('No accounts yet')).toBeVisible()
  await press(shifted, mainWindow.url(), 'F', [MOD])
  expect(shifted.windows().some((page) => page.url().endsWith('#find'))).toBe(false)
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
  await shifted.evaluate(({ Menu, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(
      (window) => !window.webContents.getURL().includes('#')
    )!
    window.focus()
    const item = Menu.getApplicationMenu()!.getMenuItemById('find')!
    item.click(undefined, window, undefined)
  })
  const bar = await findPage(shifted, (url) => url.endsWith('#find'))
  await expect(bar.getByRole('textbox')).toBeFocused()
  // A different Shifted screen cannot send a search to this bar's Google page.
  await mainWindow.evaluate(() =>
    (window as unknown as { shifted: ShiftedApi }).shifted.findInPage('unauthorized')
  )
  await expect(bar.getByRole('textbox')).toHaveValue('')
  await expect(bar.getByRole('status')).toHaveText('')
  await bar
    .getByRole('button', { name: 'Close find' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect.poll(() => bar.isClosed()).toBe(true)
})
