import type { ElectronApplication, Locator } from '@playwright/test'
import { FAKE_ADDRESS, OUTSIDE_LINK } from '../fake-google/server'
import {
  addAccountAndSignIn,
  chooseFromAccountMenu,
  expect,
  gmailViewPage,
  settingsWindowPage,
  sidebarAccount,
  test,
  testRecords
} from './fixtures'

interface MenuStore {
  shiftedTestMenus?: Electron.Menu[]
}

/**
 * Keep each context menu that Shifted shows from now on. A native menu cannot be clicked
 * from Playwright, so the test replaces `Menu.popup` in the main process.
 */
async function catchMenus(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    const store = globalThis as MenuStore
    store.shiftedTestMenus = []
    Menu.prototype.popup = function (this: Electron.Menu): void {
      store.shiftedTestMenus?.push(this)
    }
  })
}

/** The labels of each menu that Shifted showed, without the separators. */
function menuLabels(app: ElectronApplication): Promise<string[][]> {
  return app.evaluate(() =>
    ((globalThis as MenuStore).shiftedTestMenus ?? []).map((menu) =>
      menu.items.filter((item) => item.type !== 'separator').map((item) => item.label)
    )
  )
}

/** Right-click an element and wait for its context menu. Returns the labels of the menu. */
async function rightClick(app: ElectronApplication, element: Locator): Promise<string[]> {
  const before = (await menuLabels(app)).length
  await element.click({ button: 'right' })
  await expect.poll(async () => (await menuLabels(app)).length).toBe(before + 1)
  return (await menuLabels(app))[before] ?? []
}

/** Click an item of the last menu that Shifted showed. */
async function clickLastMenuItem(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate((_electron, wanted) => {
    const menus = (globalThis as MenuStore).shiftedTestMenus ?? []
    const item = menus.at(-1)?.items.find((candidate) => candidate.label === wanted)
    if (!item) throw new Error(`The context menu has no item "${wanted}".`)
    if (!item.enabled) throw new Error(`The item "${wanted}" is not enabled.`)
    ;(item.click as () => void)()
  }, label)
}

test('a right-click on an outside link in Gmail opens it in the default browser', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
  const gmail = await gmailViewPage(shifted, fakeGoogle)
  await catchMenus(shifted)

  // On macOS, a right-click on a link also selects its text, so Copy and "Look up" follow.
  const outside = await rightClick(shifted, gmail.locator('#outside-link'))
  expect(outside.slice(0, 2)).toEqual(['Open link in browser', 'Copy link address'])
  await clickLastMenuItem(shifted, 'Open link in browser')
  await expect.poll(async () => (await testRecords(shifted)).openExternal).toEqual([OUTSIDE_LINK])

  // A Calendar link stays in Shifted: its menu has no "Open link in browser".
  const calendar = await rightClick(shifted, gmail.locator('#calendar-link'))
  expect(calendar[0]).toBe('Copy link address')
  expect(calendar).not.toContain('Open link in browser')
})

test('a right-click in a text field of Gmail shows the edit commands', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
  const gmail = await gmailViewPage(shifted, fakeGoogle)
  await catchMenus(shifted)

  const search = gmail.locator('#search')
  await search.fill('lunch')
  const labels = await rightClick(shifted, search)
  expect(labels).toEqual(
    expect.arrayContaining(['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select all'])
  )
  await clickLastMenuItem(shifted, 'Select all')
  await expect
    .poll(() =>
      search.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])
    )
    .toEqual([0, 'lunch'.length])
})

test('a page that shows its own context menu gets no menu from Shifted', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
  const gmail = await gmailViewPage(shifted, fakeGoogle)
  await catchMenus(shifted)

  // The fake page stops the right-click on this link, as Gmail does in the message list.
  await gmail.locator('#own-menu-link').click({ button: 'right' })
  // The next right-click shows the first menu, so the link above showed none.
  expect(await rightClick(shifted, gmail.locator('#outside-link'))).toContain('Copy link address')
  expect(await menuLabels(shifted)).toHaveLength(1)
})

test('a right-click in a text field of the configuration window shows Paste', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
  await chooseFromAccountMenu(shifted, sidebarAccount(mainWindow, FAKE_ADDRESS), 'Rename')
  const settings = await settingsWindowPage(shifted)
  await catchMenus(shifted)

  expect(await rightClick(shifted, settings.getByLabel('Nickname'))).toContain('Paste')
})
