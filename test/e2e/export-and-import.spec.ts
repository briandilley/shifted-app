import type { ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  EMAIL_HELP,
  EMAIL_SUBJECT,
  exportConfiguration,
  readExportedConfiguration,
  TEXT_FORM_BEGIN,
  toFileForm
} from '../../src/main/config-transfer'
import { emptyConfig, newAccount, type AccountConfig, type Config } from '../../src/main/config'
import { parseMailto } from '../../src/main/mailto'
import {
  addAccountAndSignIn,
  evaluateInContentArea,
  expect,
  expectFakeGmail,
  findPage,
  importWindowPage,
  openSettingsFromAppMenu,
  readConfig,
  settingsWindowPage,
  sidebar,
  sidebarAccount,
  sidebarAccountNames,
  test,
  unreadBadge,
  visibleGoogleApp,
  windowCount
} from './fixtures'

const ONE = 'one@example.com'
const TWO = 'two@example.com'
const THREE = 'three@example.com'

/** An exported file with these accounts, in this order, in a new temporary folder. */
function writeExportedFile(
  folder: string,
  values: { email: string; nickname: string; color: string }[]
): string {
  const accounts: AccountConfig[] = []
  for (const value of values) accounts.push({ ...newAccount(accounts), ...value })
  const other: Config = {
    ...emptyConfig(),
    general: { askWhereToSave: true, backgroundLoading: 'everything', openAtLogin: false },
    accounts
  }
  const filePath = join(folder, 'Shifted configuration 2026-10-21.json')
  writeFileSync(filePath, toFileForm(exportConfiguration(other)))
  return filePath
}

/** A temporary folder for the files of one test. Tests never write to the Documents folder. */
function temporaryFolder(): string {
  return mkdtempSync(join(tmpdir(), 'shifted-transfer-'))
}

/** Make `dialog.showSaveDialog` answer with this path, and keep the options that it got. */
async function answerSaveDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    const store = globalThis as { shiftedTestSaveOptions?: Electron.SaveDialogOptions }
    const answer = (...args: unknown[]): Promise<Electron.SaveDialogReturnValue> => {
      store.shiftedTestSaveOptions = args.at(-1) as Electron.SaveDialogOptions
      return Promise.resolve({ canceled: false, filePath: path })
    }
    dialog.showSaveDialog = answer as typeof dialog.showSaveDialog
  }, filePath)
}

/** Make `dialog.showOpenDialog` answer with this file. */
async function answerOpenDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    const answer = (): Promise<Electron.OpenDialogReturnValue> =>
      Promise.resolve({ canceled: false, filePaths: [path] })
    dialog.showOpenDialog = answer as typeof dialog.showOpenDialog
  }, filePath)
}

/** The accounts in `config.json`. Shifted writes no file before the first change. */
function savedAccounts(userDataDir: string): unknown[] {
  return existsSync(join(userDataDir, 'config.json')) ? readConfig(userDataDir).accounts : []
}

/** The `url` parameter that the fake Gmail in the content area received, or `null`. */
function composeUrlInContentArea(app: ElectronApplication): Promise<unknown> {
  return evaluateInContentArea(app, `document.getElementById('compose-url')?.textContent ?? null`)
}

