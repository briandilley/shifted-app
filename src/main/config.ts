/**
 * The configuration file `config.json` in the user data folder of Shifted.
 *
 * This module needs no Electron, so that unit tests can use it with a temporary folder.
 */
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACCOUNT_COLORS, isGoogleApp, isSameColor, type GoogleApp } from '../shared/api'

export { ACCOUNT_COLORS, type GoogleApp }

/** The version of the format of the configuration file. A later prompt can change it. */
export const CONFIG_VERSION = 1

export const CONFIG_FILE_NAME = 'config.json'
export const BROKEN_CONFIG_FILE_NAME = 'config.broken.json'

/** One account in the configuration. */
export interface AccountConfig {
  /** A UUID. The session of the account uses the partition `persist:account-<id>`. */
  id: string
  /** The email address. Empty until Shifted reads it from the Atom feed. */
  email: string
  nickname: string
  /** The account color, for example `#1A73E8`. */
  color: string
  /** The place of the account in the sidebar. The first account has order 0. */
  order: number
  /** The Google app that the person used last in this account. */
  lastGoogleApp: GoogleApp
}

export interface Config {
  version: typeof CONFIG_VERSION
  accounts: AccountConfig[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function emptyConfig(): Config {
  return { version: CONFIG_VERSION, accounts: [] }
}

/** True when the value is a UUID, so that it is safe in a partition name. */
export function isAccountId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseAccount(value: unknown): AccountConfig | undefined {
  if (!isRecord(value)) return undefined
  const { id, email, nickname, color, order, lastGoogleApp } = value
  if (!isAccountId(id)) return undefined
  if (typeof email !== 'string' || typeof nickname !== 'string') return undefined
  if (typeof color !== 'string' || color === '') return undefined
  if (typeof order !== 'number' || !Number.isInteger(order) || order < 0) return undefined
  if (!isGoogleApp(lastGoogleApp)) return undefined
  return { id, email, nickname, color, order, lastGoogleApp }
}

/**
 * Check the parsed JSON of a configuration file.
 *
 * @returns The configuration, or `undefined` if the value is not a valid configuration.
 */
export function parseConfig(value: unknown): Config | undefined {
  if (!isRecord(value)) return undefined
  if (value['version'] !== CONFIG_VERSION) return undefined
  const accounts = value['accounts']
  if (!Array.isArray(accounts)) return undefined
  const parsed: AccountConfig[] = []
  const ids = new Set<string>()
  for (const item of accounts) {
    const account = parseAccount(item)
    if (!account || ids.has(account.id)) return undefined
    ids.add(account.id)
    parsed.push(account)
  }
  parsed.sort((a, b) => a.order - b.order)
  return { version: CONFIG_VERSION, accounts: parsed }
}

/**
 * The color of a new account: the next color of the set.
 *
 * With `n` accounts, the next color is color `n mod 8` of the set. If an account already
 * uses that color, Shifted takes the first color after it that no account uses. When all
 * 8 colors are in use, the set repeats.
 */
export function nextAccountColor(existing: readonly AccountConfig[]): string {
  const start = existing.length % ACCOUNT_COLORS.length
  for (let step = 0; step < ACCOUNT_COLORS.length; step++) {
    const color = ACCOUNT_COLORS[(start + step) % ACCOUNT_COLORS.length] ?? ACCOUNT_COLORS[0]
    if (!existing.some((account) => isSameColor(account.color, color))) return color
  }
  return ACCOUNT_COLORS[start] ?? ACCOUNT_COLORS[0]
}

/** Make a new account. It gets a new UUID, the next order, and the next color. */
export function newAccount(existing: readonly AccountConfig[]): AccountConfig {
  const lastOrder = Math.max(-1, ...existing.map((account) => account.order))
  return {
    id: randomUUID(),
    email: '',
    nickname: '',
    color: nextAccountColor(existing),
    order: lastOrder + 1,
    lastGoogleApp: 'gmail'
  }
}

/**
 * Move one account to a new place in the sidebar.
 *
 * @param accounts The accounts, in any order.
 * @param accountId The account to move.
 * @param toIndex The new place. 0 is the top. A value out of range moves the account to
 *   the nearest end.
 * @returns The accounts in the new order, with the order values 0, 1, 2, and so on.
 */
export function moveAccount(
  accounts: readonly AccountConfig[],
  accountId: string,
  toIndex: number
): AccountConfig[] {
  const sorted = [...accounts].sort((a, b) => a.order - b.order)
  const from = sorted.findIndex((account) => account.id === accountId)
  if (from !== -1) {
    const [moved] = sorted.splice(from, 1)
    const to = Math.min(Math.max(0, Math.trunc(toIndex) || 0), sorted.length)
    if (moved) sorted.splice(to, 0, moved)
  }
  return sorted.map((account, order) => ({ ...account, order }))
}

/** Reads and writes `config.json` in one folder. */
export class ConfigStore {
  readonly path: string
  readonly brokenPath: string

  constructor(readonly dir: string) {
    this.path = join(dir, CONFIG_FILE_NAME)
    this.brokenPath = join(dir, BROKEN_CONFIG_FILE_NAME)
  }

  /**
   * Read the configuration.
   *
   * If the file is missing, the configuration has an empty list of accounts. If the file
   * is broken, this function keeps a copy of it as `config.broken.json`, then starts
   * again with an empty list.
   */
  load(): Config {
    let text: string
    try {
      text = readFileSync(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyConfig()
      return this.recoverFromBrokenFile()
    }
    let config: Config | undefined
    try {
      config = parseConfig(JSON.parse(text))
    } catch {
      config = undefined
    }
    return config ?? this.recoverFromBrokenFile()
  }

  /** Write the configuration atomically: write a temporary file, then rename it. */
  save(config: Config): void {
    mkdirSync(this.dir, { recursive: true })
    const temporaryPath = `${this.path}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    renameSync(temporaryPath, this.path)
  }

  private recoverFromBrokenFile(): Config {
    try {
      copyFileSync(this.path, this.brokenPath)
    } catch {
      // The broken file cannot be read. There is nothing to keep.
    }
    const config = emptyConfig()
    this.save(config)
    return config
  }
}
