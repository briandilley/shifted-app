/**
 * The exported configuration: the configuration without sign-ins, as a file or as a
 * block of text in an email. See "Move to another computer" in `docs/spec/PRODUCT.md`.
 *
 * - `exportConfiguration` turns the configuration into an exported configuration.
 * - `toFileForm` and `toTextForm` write its two forms.
 * - `readExportedConfiguration` reads either form back, and checks every value.
 * - `mergeImport` merges an import with the configuration on this computer, and lists the
 *   changes.
 *
 * This module needs no Electron, so that unit tests can use it.
 */
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import {
  defaultNotificationSwitches,
  findAccountColor,
  isBackgroundLoading,
  MAX_NICKNAME_LENGTH,
  NOTIFICATION_KINDS,
  parseQuietHours,
  isUnreadCountSource,
  type BackgroundLoading,
  type NotificationSwitches,
  type QuietHours,
  type UnreadCountSource
} from '../shared/api'
import { newAccount, type AccountConfig, type Config } from './config'

/** The value of `format` in every exported configuration. */
export const EXPORT_FORMAT = 'shifted-configuration'

/** The version of the exported configuration that this build writes and reads. */
export const EXPORT_VERSION = 1

/** The import reads at most this many bytes from a file or the text box. */
export const MAX_IMPORT_BYTES = 256 * 1024

/** The marker lines around the text form. */
export const TEXT_FORM_BEGIN = '-----BEGIN SHIFTED CONFIGURATION-----'
export const TEXT_FORM_END = '-----END SHIFTED CONFIGURATION-----'

/** The text form has lines of this many base64 characters. */
const TEXT_FORM_LINE_LENGTH = 64

/** The subject of the message of "Email it to myself". */
export const EMAIL_SUBJECT = 'Shifted configuration'

/** The line of help at the top of the message of "Email it to myself". */
export const EMAIL_HELP =
  'To use this configuration on another computer, open Shifted there. Go to Settings, then General, then Import configuration, and paste this whole message.'

/** The text when the import cannot read the file or the text. */
export const UNREADABLE_MESSAGE = 'Shifted cannot read this configuration.'

/** The text when the configuration has a version that this build does not know. */
export const NEWER_VERSION_MESSAGE =
  'This configuration comes from a newer version of Shifted. Update Shifted, then try again.'

/** The longest address that the import accepts (RFC 5321 allows 254 characters). */
const MAX_ADDRESS_LENGTH = 254

/** Reads one value. `undefined` means the value has a wrong type or is out of range. */
type Reader<T> = (value: unknown) => T | undefined

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readBackgroundLoading(value: unknown): BackgroundLoading | undefined {
  return isBackgroundLoading(value) ? value : undefined
}

/** An email address, or an empty text for an account whose address Shifted never read. */
function readAddress(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > MAX_ADDRESS_LENGTH) return undefined
  if (value === '') return value
  return /^[^\s@]+@[^\s@]+$/.test(value) ? value : undefined
}

function readNickname(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const nickname = value.trim()
  return nickname.length <= MAX_NICKNAME_LENGTH ? nickname : undefined
}

/** A color `#RRGGBB`. A color of the set gets the spelling of the set. */
function readColor(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return undefined
  return findAccountColor(value) ?? value
}

function readUnreadCountSource(value: unknown): UnreadCountSource | undefined {
  return isUnreadCountSource(value) ? value : undefined
}

/** The notification switches. A switch that the module does not know is ignored. A missing switch is on. */
function readNotificationSwitches(value: unknown): NotificationSwitches | undefined {
  if (!isRecord(value)) return undefined
  const switches = defaultNotificationSwitches()
  for (const kind of NOTIFICATION_KINDS) {
    const on = value[kind]
    if (on === undefined) continue
    if (typeof on !== 'boolean') return undefined
    switches[kind] = on
  }
  return switches
}

const readQuietHours: Reader<QuietHours> = parseQuietHours

/** The address of the "Always use this account" choice, or `null` when there is no choice. */
function readAlwaysUseAccount(value: unknown): string | null | undefined {
  if (value === null) return null
  const address = readAddress(value)
  return address ? address : undefined
}

