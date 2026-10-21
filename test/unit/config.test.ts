import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defaultNotificationSwitches,
  defaultQuietHours,
  type GeneralConfig
} from '../../src/shared/api'
import {
  ACCOUNT_COLORS,
  CONFIG_VERSION,
  ConfigStore,
  moveAccount,
  newAccount,
  nextAccountColor,
  parseConfig,
  type AccountConfig,
  type Config
} from '../../src/main/config'

const ACCOUNT: AccountConfig = {
  id: '0b6f0a5e-3f0c-4a51-9d3b-6f1f6c1c2a10',
  email: 'name@example.com',
  nickname: 'Work',
  color: '#1A73E8',
  order: 0,
  lastGoogleApp: 'gmail',
  pagePermissions: {},
  unreadCountSource: 'automatic',
  automaticFeed: null,
  notifications: defaultNotificationSwitches(),
  quietHours: defaultQuietHours()
}

const GENERAL: GeneralConfig = {
  askWhereToSave: false,
  backgroundLoading: 'everything',
  openAtLogin: false
}
const MAILTO = { defaultAccountId: null, lastAccountId: null }

describe('ConfigStore', () => {
  let dir: string
  let store: ConfigStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shifted-config-'))
    store = new ConfigStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('starts with an empty list when the file is missing', () => {
    expect(store.load()).toEqual({
      version: CONFIG_VERSION,
      general: GENERAL,
      accounts: [],
      snooze: null,
      mailto: MAILTO
    })
    expect(existsSync(join(dir, 'config.broken.json'))).toBe(false)
  })

  it('writes config.json and reads it again', () => {
    const config: Config = {
      version: CONFIG_VERSION,
      general: { askWhereToSave: true, backgroundLoading: 'calendars-only', openAtLogin: true },
      accounts: [{ ...ACCOUNT, pagePermissions: { media: 'allow', 'clipboard-read': 'deny' } }],
      snooze: { until: 1_800_000_000_000 },
      mailto: { defaultAccountId: ACCOUNT.id, lastAccountId: ACCOUNT.id }
    }
    store.save(config)
    const json = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')) as unknown
    expect(json).toEqual(config)
    expect(new ConfigStore(dir).load()).toEqual(config)
  })

  it('writes atomically and leaves no temporary file', () => {
    store.save({
      version: CONFIG_VERSION,
      general: GENERAL,
      accounts: [ACCOUNT],
      snooze: null,
      mailto: MAILTO
    })
    store.save({
      version: CONFIG_VERSION,
      general: GENERAL,
      accounts: [],
      snooze: null,
      mailto: MAILTO
    })
    expect(readdirSync(dir)).toEqual(['config.json'])
    expect(store.load().accounts).toEqual([])
  })

  it('makes the folder if it does not exist', () => {
    const nested = new ConfigStore(join(dir, 'a', 'b'))
    nested.save({
      version: CONFIG_VERSION,
      general: GENERAL,
      accounts: [ACCOUNT],
      snooze: null,
      mailto: MAILTO
    })
    expect(nested.load().accounts).toEqual([ACCOUNT])
  })

  it('keeps a copy of a file that is not JSON and starts with an empty list', () => {
    writeFileSync(join(dir, 'config.json'), '{ this is not json')
    expect(store.load()).toEqual({
      version: CONFIG_VERSION,
      general: GENERAL,
      accounts: [],
      snooze: null,
      mailto: MAILTO
    })
    expect(readFileSync(join(dir, 'config.broken.json'), 'utf8')).toBe('{ this is not json')
    expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))).toEqual({
      version: 1,
      general: GENERAL,
      accounts: [],
      snooze: null,
      mailto: MAILTO
    })
  })

  it('keeps a copy of a file with a wrong format and starts with an empty list', () => {
    const broken = JSON.stringify({ version: 1, accounts: [{ ...ACCOUNT, id: '../../etc' }] })
    writeFileSync(join(dir, 'config.json'), broken)
    expect(store.load().accounts).toEqual([])
    expect(readFileSync(join(dir, 'config.broken.json'), 'utf8')).toBe(broken)
  })
})

