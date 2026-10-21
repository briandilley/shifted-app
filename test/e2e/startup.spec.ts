import { accountBackdrop } from '../../src/shared/account-colors'
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

  // The frame of DESIGN.md: the minimum size, and the backdrop --base with no account as the
  // background color of the window and of the frame view.
  const frame = await shifted.evaluate(({ BrowserWindow, nativeTheme }) => {
    const [first] = BrowserWindow.getAllWindows()
    return {
      minimumSize: first?.getMinimumSize(),
      backgroundColor: first?.getBackgroundColor().toUpperCase(),
      dark: nativeTheme.shouldUseDarkColors
    }
  })
  const base = accountBackdrop(null, frame.dark ? 'dark' : 'light')
  expect(frame.minimumSize).toEqual([900, 600])
  expect(frame.backgroundColor).toBe(base)
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(base.slice(start, start + 2), 16))
  await expect(mainWindow.locator('[data-frame-view]')).toHaveCSS(
    'background-color',
    `rgb(${r}, ${g}, ${b})`
  )

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