/**
 * The values of the General page that an exported configuration has, as "Move to another
 * computer" in `PRODUCT.md` lists them. This table and `ACCOUNT_FIELDS` are the only lists
 * of allowed keys: the export copies only these keys, and the import reads only these keys.
 *
 * `alwaysUseAccount` is the "Always use this account" choice of the account picker. The
 * configuration keeps it as an account ID. The export has the address of that account,
 * and the import turns the address back into the new ID.
 *
 * Not exported, because they belong to one computer: open at login, the default email
 * app, and the size and position of the window. Also not exported: the sign-ins (cookies
 * and sessions), the account IDs, the remembered answers for page permissions, the snooze,
 * the profile photos, the feed that "Automatic" learned, and the Google app used last.
 */
const GENERAL_FIELDS = {
  backgroundLoading: readBackgroundLoading,
  askWhereToSave: readBoolean,
  alwaysUseAccount: readAlwaysUseAccount
} as const

/**
 * The values of each account that an exported configuration has. See `GENERAL_FIELDS`.
 * The place in the sidebar is the place in the `accounts` list.
 */
const ACCOUNT_FIELDS = {
  email: readAddress,
  nickname: readNickname,
  color: readColor,
  unreadCountSource: readUnreadCountSource,
  notifications: readNotificationSwitches,
  quietHours: readQuietHours
} as const

type Values<F> = { [K in keyof F]?: F[K] extends Reader<infer T> ? T : never }

/** The General values of an exported configuration. A missing value does not change. */
export type ExportedGeneral = Values<typeof GENERAL_FIELDS>

/** One account of an exported configuration. A missing value gets the default. */
export type ExportedAccount = Values<typeof ACCOUNT_FIELDS>

/** The allowed keys of the General values. */
export const EXPORTED_GENERAL_KEYS = Object.keys(GENERAL_FIELDS) as (keyof ExportedGeneral)[]

/** The allowed keys of each account. */
export const EXPORTED_ACCOUNT_KEYS = Object.keys(ACCOUNT_FIELDS) as (keyof ExportedAccount)[]