describe('parseConfig', () => {
  it('accepts a valid configuration and sorts the accounts by order', () => {
    const second = { ...ACCOUNT, id: '5d1c9a0e-8f53-4b0a-a4a2-0e8a6f8b9c11', order: 1 }
    expect(parseConfig({ version: 1, accounts: [second, ACCOUNT] })?.accounts).toEqual([
      ACCOUNT,
      second
    ])
  })

  it('refuses a wrong version, a missing list, a wrong field, and a duplicate id', () => {
    expect(parseConfig({ version: 2, accounts: [] })).toBeUndefined()
    expect(parseConfig({ version: 1 })).toBeUndefined()
    expect(parseConfig([])).toBeUndefined()
    expect(parseConfig(null)).toBeUndefined()
    expect(parseConfig({ version: 1, accounts: [{ ...ACCOUNT, email: 3 }] })).toBeUndefined()
    expect(parseConfig({ version: 1, accounts: [{ ...ACCOUNT, order: -1 }] })).toBeUndefined()
    expect(
      parseConfig({ version: 1, accounts: [{ ...ACCOUNT, lastGoogleApp: 'drive' }] })
    ).toBeUndefined()
    expect(parseConfig({ version: 1, accounts: [ACCOUNT, ACCOUNT] })).toBeUndefined()
  })

  it('reads a file from phase 02, with no General values and no page permissions', () => {
    const oldAccount: Record<string, unknown> = { ...ACCOUNT }
    delete oldAccount['pagePermissions']
    expect(parseConfig({ version: 1, accounts: [oldAccount] })).toEqual({
      version: 1,
      general: GENERAL,
      accounts: [ACCOUNT],
      snooze: null,
      mailto: MAILTO
    })
  })

  it('refuses wrong General values and wrong page permissions', () => {
    const withPermissions = (pagePermissions: unknown): unknown => ({
      version: 1,
      accounts: [{ ...ACCOUNT, pagePermissions }]
    })
    expect(parseConfig({ version: 1, general: [], accounts: [] })).toBeUndefined()
    expect(
      parseConfig({ version: 1, general: { askWhereToSave: 'yes' }, accounts: [] })
    ).toBeUndefined()
    expect(parseConfig(withPermissions({ media: 'maybe' }))).toBeUndefined()
    expect(parseConfig(withPermissions({ geolocation: 'allow' }))).toBeUndefined()
    expect(parseConfig(withPermissions('allow'))).toBeUndefined()
    expect(parseConfig(withPermissions({ 'display-capture': 'deny' }))?.accounts[0]).toEqual({
      ...ACCOUNT,
      pagePermissions: { 'display-capture': 'deny' }
    })
  })

  it('reads a file from phase 06, with no "Background loading" and no "Open at login"', () => {
    expect(
      parseConfig({ version: 1, general: { askWhereToSave: true }, accounts: [] })?.general
    ).toEqual({ askWhereToSave: true, backgroundLoading: 'everything', openAtLogin: false })
  })

  it('reads and refuses values of "Background loading" and "Open at login"', () => {
    const general = (value: Record<string, unknown>): unknown => ({
      version: 1,
      general: value,
      accounts: []
    })
    expect(
      parseConfig(general({ backgroundLoading: 'selected-account-only', openAtLogin: true }))
        ?.general
    ).toEqual({
      askWhereToSave: false,
      backgroundLoading: 'selected-account-only',
      openAtLogin: true
    })
    expect(parseConfig(general({ backgroundLoading: 'some' }))).toBeUndefined()
    expect(parseConfig(general({ openAtLogin: 'yes' }))).toBeUndefined()
  })

  it('reads a file from phase 03, with no unread count source', () => {
    const oldAccount: Record<string, unknown> = { ...ACCOUNT }
    delete oldAccount['unreadCountSource']
    delete oldAccount['automaticFeed']
    expect(parseConfig({ version: 1, accounts: [oldAccount] })?.accounts[0]).toEqual({
      ...ACCOUNT,
      unreadCountSource: 'automatic',
      automaticFeed: null,
      // All three notification switches are on for a new account.
      notifications: { 'new-mail': true, calendar: true, chat: true },
      quietHours: { enabled: false, start: '22:00', end: '07:00', days: [] }
    })
  })

  it('reads every unread count source and refuses a wrong one', () => {
    const withSource = (unreadCountSource: unknown, automaticFeed: unknown = null): unknown => ({
      version: 1,
      accounts: [{ ...ACCOUNT, unreadCountSource, automaticFeed }]
    })
    for (const source of ['automatic', 'primary', 'whole-inbox', 'important']) {
      expect(parseConfig(withSource(source))?.accounts[0]?.unreadCountSource).toBe(source)
    }
    expect(parseConfig(withSource('automatic', 'whole-inbox'))?.accounts[0]?.automaticFeed).toBe(
      'whole-inbox'
    )
    expect(parseConfig(withSource('spam'))).toBeUndefined()
    expect(parseConfig(withSource('automatic', 'important'))).toBeUndefined()
    expect(parseConfig(withSource('automatic', 3))).toBeUndefined()
  })
})

