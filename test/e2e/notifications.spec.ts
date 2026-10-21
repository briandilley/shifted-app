import type { ElectronApplication, Page } from '@playwright/test'
import {
  FAKE_CHAT_TITLE,
  FAKE_REMINDER_TITLE,
  type FakeFeedEntry,
  type FakeGoogleServer
} from '../fake-google/server'
import {
  accountIdOf,
  addAccountAndSignIn,
  chooseFromAccountMenu,
  clickAppMenuItem,
  clickRecordedNotification,
  evaluateInContentArea,
  expect,
  readConfig,
  recordedNotifications,
  settingsWindowPage,
  sidebarAccount,
  test,
  unreadBadge,
  visibleGoogleApp
} from './fixtures'

const ONE = 'one@example.com'
const TWO = 'two@example.com'

function message(id: string, title: string, authorName: string): FakeFeedEntry {
  return {
    id,
    title,
    authorName,
    authorEmail: `${authorName.toLowerCase().replace(/\W+/g, '.')}@example.com`,
    issued: '2026-10-21T09:00:00Z'
  }
}

/**
 * Add two accounts. Account 1 starts with one unread message. Shifted reads its feed once
 * without notifications. Account 2 is selected at the end.
 */
async function addTwoAccounts(
  app: ElectronApplication,
  mainWindow: Page,
  fakeGoogle: FakeGoogleServer
): Promise<void> {
  await fakeGoogle.setFeed({
    address: ONE,
    feed: 'primary',
    count: 1,
    entries: [message('m1', 'Old message', 'Old Sender')]
  })
  await addAccountAndSignIn(app, mainWindow, fakeGoogle, ONE)
  await expect(unreadBadge(mainWindow, ONE)).toHaveText('1')
  await addAccountAndSignIn(app, mainWindow, fakeGoogle, TWO)
  await expect(sidebarAccount(mainWindow, TWO)).toHaveAttribute('aria-current', 'true')
}

test('a new fake entry records one new-mail notification, and its click opens the message', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addTwoAccounts(shifted, mainWindow, fakeGoogle)
  // The first read of each account only filled the set of seen messages.
  expect(await recordedNotifications(shifted)).toEqual([])

  await fakeGoogle.addFeedEntry({ address: ONE, entry: message('m2', 'Lunch on Friday?', 'Ana') })
  // Shifted reads the feed of an account when you switch to it.
  await sidebarAccount(mainWindow, ONE).click()
  await expect(unreadBadge(mainWindow, ONE)).toHaveText('2')
  await expect
    .poll(() => recordedNotifications(shifted))
    .toEqual([
      {
        accountId: accountIdOf(userDataDir, ONE),
        kind: 'new-mail',
        title: ONE,
        body: 'Ana\nLunch on Friday?'
      }
    ])

  // Click the notification while account 2 shows: account 1 and its Gmail tab show the message.
  await sidebarAccount(mainWindow, TWO).click()
  await expect(sidebarAccount(mainWindow, TWO)).toHaveAttribute('aria-current', 'true')
  await clickRecordedNotification(shifted, 0)
  await expect(sidebarAccount(mainWindow, ONE)).toHaveAttribute('aria-current', 'true')
  await expect(mainWindow.getByRole('tab', { name: 'Gmail' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({
      url: `${fakeGoogle.url}/gmail/?message_id=m2&view=conv&extsrc=atom`,
      address: ONE
    })
})

test('more than 3 new messages give one summary, and the nickname is the title', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addTwoAccounts(shifted, mainWindow, fakeGoogle)
  await chooseFromAccountMenu(shifted, sidebarAccount(mainWindow, ONE), 'Rename')
  const settings = await settingsWindowPage(shifted)
  await settings.getByLabel('Nickname').fill('Work')
  await expect.poll(() => readConfig(userDataDir).accounts[0]?.nickname).toBe('Work')

  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    await fakeGoogle.addFeedEntry({ address: ONE, entry: message(id, `Subject ${id}`, 'Bo') })
  }
  await sidebarAccount(mainWindow, 'Work').click()
  await expect
    .poll(() => recordedNotifications(shifted))
    .toEqual([
      {
        accountId: accountIdOf(userDataDir, ONE),
        kind: 'new-mail',
        title: 'Work',
        body: '5 new messages'
      }
    ])
})

