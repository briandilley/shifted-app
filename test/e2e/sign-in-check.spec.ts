/**
 * The sign-in check (see `src/main/sign-in-check.ts`): a signed-in Gmail session also
 * passes through Google's sign-in host, for example when Google sets the cookies of
 * Gmail. Shifted hides the page during the trip, and shows "This account is signed out."
 * only when the feed or the time limit says so.
 */
import type { ElectronApplication, Page } from '@playwright/test'
import type { FakeCookieHop, FakeGoogleServer } from '../fake-google/server'
import {
  addAccountAndSignIn,
  evaluateInContentArea,
  expect,
  expectFakeGmail,
  readConfig,
  test,
  visibleMainWindowPages
} from './fixtures'

interface SignInRecords {
  shiftedSignInShown?: string[]
}

/**
 * Record in the main process each time a visible Google view of the main window commits,
 * reaches the DOM of, or finishes loading a page on the fake sign-in path. The list must
 * stay empty: Google's sign-in page never shows in the content area.
 */
async function recordShownSignInPages(
  app: ElectronApplication,
  fakeGoogle: FakeGoogleServer
): Promise<void> {
  await app.evaluate(({ BrowserWindow, WebContentsView }, signInPath) => {
    const store = globalThis as SignInRecords
    store.shiftedSignInShown = []
    const main = BrowserWindow.getAllWindows().find(
      (window) => !window.webContents.getURL().includes('#')
    )
    const views = (main?.contentView.children ?? []).filter(
      (view): view is Electron.WebContentsView => view instanceof WebContentsView
    )
    for (const view of views) {
      const check = (): void => {
        const url = view.webContents.getURL()
        if (url.startsWith(signInPath) && view.getVisible()) store.shiftedSignInShown?.push(url)
      }
      view.webContents.on('did-navigate', check)
      view.webContents.on('dom-ready', check)
      view.webContents.on('did-finish-load', check)
    }
  }, `${fakeGoogle.url}/signin`)
}

function shownSignInPages(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => [...((globalThis as SignInRecords).shiftedSignInShown ?? [])])
}

/** Record in the main window each time the signed-out panel shows. */
async function recordSignedOutPanel(mainWindow: Page): Promise<void> {
  await mainWindow.evaluate(() => {
    const store = window as unknown as { shiftedSignedOutSeen?: boolean }
    store.shiftedSignedOutSeen = false
    const look = (): void => {
      if (document.body.textContent?.includes('This account is signed out.')) {
        store.shiftedSignedOutSeen = true
      }
    }
    new MutationObserver(look).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    })
    look()
  })
}

function signedOutPanelSeen(mainWindow: Page): Promise<boolean> {
  return mainWindow.evaluate(
    () => (window as unknown as { shiftedSignedOutSeen?: boolean }).shiftedSignedOutSeen === true
  )
}

/** Let the fake Gmail page go to `/gmail/?hop=<kind>`, as a script of Gmail does. */
async function startCookieHop(app: ElectronApplication, hop: FakeCookieHop): Promise<void> {
  await evaluateInContentArea(
    app,
    `setTimeout(() => location.assign('/gmail/?hop=${hop}'), 0); true`
  )
}

for (const hop of ['redirect', 'script', 'meta'] as const) {
  test(`a signed-in account that passes through the sign-in host (${hop}) keeps its Gmail`, async ({
    shifted,
    mainWindow,
    fakeGoogle,
    userDataDir
  }) => {
    await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
    await recordShownSignInPages(shifted, fakeGoogle)
    await recordSignedOutPanel(mainWindow)
    const hopsBefore = fakeGoogle.state.signInHops

    await startCookieHop(shifted, hop)
    await expect.poll(() => fakeGoogle.state.signInHops).toBe(hopsBefore + 1)
    await expectFakeGmail(shifted, fakeGoogle)

    expect(await shownSignInPages(shifted)).toEqual([])
    expect(await signedOutPanelSeen(mainWindow)).toBe(false)
    await expect(mainWindow.getByText('This account is signed out.')).toHaveCount(0)
    expect(readConfig(userDataDir).accounts).toHaveLength(1)
  })
}

test.describe('with a short time limit', () => {
  test.use({ shiftedEnv: { SHIFTED_TEST_SIGN_IN_CHECK_MS: '1500' } })

  test('a cookie hop that stays on the sign-in host: Shifted loads Gmail again once', async ({
    shifted,
    mainWindow,
    fakeGoogle
  }) => {
    await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
    await recordShownSignInPages(shifted, fakeGoogle)
    await recordSignedOutPanel(mainWindow)

    await startCookieHop(shifted, 'stuck')
    // The page is hidden while it is on the sign-in host. The content area says "Loading…".
    await expect(mainWindow.locator('[data-checking-sign-in]')).toHaveText('Loading…')
    await expect.poll(() => visibleMainWindowPages(shifted)).toEqual([])

    // After the limit, Shifted loads the first page of Gmail again, and Gmail shows.
    await expectFakeGmail(shifted, fakeGoogle)
    await expect(mainWindow.locator('[data-checking-sign-in]')).toHaveCount(0)
    expect(await shownSignInPages(shifted)).toEqual([])
    expect(await signedOutPanelSeen(mainWindow)).toBe(false)
  })

  test('a signed-out account whose feed fails for another reason is signed out after the limit', async ({
    shifted,
    mainWindow,
    fakeGoogle
  }) => {
    await addAccountAndSignIn(shifted, mainWindow, fakeGoogle)
    await recordShownSignInPages(shifted, fakeGoogle)
    const output: string[] = []
    shifted.process().stderr?.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')))
    shifted.process().stdout?.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')))

    // The feed answers HTTP 500, so it cannot tell. The page stays on the sign-in page.
    await fakeGoogle.setFeedFailure('http-500')
    await fakeGoogle.signOut()
    await shifted.evaluate(({ webContents }, gmailUrl) => {
      webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === gmailUrl)
        ?.reload()
    }, `${fakeGoogle.url}/gmail/`)

    await expect(mainWindow.getByText('This account is signed out.')).toBeVisible()
    await expect.poll(() => visibleMainWindowPages(shifted)).toEqual([])
    expect(await shownSignInPages(shifted)).toEqual([])
    // One line in the console of the main process names the page, with no query string.
    const port = new URL(fakeGoogle.url).port
    await expect
      .poll(() => output.join(''))
      .toMatch(
        new RegExp(`signed out: its gmail page went to 127\\.0\\.0\\.1:${port}/signin(\\s|$)`)
      )
  })
})
