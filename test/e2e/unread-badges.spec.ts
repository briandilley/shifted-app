import {
  addAccountAndSignIn,
  appBadgeTotal,
  chooseFromAccountMenu,
  expect,
  readConfig,
  settingsWindowPage,
  sidebarAccount,
  test,
  unreadBadge
} from './fixtures'

const ONE = 'one@example.com'
const TWO = 'two@example.com'

test('the sidebar badge shows the Primary count, and the app badge shows the sum', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await fakeGoogle.setFeed({ address: ONE, feed: 'primary', count: 3 })
  await fakeGoogle.setFeed({ address: TWO, feed: 'primary', count: 120 })
  await fakeGoogle.setFeed({ feed: 'whole-inbox', count: 4000 })

  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await expect(unreadBadge(mainWindow, ONE)).toHaveText('3')
  await expect.poll(() => appBadgeTotal(shifted)).toBe(3)

  // The fake Gmail title says "Inbox (3)". Only the Primary feed has 3, so "Automatic"
  // saves Primary for the account.
  await expect
    .poll(() => readConfig(userDataDir).accounts.find((a) => a.email === ONE)?.automaticFeed)
    .toBe('primary')

  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, TWO)
  await expect(unreadBadge(mainWindow, TWO)).toHaveText('99+')
  await expect.poll(() => appBadgeTotal(shifted)).toBe(123)

  // Shifted reads the feed of an account each time you switch to it.
  await fakeGoogle.setFeed({ address: ONE, feed: 'primary', count: 0 })
  await sidebarAccount(mainWindow, ONE).click()
  await expect(unreadBadge(mainWindow, ONE)).toHaveCount(0)
  await expect.poll(() => appBadgeTotal(shifted)).toBe(120)

  if (process.platform === 'darwin') {
    expect(await shifted.evaluate(({ app }) => app.dock?.getBadge())).toBe('120')
  }
})

test('a failing feed shows the warning mark, and the number comes back', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await fakeGoogle.setFeed({ feed: 'primary', count: 2 })
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, TWO)
  await expect(unreadBadge(mainWindow, ONE)).toHaveText('2')
  await expect(unreadBadge(mainWindow, TWO)).toHaveText('2')
  await expect.poll(() => appBadgeTotal(shifted)).toBe(4)

  await fakeGoogle.setFeedFailure(true)
  await sidebarAccount(mainWindow, ONE).click()
  const warning = unreadBadge(mainWindow, ONE)
  await expect(warning).toHaveAttribute('data-unread-badge', 'warning')
  await expect(warning).toHaveAttribute('title', /HTTP 500/)
  // An account with a warning mark adds nothing to the app badge.
  await expect.poll(() => appBadgeTotal(shifted)).toBe(2)

  // A feed that goes to the sign-in page also shows the warning mark.
  await fakeGoogle.setFeedFailure('sign-in-redirect')
  await sidebarAccount(mainWindow, TWO).click()
  await expect(unreadBadge(mainWindow, TWO)).toHaveAttribute('title', 'Signed out')
  await expect.poll(() => appBadgeTotal(shifted)).toBe(0)

  // The numbers come back on the next good read: here, when you switch to each account.
  await fakeGoogle.setFeedFailure(false)
  await sidebarAccount(mainWindow, ONE).click()
  await expect(unreadBadge(mainWindow, ONE)).toHaveText('2')
  await expect(unreadBadge(mainWindow, ONE)).toHaveAttribute('data-unread-badge', 'count')
  await sidebarAccount(mainWindow, TWO).click()
  await expect(unreadBadge(mainWindow, TWO)).toHaveText('2')
  await expect.poll(() => appBadgeTotal(shifted)).toBe(4)
})

test('the unread count source of an account, and the warning mark after sign-out', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await fakeGoogle.setFeed({ feed: 'primary', count: 1 })
  await fakeGoogle.setFeed({ feed: 'important', count: 7 })
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await expect(unreadBadge(mainWindow, ONE)).toHaveText('1')

  await chooseFromAccountMenu(shifted, sidebarAccount(mainWindow, ONE), 'Notifications')
  const settings = await settingsWindowPage(shifted)
  const source = settings.getByLabel('Unread count source')
  await expect(source).toHaveValue('automatic')
  await source.selectOption({ label: 'Important' })
  await expect(unreadBadge(mainWindow, ONE)).toHaveText('7')
  expect(readConfig(userDataDir).accounts[0]?.unreadCountSource).toBe('important')

  await source.selectOption({ label: 'Whole inbox' })
  await expect(unreadBadge(mainWindow, ONE)).toHaveCount(0)

  await chooseFromAccountMenu(shifted, sidebarAccount(mainWindow, ONE), 'Sign out')
  await expect(unreadBadge(mainWindow, ONE)).toHaveAttribute('title', 'Signed out')
})