describe('the notification configuration', () => {
  it('reads a file from phase 04, with no switches, no quiet hours, and no snooze', () => {
    const oldAccount: Record<string, unknown> = { ...ACCOUNT }
    delete oldAccount['notifications']
    delete oldAccount['quietHours']
    const config = parseConfig({ version: 1, accounts: [oldAccount] })
    expect(config?.accounts[0]?.notifications).toEqual({
      'new-mail': true,
      calendar: true,
      chat: true
    })
    expect(config?.accounts[0]?.quietHours).toEqual({
      enabled: false,
      start: '22:00',
      end: '07:00',
      days: []
    })
    expect(config?.snooze).toBeNull()
  })

  it('reads the switches, and a missing switch is on', () => {
    const config = parseConfig({
      version: 1,
      accounts: [{ ...ACCOUNT, notifications: { chat: false } }]
    })
    expect(config?.accounts[0]?.notifications).toEqual({
      'new-mail': true,
      calendar: true,
      chat: false
    })
  })

  it('reads quiet hours, and sorts the days', () => {
    const quietHours = { enabled: true, start: '18:00', end: '09:00', days: [6, 0, 6] }
    const config = parseConfig({ version: 1, accounts: [{ ...ACCOUNT, quietHours }] })
    expect(config?.accounts[0]?.quietHours).toEqual({ ...quietHours, days: [0, 6] })
  })

  it('reads a snooze until a time and a snooze until it is turned off', () => {
    expect(parseConfig({ version: 1, accounts: [], snooze: { until: 5 } })?.snooze).toEqual({
      until: 5
    })
    expect(parseConfig({ version: 1, accounts: [], snooze: { until: null } })?.snooze).toEqual({
      until: null
    })
  })

  it('refuses wrong switches, quiet hours, and snooze', () => {
    const withAccount = (change: Record<string, unknown>): unknown => ({
      version: 1,
      accounts: [{ ...ACCOUNT, ...change }]
    })
    expect(parseConfig(withAccount({ notifications: { email: true } }))).toBeUndefined()
    expect(parseConfig(withAccount({ notifications: { chat: 'off' } }))).toBeUndefined()
    const quiet = defaultQuietHours()
    expect(parseConfig(withAccount({ quietHours: { ...quiet, start: '24:00' } }))).toBeUndefined()
    expect(parseConfig(withAccount({ quietHours: { ...quiet, end: '7:00' } }))).toBeUndefined()
    expect(parseConfig(withAccount({ quietHours: { ...quiet, days: [7] } }))).toBeUndefined()
    expect(parseConfig(withAccount({ quietHours: { ...quiet, enabled: 1 } }))).toBeUndefined()
    expect(parseConfig({ version: 1, accounts: [], snooze: { until: 'later' } })).toBeUndefined()
    expect(parseConfig({ version: 1, accounts: [], snooze: 3 })).toBeUndefined()
  })

  it('reads a file from phase 05, with no account picker choices', () => {
    expect(parseConfig({ version: 1, accounts: [ACCOUNT] })?.mailto).toEqual(MAILTO)
  })

  it('reads the account picker choices and forgets an account that is not there', () => {
    const mailto = { defaultAccountId: ACCOUNT.id, lastAccountId: ACCOUNT.id }
    expect(parseConfig({ version: 1, accounts: [ACCOUNT], mailto })?.mailto).toEqual(mailto)
    const other = '5d1c9a0e-8f53-4b0a-a4a2-0e8a6f8b9c11'
    expect(
      parseConfig({
        version: 1,
        accounts: [ACCOUNT],
        mailto: { defaultAccountId: other, lastAccountId: null }
      })?.mailto
    ).toEqual(MAILTO)
  })

  it('refuses wrong account picker choices', () => {
    expect(parseConfig({ version: 1, accounts: [], mailto: 'yes' })).toBeUndefined()
    expect(
      parseConfig({ version: 1, accounts: [], mailto: { defaultAccountId: '../etc' } })
    ).toBeUndefined()
    expect(parseConfig({ version: 1, accounts: [], mailto: { lastAccountId: 3 } })).toBeUndefined()
  })
})

