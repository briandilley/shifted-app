import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ACCOUNT_COLORS,
  CONFIG_VERSION,
  ConfigStore,
  newAccount,
  parseConfig,
  type AccountConfig,
  type Config
} from '../../src/main/config'

const ACCOUNT: AccountConfig = {
  id: '0b6f0a5e-3f0c-4a51-9d3b-6f1f6c1c2a10',
  email: 'name@example.com',
  nickname: 'Work',
  color: '#1a73e8',
  order: 0,
  lastGoogleApp: 'gmail'
}

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
    expect(store.load()).toEqual({ version: CONFIG_VERSION, accounts: [] })
    expect(existsSync(join(dir, 'config.broken.json'))).toBe(false)
  })

  it('writes config.json and reads it again', () => {
    const config: Config = { version: CONFIG_VERSION, accounts: [ACCOUNT] }
    store.save(config)
    const json = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')) as unknown
    expect(json).toEqual({ version: 1, accounts: [ACCOUNT] })
    expect(new ConfigStore(dir).load()).toEqual(config)
  })

  it('writes atomically and leaves no temporary file', () => {
    store.save({ version: CONFIG_VERSION, accounts: [ACCOUNT] })
    store.save({ version: CONFIG_VERSION, accounts: [] })
    expect(readdirSync(dir)).toEqual(['config.json'])
    expect(store.load().accounts).toEqual([])
  })

  it('makes the folder if it does not exist', () => {
    const nested = new ConfigStore(join(dir, 'a', 'b'))
    nested.save({ version: CONFIG_VERSION, accounts: [ACCOUNT] })
    expect(nested.load().accounts).toEqual([ACCOUNT])
  })

  it('keeps a copy of a file that is not JSON and starts with an empty list', () => {
    writeFileSync(join(dir, 'config.json'), '{ this is not json')
    expect(store.load()).toEqual({ version: CONFIG_VERSION, accounts: [] })
    expect(readFileSync(join(dir, 'config.broken.json'), 'utf8')).toBe('{ this is not json')
    expect(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))).toEqual({
      version: 1,
      accounts: []
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
      lastGoogleApp: 'gmail'
    })
  })

  it('gives the next order and the next color, and starts the colors again after 8', () => {
    expect(newAccount([ACCOUNT])).toMatchObject({ order: 1, color: ACCOUNT_COLORS[1] })
    const last = { ...ACCOUNT, color: ACCOUNT_COLORS[7] ?? '', order: 4 }
    expect(newAccount([ACCOUNT, last])).toMatchObject({ order: 5, color: ACCOUNT_COLORS[0] })
    expect(ACCOUNT_COLORS).toHaveLength(8)
  })
})