test('a fake Calendar reminder is recorded as a Calendar reminder, and its click calls the page', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addTwoAccounts(shifted, mainWindow, fakeGoogle)
  await sidebarAccount(mainWindow, ONE).click()
  const calendarTab = mainWindow.getByRole('tab', { name: 'Calendar' })
  await calendarTab.click()
  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({ url: `${fakeGoogle.url}/calendar/`, address: ONE })

  // The replacement of the preload script reports the permission of the page as granted.
  // The preload script gives the page no Node.js.
  expect(await evaluateInContentArea(shifted, 'Notification.permission')).toBe('granted')
  expect(await evaluateInContentArea(shifted, "typeof require + ' ' + typeof process")).toBe(
    'undefined undefined'
  )
  await evaluateInContentArea(shifted, "document.getElementById('notify').click()")
  await expect
    .poll(() => recordedNotifications(shifted))
    .toEqual([
      {
        accountId: accountIdOf(userDataDir, ONE),
        kind: 'calendar',
        title: FAKE_REMINDER_TITLE,
        body: 'Planning, 10:00 to 10:30'
      }
    ])

  // A web notification of Gmail is a Chat message of that account.
  await sidebarAccount(mainWindow, TWO).click()
  await expect.poll(() => visibleGoogleApp(shifted)).toMatchObject({ address: TWO })
  await evaluateInContentArea(shifted, "document.getElementById('chat-notify').click()")
  await expect
    .poll(async () => (await recordedNotifications(shifted))[1])
    .toEqual({
      accountId: accountIdOf(userDataDir, TWO),
      kind: 'chat',
      title: FAKE_CHAT_TITLE,
      body: 'Are you free for lunch?'
    })

  // A click on the reminder selects account 1 and its Calendar tab, then calls `onclick`.
  await clickRecordedNotification(shifted, 0)
  await expect(sidebarAccount(mainWindow, ONE)).toHaveAttribute('aria-current', 'true')
  await expect(calendarTab).toHaveAttribute('aria-selected', 'true')
  await expect
    .poll(() =>
      evaluateInContentArea(shifted, "document.getElementById('notification-status').textContent")
    )
    .toBe('clicked')
})

