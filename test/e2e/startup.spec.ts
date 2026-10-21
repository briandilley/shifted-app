import { test, expect } from './fixtures'

test('Shifted starts with one window called "Shifted" that shows "No accounts yet"', async ({
  shifted,
  mainWindow,
  userDataDir
}) => {
  await expect(mainWindow.getByText('No accounts yet')).toBeVisible()
  await expect(mainWindow).toHaveTitle('Shifted')

  const window = await shifted.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows()
    const [first] = windows
    return {
      count: windows.length,
      title: first?.getTitle()
    }
  })
  expect(window.count).toBe(1)
  expect(window.title).toBe('Shifted')

  // Each test has its own user data folder.
  const userData = await shifted.evaluate(({ app }) => app.getPath('userData'))
  expect(userData).toBe(userDataDir)
})

test('the user agent keeps the Electron/ token and has the Shifted/ token', async ({
  mainWindow
}) => {
  const userAgent = await mainWindow.evaluate(() => navigator.userAgent)
  expect(userAgent).toMatch(/\bElectron\/\d+/)
  expect(userAgent).toMatch(/\bShifted\/\d+\.\d+\.\d+/)
})

test('the screens of Shifted have no access to Node.js', async ({ mainWindow }) => {
  const access = await mainWindow.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    shifted: typeof (globalThis as Record<string, unknown>)['shifted']
  }))
  expect(access).toEqual({ require: 'undefined', process: 'undefined', shifted: 'object' })
})
