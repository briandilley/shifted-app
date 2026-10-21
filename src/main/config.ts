/**
 * The configuration file `config.json` in the user data folder of Shifted.
 *
 * This module needs no Electron, so that unit tests can use it with a temporary folder.
 */
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The version of the format of the configuration file. A later prompt can change it. */
export const CONFIG_VERSION = 1

export const CONFIG_FILE_NAME = 'config.json'
export const BROKEN_CONFIG_FILE_NAME = 'config.broken.json'

/** The Google apps of an account. */
export type GoogleApp = 'gmail' | 'calendar'

/** One account in the configuration. */
export interface AccountConfig {
  /** A UUID. The session of the account uses the partition `persist:account-<id>`. */
  id: string
  /** The email address. Empty until Shifted reads it from the Atom feed. */
  email: string
  nickname: string
  /** The account color, for example `#1a73e8`. */
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

/** The fixed set of 8 account colors. Each new account gets the next color. */
export const ACCOUNT_COLORS: readonly string[] = [
  '#1a73e8',
  '#d93025',
  '#188038',
  '#f9ab00',
  '#9334e6',
  '#e8710a',
  '#12a4af',
  '#d01884'
]

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
  if (lastGoogleApp !== 'gmail' && lastGoogleApp !== 'calendar') return undefined
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
 * Make a new account. It gets a new UUID, the next order, and the color after the
 * color of the last account.
 */
export function newAccount(existing: readonly AccountConfig[]): AccountConfig {
  const last = [...existing].sort((a, b) => a.order - b.order).at(-1)
  const lastColorIndex = last ? ACCOUNT_COLORS.indexOf(last.color) : -1
  const color = ACCOUNT_COLORS[(lastColorIndex + 1) % ACCOUNT_COLORS.length] ?? '#1a73e8'
  return {
    id: randomUUID(),
    email: '',
    nickname: '',
    color,
    order: last ? last.order + 1 : 0,
    lastGoogleApp: 'gmail'
  }
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