test('snooze records no notification, but the badge changes', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addTwoAccounts(shifted, mainWindow, fakeGoogle)

  // Cmd+Shift+S opens the snooze choices as a small menu.
  const accelerator = await shifted.evaluate(
    ({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('snooze-choices')?.accelerator
  )
  expect(accelerator).toBe('CmdOrCtrl+Shift+S')
  await shifted.evaluate(({ Menu }) => {
    const store = globalThis as { shiftedTestMenu?: Electron.Menu | null }
    store.shiftedTestMenu = null
    Menu.prototype.popup = function (this: Electron.Menu): void {
      store.shiftedTestMenu = this
    }
  })
  await clickAppMenuItem(shifted, 'snooze-choices')
  const labels = await shifted.evaluate(() => {
    const menu = (globalThis as { shiftedTestMenu?: Electron.Menu | null }).shiftedTestMenu
    return (menu?.items ?? []).filter((item) => item.type !== 'separator').map((i) => i.label)
  })
  expect(labels).toEqual([
    'Notifications are on',
    'For 30 minutes',
    'For 1 hour',
    'Until 8:00 tomorrow',
    'Until I turn it off',
    'Stop snooze'
  ])

  // Snooze for 30 minutes from the "Snooze" submenu of the app menu.
  await clickAppMenuItem(shifted, 'snooze-30-minutes')
  await expect.poll(() => readConfig(userDataDir).snooze?.until ?? 0).toBeGreaterThan(Date.now())

  await fakeGoogle.addFeedEntry({ address: ONE, entry: message('m2', 'During snooze', 'Ana') })
  await sidebarAccount(mainWindow, ONE).click()
  await expect(unreadBadge(mainWindow, ONE)).toHaveText('2')
  // A Calendar reminder during snooze is dropped too.
  await mainWindow.getByRole('tab', { name: 'Calendar' }).click()
  await expect.poll(() => visibleGoogleApp(shifted)).toMatchObject({ title: 'Calendar' })
  await evaluateInContentArea(shifted, "document.getElementById('notify').click()")
  await sidebarAccount(mainWindow, TWO).click()
  await expect(sidebarAccount(mainWindow, TWO)).toHaveAttribute('aria-current', 'true')
  expect(await recordedNotifications(shifted)).toEqual([])

  // The Notifications page shows the snooze, and its button stops it.
  await clickAppMenuItem(shifted, 'settings')
  const settings = await settingsWindowPage(shifted)
  await settings.getByRole('button', { name: 'Notifications', exact: true }).click()
  await expect(
    settings.getByText(
      "Keep Gmail's own desktop notifications for new mail off. Shifted already shows them."
    )
  ).toBeVisible()
  await expect(settings.locator('[data-snooze-state]')).toHaveText(/^Snoozed until /)
  await settings.getByRole('button', { name: 'Stop snooze' }).click()
  await expect(settings.locator('[data-snooze-state]')).toHaveText(
    'Notifications are on. Snooze is off.'
  )
  await expect.poll(() => readConfig(userDataDir).snooze ?? null).toBeNull()

  // The message that snooze stopped does not show later. A new message shows.
  await fakeGoogle.addFeedEntry({ address: ONE, entry: message('m3', 'After snooze', 'Ana') })
  await sidebarAccount(mainWindow, ONE).click()
  await expect(unreadBadge(mainWindow, ONE)).toHaveText('3')
  await expect
    .poll(() => recordedNotifications(shifted))
    .toEqual([
      {
        accountId: accountIdOf(userDataDir, ONE),
        kind: 'new-mail',
        title: ONE,
        body: 'Ana\nAfter snooze'
      }
    ])
})

test('the account page shows the switches and the quiet hours, and the new-mail switch works', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addTwoAccounts(shifted, mainWindow, fakeGoogle)
  await chooseFromAccountMenu(shifted, sidebarAccount(mainWindow, ONE), 'Notifications')
  const settings = await settingsWindowPage(shifted)

  const newMail = settings.getByRole('switch', { name: 'New mail' })
  await expect(newMail).toBeFocused()
  await expect(newMail).toBeChecked()
  await expect(settings.getByRole('switch', { name: 'Calendar reminders' })).toBeChecked()
  await expect(settings.getByRole('switch', { name: 'Chat messages' })).toBeChecked()

  // Quiet hours: on, every day from 23:00 to 06:30, and all day on Sunday.
  await settings.getByRole('switch', { name: 'Quiet hours' }).check()
  await settings.getByLabel('Quiet every day from').fill('23:00')
  await settings.getByLabel('to', { exact: true }).fill('06:30')
  await settings.getByRole('checkbox', { name: 'Sunday' }).check()
  await expect
    .poll(() => readConfig(userDataDir).accounts[0]?.quietHours)
    .toEqual({ enabled: true, start: '23:00', end: '06:30', days: [0] })
  await settings.getByRole('switch', { name: 'Quiet hours' }).uncheck()

  await newMail.uncheck()
  await expect
    .poll(() => readConfig(userDataDir).accounts[0]?.notifications)
    .toEqual({ 'new-mail': false, calendar: true, chat: true })

  await fakeGoogle.addFeedEntry({ address: ONE, entry: message('m2', 'Switch is off', 'Ana') })
  await sidebarAccount(mainWindow, ONE).click()
  await expect(unreadBadge(mainWindow, ONE)).toHaveText('2')
  await sidebarAccount(mainWindow, TWO).click()
  await expect(sidebarAccount(mainWindow, TWO)).toHaveAttribute('aria-current', 'true')
  expect(await recordedNotifications(shifted)).toEqual([])
})