describe('newAccount', () => {
  it('makes an account with a UUID, empty email and nickname, and Gmail', () => {
    const account = newAccount([])
    expect(account.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(account).toMatchObject({
      email: '',
      nickname: '',
      color: ACCOUNT_COLORS[0],
      order: 0,
      lastGoogleApp: 'gmail',
      pagePermissions: {},
      unreadCountSource: 'automatic',
      automaticFeed: null
    })
  })

  it('gives the next order after the last account', () => {
    expect(newAccount([ACCOUNT])).toMatchObject({ order: 1 })
    const last = { ...ACCOUNT, id: '5d1c9a0e-8f53-4b0a-a4a2-0e8a6f8b9c11', order: 4 }
    expect(newAccount([last, ACCOUNT])).toMatchObject({ order: 5 })
  })
})

describe('the color of a new account', () => {
  /** Add `count` accounts one after the other, and return their colors. */
  function addAccounts(count: number): string[] {
    const accounts: AccountConfig[] = []
    for (let index = 0; index < count; index++) accounts.push(newAccount(accounts))
    return accounts.map((account) => account.color)
  }

  it('is the next color of the set of 8 colors', () => {
    expect(ACCOUNT_COLORS).toEqual([
      '#1A73E8',
      '#D93025',
      '#188038',
      '#F9AB00',
      '#A142F4',
      '#12B5CB',
      '#E8710A',
      '#5F6368'
    ])
    expect(addAccounts(8)).toEqual([...ACCOUNT_COLORS])
  })

  it('repeats the set after 8 accounts', () => {
    const colors = addAccounts(20)
    for (const [index, color] of colors.entries()) {
      expect(color).toBe(ACCOUNT_COLORS[index % 8])
    }
  })

  it('skips a color that an account already uses', () => {
    // Two accounts: the next color is color 2. An account uses it, so color 3 is next.
    const accounts = [
      { ...ACCOUNT, color: '#1A73E8' },
      { ...ACCOUNT, id: '5d1c9a0e-8f53-4b0a-a4a2-0e8a6f8b9c11', color: '#188038', order: 1 }
    ]
    expect(nextAccountColor(accounts)).toBe('#F9AB00')
  })

  it('compares colors without regard to case', () => {
    // One account: the next color is red. The account uses red in lower case.
    expect(nextAccountColor([{ ...ACCOUNT, color: '#d93025' }])).toBe('#188038')
  })
})

describe('moveAccount', () => {
  const ids = [
    '00000000-0000-4000-8000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333'
  ] as const
  const accounts: AccountConfig[] = ids.map((id, order) => ({ ...ACCOUNT, id, order }))

  /** The ids and the order values of the result, from top to bottom. */
  function summary(result: AccountConfig[]): [string, number][] {
    return result.map((account) => [account.id, account.order])
  }

  it('moves the last account to the top and gives the order values 0, 1, 2, 3', () => {
    expect(summary(moveAccount(accounts, ids[3], 0))).toEqual([
      [ids[3], 0],
      [ids[0], 1],
      [ids[1], 2],
      [ids[2], 3]
    ])
  })

  it('moves the first account down', () => {
    expect(summary(moveAccount(accounts, ids[0], 2))).toEqual([
      [ids[1], 0],
      [ids[2], 1],
      [ids[0], 2],
      [ids[3], 3]
    ])
  })

  it('puts an index out of range at the nearest end', () => {
    expect(summary(moveAccount(accounts, ids[1], 99)).at(-1)).toEqual([ids[1], 3])
    expect(summary(moveAccount(accounts, ids[2], -5))[0]).toEqual([ids[2], 0])
  })

  it('closes gaps in the order values and reads the accounts in their order', () => {
    const gaps = [
      { ...ACCOUNT, id: ids[2], order: 9 },
      { ...ACCOUNT, id: ids[0], order: 2 },
      { ...ACCOUNT, id: ids[1], order: 5 }
    ]
    expect(summary(moveAccount(gaps, ids[1], 1))).toEqual([
      [ids[0], 0],
      [ids[1], 1],
      [ids[2], 2]
    ])
  })

  it('keeps the order for an unknown account and does not change its input', () => {
    const copy = structuredClone(accounts)
    expect(summary(moveAccount(accounts, '44444444-4444-4444-8444-444444444444', 0))).toEqual(
      ids.map((id, order) => [id, order])
    )
    expect(accounts).toEqual(copy)
  })
})