test('"Export configuration…" saves the file form, and the import reads it', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await openSettingsFromAppMenu(shifted)
  const settings = await settingsWindowPage(shifted)
  await settings.getByRole('button', { name: ONE }).click()
  await settings.getByLabel('Nickname').fill('Personal')
  await settings.getByRole('radio', { name: 'Purple' }).check()
  await expect.poll(() => readConfig(userDataDir).accounts[0]?.color).toBe('#A142F4')
  await settings.getByRole('button', { name: 'General' }).click()

  const folder = temporaryFolder()
  try {
    const filePath = join(folder, 'Shifted configuration test.json')
    await answerSaveDialog(shifted, filePath)
    await settings.getByRole('button', { name: 'Export configuration…' }).click()
    await expect(settings.locator('[data-export-status]')).toHaveText(
      'Saved Shifted configuration test.json.'
    )

    // The dialog starts in the Documents folder, with the date in the name.
    const { options, documents } = await shifted.evaluate(({ app }) => ({
      options: (globalThis as { shiftedTestSaveOptions?: Electron.SaveDialogOptions })
        .shiftedTestSaveOptions,
      documents: app.getPath('documents')
    }))
    const today = await shifted.evaluate(() => {
      const now = new Date()
      const pad = (value: number): string => String(value).padStart(2, '0')
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    })
    expect(options?.defaultPath).toBe(join(documents, `Shifted configuration ${today}.json`))

    expect(existsSync(filePath)).toBe(true)
    const text = readFileSync(filePath, 'utf8')
    expect(text.split('\n')[1]).toBe('  "format": "shifted-configuration",')
    const result = readExportedConfiguration(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.configuration.accounts).toEqual([
      expect.objectContaining({ email: ONE, nickname: 'Personal', color: '#A142F4' })
    ])
    // No sign-in and no ID leave the computer.
    expect(text).not.toContain(readConfig(userDataDir).accounts[0]?.id ?? 'no id')
    expect(text).not.toContain('FAKE_SID')
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('"Email it to myself" opens a new message to the selected account with the text form', async ({
  shifted,
  mainWindow,
  fakeGoogle
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, TWO)
  await sidebarAccount(mainWindow, ONE).click()
  await openSettingsFromAppMenu(shifted)
  const settings = await settingsWindowPage(shifted)
  await settings.getByRole('button', { name: 'Email it to myself' }).click()

  await expect.poll(() => composeUrlInContentArea(shifted)).toEqual(expect.any(String))
  await expect
    .poll(() => visibleGoogleApp(shifted))
    .toMatchObject({ address: ONE, url: expect.stringContaining('/gmail/?extsrc=mailto&url=') })
  const link = String(await composeUrlInContentArea(shifted))
  const fields = parseMailto(link)
  expect(fields?.to).toEqual([ONE])
  expect(fields?.subject).toBe(EMAIL_SUBJECT)
  expect(fields?.body.startsWith(`${EMAIL_HELP}\r\n\r\n${TEXT_FORM_BEGIN}\r\n`)).toBe(true)
  const result = readExportedConfiguration(fields?.body ?? '')
  expect(result.ok && result.configuration.accounts.map((account) => account.email)).toEqual([
    ONE,
    TWO
  ])
  // The main window comes to the front. Shifted sends nothing: the message waits for Send.
  expect(
    await shifted.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getFocusedWindow()?.webContents.getURL()
    )
  ).not.toContain('#settings')

  // Pasting the whole message into the import window of the same computer changes nothing.
  await settings.getByRole('button', { name: 'Import configuration…' }).click()
  const importWindow = await importWindowPage(shifted)
  await importWindow
    .getByLabel('Or paste the message')
    .fill(`To: ${ONE}\nSubject: ${EMAIL_SUBJECT}\n\n${fields?.body ?? ''}\n-- \nSent by me`)
  await importWindow.getByRole('button', { name: 'Continue' }).click()
  await expect(
    importWindow.getByText('This configuration changes nothing on this computer.')
  ).toBeVisible()
  await expect(importWindow.getByRole('button', { name: 'Import' })).toBeDisabled()
})

test.describe('import into an empty user data folder', () => {
  // Read the feeds often, so that a read of an account with no sign-in would show.
  test.use({ shiftedEnv: { SHIFTED_TEST_READ_INTERVAL_MS: '300' } })

  test('shows the accounts with their nicknames and colors, and a Sign in panel for each', async ({
    shifted,
    mainWindow,
    fakeGoogle,
    userDataDir
  }) => {
    // The file that another computer exported.
    const folder = temporaryFolder()
    try {
      const filePath = writeExportedFile(folder, [
        { email: ONE, nickname: 'Personal', color: '#D93025' },
        { email: TWO, nickname: 'Work', color: '#A142F4' }
      ])

      // With no accounts, "Import configuration…" is next to "Add account".
      await expect(sidebar(mainWindow).getByRole('button', { name: 'Add account' })).toBeVisible()
      await sidebar(mainWindow).getByRole('button', { name: 'Import configuration…' }).click()
      const importWindow = await importWindowPage(shifted)

      // Broken text changes nothing and says why.
      await importWindow.getByLabel('Or paste the message').fill('{"format": "something"}')
      await importWindow.getByRole('button', { name: 'Continue' }).click()
      await expect(importWindow.getByRole('alert')).toHaveText(
        'Shifted cannot read this configuration.'
      )
      expect(savedAccounts(userDataDir)).toEqual([])

      // The file shows what will change before anything changes.
      await answerOpenDialog(shifted, filePath)
      await importWindow.getByRole('button', { name: 'Choose file…' }).click()
      const preview = importWindow.locator('[data-import-preview]')
      await expect(preview.getByRole('list', { name: 'Changes' }).getByRole('listitem')).toHaveText(
        [`Add 2 accounts: Personal (${ONE}), Work (${TWO}).`, 'Replace the General values.']
      )
      await expect(importWindow.getByRole('button', { name: 'Cancel' })).toBeVisible()
      expect(savedAccounts(userDataDir)).toEqual([])

      await importWindow.getByRole('button', { name: 'Import' }).click()
      await expect.poll(() => windowCount(shifted)).toBe(1)

      // The sidebar shows the accounts with their nicknames and colors.
      await expect
        .poll(() => sidebarAccountNames(mainWindow))
        .toEqual([`Personal, ${ONE}`, `Work, ${TWO}`])
      await expect(sidebarAccount(mainWindow, 'Personal').locator('[data-color]')).toHaveAttribute(
        'data-color',
        '#D93025'
      )
      await expect(sidebarAccount(mainWindow, 'Work').locator('[data-color]')).toHaveAttribute(
        'data-color',
        '#A142F4'
      )
      await expect(
        sidebar(mainWindow).getByRole('button', { name: 'Import configuration…' })
      ).toHaveCount(0)

      // New IDs, no sessions yet, and the General values of the file.
      const config = readConfig(userDataDir)
      expect(config.accounts.map((account) => account.signInNeeded)).toEqual([true, true])
      expect(config.general.askWhereToSave).toBe(true)

      // Each account shows the Sign in panel, and Shifted does not read its feed.
      await expect(mainWindow.getByText(`Sign in to ${ONE}.`)).toBeVisible()
      await sidebarAccount(mainWindow, 'Work').click()
      await expect(mainWindow.getByText(`Sign in to ${TWO}.`)).toBeVisible()
      await mainWindow.waitForTimeout(1500)
      await expect(unreadBadge(mainWindow, 'Personal')).toHaveCount(0)
      await expect(unreadBadge(mainWindow, 'Work')).toHaveCount(0)

      // The sign-in window gets the address of the account.
      await mainWindow.getByRole('button', { name: 'Sign in', exact: true }).click()
      await expect(mainWindow.getByText('Signing in…')).toBeVisible()
      await expect.poll(() => windowCount(shifted)).toBe(2)
      const signInPage = await findPage(shifted, (url) =>
        url.startsWith(`${fakeGoogle.url}/signin?`)
      )
      expect(new URL(signInPage.url()).searchParams.get('Email')).toBe(TWO)
      await expect(signInPage.locator('#email-param')).toHaveText(TWO)
      await expect(signInPage.getByLabel('Email')).toHaveValue(TWO)
      await signInPage.getByRole('button', { name: 'Sign in' }).click()

      // After sign-in, the account shows Gmail and keeps its values.
      await expectFakeGmail(shifted, fakeGoogle, TWO)
      await expect.poll(() => readConfig(userDataDir).accounts[1]?.signInNeeded).toBeUndefined()
      expect(readConfig(userDataDir).accounts[1]).toMatchObject({
        email: TWO,
        nickname: 'Work',
        color: '#A142F4'
      })
      expect(readConfig(userDataDir).accounts[0]?.signInNeeded).toBe(true)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

test('an import keeps a signed-in account with the same address, and adds the new accounts', async ({
  shifted,
  mainWindow,
  fakeGoogle,
  userDataDir
}) => {
  await addAccountAndSignIn(shifted, mainWindow, fakeGoogle, ONE)
  const signedInId = readConfig(userDataDir).accounts[0]?.id

  const folder = temporaryFolder()
  try {
    // The file has the signed-in account (with other capital letters) and two more.
    const filePath = writeExportedFile(folder, [
      { email: TWO, nickname: 'Work', color: '#A142F4' },
      { email: 'One@Example.com', nickname: 'Personal', color: '#188038' },
      { email: THREE, nickname: 'Club', color: '#F9AB00' }
    ])
    await openSettingsFromAppMenu(shifted)
    const settings = await settingsWindowPage(shifted)
    await settings.getByRole('button', { name: 'Import configuration…' }).click()
    const importWindow = await importWindowPage(shifted)
    await answerOpenDialog(shifted, filePath)
    await importWindow.getByRole('button', { name: 'Choose file…' }).click()
    await expect(
      importWindow.getByRole('list', { name: 'Changes' }).getByRole('listitem')
    ).toHaveText([
      `Add 2 accounts: Work (${TWO}), Club (${THREE}).`,
      `Update 1 account: Personal (${ONE}).`,
      'Replace the General values.'
    ])
    await importWindow.getByRole('button', { name: 'Import' }).click()
    await expect.poll(() => windowCount(shifted)).toBe(2)

    // The sidebar takes the order of the import.
    await expect
      .poll(() => sidebarAccountNames(mainWindow))
      .toEqual([`Work, ${TWO}`, `Personal, ${ONE}`, `Club, ${THREE}`])
    const config = readConfig(userDataDir)
    expect(config.accounts.find((account) => account.email === ONE)).toMatchObject({
      id: signedInId,
      nickname: 'Personal',
      color: '#188038'
    })
    expect(config.accounts.find((account) => account.email === ONE)?.signInNeeded).toBeUndefined()

    // The signed-in account keeps its fake Gmail.
    await sidebarAccount(mainWindow, 'Personal').click()
    await expect
      .poll(() => visibleGoogleApp(shifted))
      .toMatchObject({ url: `${fakeGoogle.url}/gmail/`, address: ONE })

    // The two new accounts show the Sign in panel.
    await sidebarAccount(mainWindow, 'Work').click()
    await expect(mainWindow.getByText(`Sign in to ${TWO}.`)).toBeVisible()
    await sidebarAccount(mainWindow, 'Club').click()
    await expect(mainWindow.getByText(`Sign in to ${THREE}.`)).toBeVisible()
    await expect(mainWindow.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