/** An exported configuration, as the file form has it. */
export interface ExportedConfiguration {
  format: typeof EXPORT_FORMAT
  version: number
  /** The time of the export, for example `2026-10-21T17:00:00Z`. */
  exportedAt: string
  /** The accounts in the order of the sidebar. */
  accounts: ExportedAccount[]
  general: ExportedGeneral
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read the allowed keys of `fields` from `source`. A missing key is left out.
 *
 * @param onWrong What a wrong value does: `fail` gives `undefined` for the whole value,
 *   and `skip` leaves out only that key.
 */
function readFields<F extends Record<string, Reader<unknown>>>(
  fields: F,
  source: Record<string, unknown>,
  onWrong: 'fail' | 'skip'
): Values<F> | undefined {
  const values: Record<string, unknown> = {}
  for (const [key, read] of Object.entries(fields)) {
    const raw = source[key]
    if (raw === undefined) continue
    const value = read(raw)
    if (value === undefined) {
      if (onWrong === 'fail') return undefined
      continue
    }
    values[key] = value
  }
  return values as Values<F>
}

/** The time in the form `2026-10-21T17:00:00Z`, with no milliseconds. */
function exportTime(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Turn the configuration into an exported configuration. Only the allowed keys of
 * `GENERAL_FIELDS` and `ACCOUNT_FIELDS` are copied, also when the configuration has more
 * keys. The account IDs are not exported.
 */
export function exportConfiguration(config: Config, now = new Date()): ExportedConfiguration {
  // The accounts in the order of the sidebar.
  const accounts = [...config.accounts].sort((a, b) => a.order - b.order)
  const always = accounts.find((account) => account.id === config.mailto.defaultAccountId)
  const general: Record<string, unknown> = {
    ...(isRecord(config.general) ? config.general : {}),
    alwaysUseAccount: always?.email || null
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: exportTime(now),
    accounts: accounts.map(
      (account) =>
        readFields(ACCOUNT_FIELDS, account as unknown as Record<string, unknown>, 'skip') ?? {}
    ),
    general: readFields(GENERAL_FIELDS, general, 'skip') ?? {}
  }
}

/** The file form: JSON with an indent of 2 spaces. */
export function toFileForm(exported: ExportedConfiguration): string {
  return `${JSON.stringify(exported, null, 2)}\n`
}

/**
 * The text form, for email: the file form, compressed with raw deflate and encoded as
 * base64 in lines of 64 characters, between two marker lines.
 */
export function toTextForm(exported: ExportedConfiguration): string {
  const base64 = deflateRawSync(Buffer.from(toFileForm(exported), 'utf8'), { level: 9 }).toString(
    'base64'
  )
  const lines: string[] = []
  for (let start = 0; start < base64.length; start += TEXT_FORM_LINE_LENGTH) {
    lines.push(base64.slice(start, start + TEXT_FORM_LINE_LENGTH))
  }
  return [TEXT_FORM_BEGIN, ...lines, TEXT_FORM_END].join('\n')
}

/** The name of the exported file: `Shifted configuration <YYYY-MM-DD>.json`, in local time. */
export function exportFileName(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `Shifted configuration ${date}.json`
}

/**
 * The `mailto:` link of "Email it to myself": to the address, with the subject "Shifted
 * configuration", and a body of the line of help, an empty line, and the text form. Line
 * breaks are CRLF, as RFC 6068 says.
 */
export function emailLink(address: string, textForm: string): string {
  const body = `${EMAIL_HELP}\n\n${textForm}\n`.replace(/\r?\n/g, '\r\n')
  const to = encodeURIComponent(address).replace(/%40/g, '@')
  return `mailto:${to}?subject=${encodeURIComponent(EMAIL_SUBJECT)}&body=${encodeURIComponent(body)}`
}

/** The result of reading an exported configuration. */
export type ReadResult =
  { ok: true; configuration: ExportedConfiguration } | { ok: false; message: string }

const unreadable: ReadResult = { ok: false, message: UNREADABLE_MESSAGE }

/**
 * The JSON inside the text form, or `undefined` if the text has no text form. The text
 * between the two marker lines counts. Spaces and line breaks in it are ignored, so the
 * text can be a whole email, with text before and after the markers.
 *
 * @returns The JSON text, `null` if the text form is broken, or `undefined` if the text
 *   has no begin marker.
 */
function textFormJson(text: string): string | null | undefined {
  const begin = text.indexOf(TEXT_FORM_BEGIN)
  if (begin === -1) return undefined
  const start = begin + TEXT_FORM_BEGIN.length
  const end = text.indexOf(TEXT_FORM_END, start)
  if (end === -1) return null
  const base64 = text.slice(start, end).replace(/\s+/g, '')
  if (base64 === '' || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return null
  }
  try {
    // A small text can unpack to a huge one. Stop at the same limit as a file.
    const json = inflateRawSync(Buffer.from(base64, 'base64'), {
      maxOutputLength: MAX_IMPORT_BYTES
    })
    return new TextDecoder('utf-8', { fatal: true }).decode(json)
  } catch {
    return null
  }
}

/** Check the parsed JSON of an exported configuration. */
function checkConfiguration(value: unknown): ReadResult {
  if (!isRecord(value) || value['format'] !== EXPORT_FORMAT) return unreadable
  const version = value['version']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return unreadable
  if (version > EXPORT_VERSION) return { ok: false, message: NEWER_VERSION_MESSAGE }

  const exportedAt = value['exportedAt'] ?? ''
  if (typeof exportedAt !== 'string') return unreadable

  const rawGeneral = value['general'] ?? {}
  if (!isRecord(rawGeneral)) return unreadable
  const general = readFields(GENERAL_FIELDS, rawGeneral, 'fail')
  if (!general) return unreadable

  const rawAccounts = value['accounts'] ?? []
  if (!Array.isArray(rawAccounts)) return unreadable
  const accounts: ExportedAccount[] = []
  for (const raw of rawAccounts) {
    if (!isRecord(raw)) return unreadable
    const account = readFields(ACCOUNT_FIELDS, raw, 'fail')
    if (!account) return unreadable
    accounts.push(account)
  }
  return {
    ok: true,
    configuration: { format: EXPORT_FORMAT, version, exportedAt, accounts, general }
  }
}

/**
 * Read an exported configuration from a file or from pasted text. Both forms count: the
 * file form (JSON), and the text form between its two marker lines.
 *
 * Shifted reads at most `MAX_IMPORT_BYTES`. Keys that this module does not know are
 * ignored. A known key with a wrong type or a value out of range makes the whole
 * configuration unreadable.
 *
 * @returns The configuration, or the text that tells the person why Shifted cannot use it.
 */
export function readExportedConfiguration(input: string | Uint8Array): ReadResult {
  const size = typeof input === 'string' ? Buffer.byteLength(input, 'utf8') : input.byteLength
  if (size > MAX_IMPORT_BYTES) return unreadable
  let text: string
  if (typeof input === 'string') {
    text = input
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(input)
    } catch {
      return unreadable
    }
  }
  text = text.replace(/^\uFEFF/, '')
  const fromTextForm = textFormJson(text)
  if (fromTextForm === null) return unreadable
  let value: unknown
  try {
    value = JSON.parse(fromTextForm ?? text)
  } catch {
    return unreadable
  }
  return checkConfiguration(value)
}

/** The result of a merge: the new configuration, and the list of changes for the person. */
export interface MergeResult {
  config: Config
  /** One line for each kind of change, for example "Add 3 accounts: …". Empty when nothing changes. */
  changes: string[]
}

/** An address for comparing: no difference between capital and small letters. */
function addressKey(address: string | undefined): string {
  return (address ?? '').trim().toLowerCase()
}

/** The name of an account in the list of changes: the nickname and the address. */
function changeName(account: AccountConfig): string {
  if (account.nickname && account.email) return `${account.nickname} (${account.email})`
  return account.email || account.nickname || 'an account with no address'
}

/** "1 account" or "3 accounts". */
function accountCount(count: number): string {
  return count === 1 ? '1 account' : `${count} accounts`
}

/** A new account from an exported account: a new ID, the next color, and no sign-in yet. */
function newImportedAccount(
  existing: readonly AccountConfig[],
  imported: ExportedAccount
): AccountConfig {
  const account = newAccount(existing)
  return {
    ...account,
    email: imported.email ?? account.email,
    nickname: imported.nickname ?? account.nickname,
    color: imported.color ?? account.color,
    unreadCountSource: imported.unreadCountSource ?? account.unreadCountSource,
    notifications: imported.notifications ? { ...imported.notifications } : account.notifications,
    quietHours: imported.quietHours
      ? { ...imported.quietHours, days: [...imported.quietHours.days] }
      : account.quietHours,
    signInNeeded: true
  }
}

/** The values of an account on this computer, updated by the imported account with its address. */
function updatedAccount(account: AccountConfig, imported: ExportedAccount): AccountConfig {
  const unreadCountSource = imported.unreadCountSource ?? account.unreadCountSource
  return {
    ...account,
    nickname: imported.nickname ?? account.nickname,
    color: imported.color ?? account.color,
    unreadCountSource,
    // Choosing "Automatic" again forgets the feed that it learned, as in the configuration window.
    automaticFeed:
      unreadCountSource === account.unreadCountSource || unreadCountSource !== 'automatic'
        ? account.automaticFeed
        : null,
    notifications: imported.notifications ? { ...imported.notifications } : account.notifications,
    quietHours: imported.quietHours
      ? { ...imported.quietHours, days: [...imported.quietHours.days] }
      : account.quietHours
  }
}

/** True when the import changes a value of the account. */
function accountValuesChanged(before: AccountConfig, after: AccountConfig): boolean {
  const values = (account: AccountConfig): string =>
    JSON.stringify([
      account.nickname,
      account.color.toLowerCase(),
      account.unreadCountSource,
      NOTIFICATION_KINDS.map((kind) => account.notifications[kind]),
      account.quietHours
    ])
  return values(before) !== values(after)
}

/**
 * Merge an import with the configuration on this computer, with the rules of "Move to
 * another computer" in `PRODUCT.md`:
 *
 * - The accounts match by address, with no difference between capital and small letters.
 *   If the import has the same address twice, the first one counts. An account here with
 *   no address yet (for example during its first sign-in) never matches.
 * - An imported account with the address of an account here updates the values of that
 *   account. The account keeps its ID, so it keeps its session and its sign-in.
 * - An imported account with a new address is added, with a new ID and an empty session.
 *   It waits for sign-in.
 * - The sidebar takes the order of the import. An account here that the import does not
 *   have stays, at the end of the sidebar, in its old order.
 * - The General values of the import replace the General values here. The "Always use this
 *   account" address becomes the ID of the account with that address.
 *
 * This function needs no Electron and changes nothing. It returns the new configuration
 * and the list of changes that the import window shows before the person confirms.
 */
export function mergeImport(config: Config, imported: ExportedConfiguration): MergeResult {
  const local = [...config.accounts].sort((a, b) => a.order - b.order)
  const matched = new Set<string>()
  const seen = new Set<string>()
  const merged: AccountConfig[] = []
  const added: AccountConfig[] = []
  const updated: AccountConfig[] = []

  for (const account of imported.accounts) {
    const key = addressKey(account.email)
    if (key !== '') {
      // The first imported account with an address counts.
      if (seen.has(key)) continue
      seen.add(key)
    }
    const same =
      key === ''
        ? undefined
        : local.find(
            (candidate) =>
              !matched.has(candidate.id) &&
              candidate.email !== '' &&
              addressKey(candidate.email) === key
          )
    if (same) {
      matched.add(same.id)
      const next = updatedAccount(same, account)
      if (accountValuesChanged(same, next)) updated.push(next)
      merged.push(next)
    } else {
      const fresh = newImportedAccount([...local, ...added], account)
      added.push(fresh)
      merged.push(fresh)
    }
  }
  const kept = local.filter((account) => !matched.has(account.id))
  const accounts = [...merged, ...kept].map((account, order) => ({ ...account, order }))

  // The General values of the import replace the values here.
  const general = { ...config.general }
  if (imported.general.backgroundLoading !== undefined) {
    general.backgroundLoading = imported.general.backgroundLoading
  }
  if (imported.general.askWhereToSave !== undefined) {
    general.askWhereToSave = imported.general.askWhereToSave
  }
  const mailto = { ...config.mailto }
  if (imported.general.alwaysUseAccount !== undefined) {
    const key = addressKey(imported.general.alwaysUseAccount ?? '')
    const always =
      key === '' ? undefined : accounts.find((account) => addressKey(account.email) === key)
    mailto.defaultAccountId = always?.id ?? null
  }

  const changes: string[] = []
  if (added.length > 0) {
    changes.push(`Add ${accountCount(added.length)}: ${added.map(changeName).join(', ')}.`)
  }
  if (updated.length > 0) {
    changes.push(`Update ${accountCount(updated.length)}: ${updated.map(changeName).join(', ')}.`)
  }
  const localOrder = local.map((account) => account.id)
  const newOrder = accounts.map((account) => account.id).filter((id) => localOrder.includes(id))
  if (newOrder.join() !== localOrder.join()) {
    changes.push('Put the accounts in the order of the import.')
    if (kept.length > 0) {
      changes.push(
        `Keep ${accountCount(kept.length)} that the import does not have, at the end of the sidebar: ${kept.map(changeName).join(', ')}.`
      )
    }
  }
  if (
    general.backgroundLoading !== config.general.backgroundLoading ||
    general.askWhereToSave !== config.general.askWhereToSave ||
    mailto.defaultAccountId !== config.mailto.defaultAccountId
  ) {
    changes.push('Replace the General values.')
  }

  return { config: { ...config, general, accounts, mailto }, changes }
}
