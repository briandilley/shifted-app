/**
 * The exported configuration: the configuration without sign-ins, as a file or as a
 * block of text in an email. See "Move to another computer" in `docs/spec/PRODUCT.md`.
 *
 * - `exportConfiguration` turns the configuration into an exported configuration.
 * - `toFileForm` and `toTextForm` write its two forms.
 * - `readExportedConfiguration` reads either form back, and checks every value.
 * - `previewImport` says what an import will change, and `applyImport` makes the change.
 *
 * This module needs no Electron, so that unit tests can use it.
 */
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import {
  accountColorName,
  BACKGROUND_LOADING_NAMES,
  defaultNotificationSwitches,
  findAccountColor,
  isBackgroundLoading,
  MAX_NICKNAME_LENGTH,
  NOTIFICATION_KIND_NAMES,
  NOTIFICATION_KINDS,
  parseQuietHours,
  UNREAD_COUNT_SOURCE_NAMES,
  isUnreadCountSource,
  WEEKDAYS,
  type BackgroundLoading,
  type ImportPreview,
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

/**
 * The values of the General page that an exported configuration has. This table and
 * `ACCOUNT_FIELDS` are the only lists of allowed keys: the export copies only these keys,
 * and the import reads only these keys.
 *
 * Not exported: the sign-ins (cookies and sessions), the account IDs, the saved page
 * permissions, the feed that "Automatic" learned, the Google app used last, the snooze,
 * and the choices of the account picker.
 */
const GENERAL_FIELDS = {
  openAtLogin: readBoolean,
  backgroundLoading: readBackgroundLoading,
  askWhereToSave: readBoolean
} as const

/** The values of each account that an exported configuration has. See `GENERAL_FIELDS`. */
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
  const general = isRecord(config.general) ? config.general : {}
  const accounts = [...config.accounts].sort((a, b) => a.order - b.order)
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: exportTime(now),
    accounts: accounts.map(
      (account) =>
        readFields(ACCOUNT_FIELDS, account as unknown as Record<string, unknown>, 'skip') ?? {}
    ),
    general: readFields(GENERAL_FIELDS, general as Record<string, unknown>, 'skip') ?? {}
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
  const addresses = new Set<string>()
  for (const raw of rawAccounts) {
    if (!isRecord(raw)) return unreadable
    const account = readFields(ACCOUNT_FIELDS, raw, 'fail')
    if (!account) return unreadable
    // Two accounts with the same address cannot both be on one computer.
    const address = account.email?.toLowerCase()
    if (address) {
      if (addresses.has(address)) return unreadable
      addresses.add(address)
    }
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

/** The account on this computer with the same address, if the address is not empty. */
function findSameAddress(
  accounts: readonly AccountConfig[],
  address: string | undefined
): AccountConfig | undefined {
  if (!address) return undefined
  const wanted = address.toLowerCase()
  return accounts.find((account) => account.email.toLowerCase() === wanted)
}

function onOff(value: boolean): string {
  return value ? 'on' : 'off'
}

function quietHoursText(quietHours: QuietHours): string {
  if (!quietHours.enabled) return 'off'
  const parts = [
    quietHours.start === quietHours.end ? 'on' : `${quietHours.start} to ${quietHours.end}`
  ]
  const days = WEEKDAYS.filter(({ day }) => quietHours.days.includes(day)).map(({ short }) => short)
  if (days.length > 0) parts.push(`all day on ${days.join(', ')}`)
  return parts.join(', ')
}

function sameQuietHours(a: QuietHours, b: QuietHours): boolean {
  return (
    a.enabled === b.enabled &&
    a.start === b.start &&
    a.end === b.end &&
    a.days.join() === b.days.join()
  )
}

/** One line of the preview: the new value, and the value on this computer now. */
function changeLine(label: string, next: string, now: string): string {
  return `${label}: ${next} (now ${now})`
}

/** What changes in an account on this computer with the same address. */
function accountChanges(account: AccountConfig, imported: ExportedAccount): string[] {
  const changes: string[] = []
  if (imported.nickname !== undefined && imported.nickname !== account.nickname) {
    changes.push(
      changeLine('Nickname', imported.nickname || 'no nickname', account.nickname || 'no nickname')
    )
  }
  if (
    imported.color !== undefined &&
    imported.color.toLowerCase() !== account.color.toLowerCase()
  ) {
    changes.push(
      changeLine('Color', accountColorName(imported.color), accountColorName(account.color))
    )
  }
  if (
    imported.unreadCountSource !== undefined &&
    imported.unreadCountSource !== account.unreadCountSource
  ) {
    changes.push(
      changeLine(
        'Unread count source',
        UNREAD_COUNT_SOURCE_NAMES[imported.unreadCountSource],
        UNREAD_COUNT_SOURCE_NAMES[account.unreadCountSource]
      )
    )
  }
  if (imported.notifications) {
    for (const kind of NOTIFICATION_KINDS) {
      const next = imported.notifications[kind]
      if (next !== account.notifications[kind]) {
        changes.push(
          changeLine(
            `${NOTIFICATION_KIND_NAMES[kind]} notifications`,
            onOff(next),
            onOff(account.notifications[kind])
          )
        )
      }
    }
  }
  if (imported.quietHours && !sameQuietHours(imported.quietHours, account.quietHours)) {
    changes.push(
      changeLine(
        'Quiet hours',
        quietHoursText(imported.quietHours),
        quietHoursText(account.quietHours)
      )
    )
  }
  return changes
}

/** What changes on the General page. */
function generalChanges(config: Config, imported: ExportedGeneral): string[] {
  const now = config.general
  const changes: string[] = []
  if (imported.openAtLogin !== undefined && imported.openAtLogin !== now.openAtLogin) {
    changes.push(changeLine('Open at login', onOff(imported.openAtLogin), onOff(now.openAtLogin)))
  }
  if (
    imported.backgroundLoading !== undefined &&
    imported.backgroundLoading !== now.backgroundLoading
  ) {
    changes.push(
      changeLine(
        'Background loading',
        BACKGROUND_LOADING_NAMES[imported.backgroundLoading],
        BACKGROUND_LOADING_NAMES[now.backgroundLoading]
      )
    )
  }
  if (imported.askWhereToSave !== undefined && imported.askWhereToSave !== now.askWhereToSave) {
    changes.push(
      changeLine(
        'Ask where to save each file',
        onOff(imported.askWhereToSave),
        onOff(now.askWhereToSave)
      )
    )
  }
  return changes
}

/**
 * What an import changes on this computer:
 *
 * - An account with an address that no account here has is added, with a new ID and an
 *   empty session. It needs a sign-in.
 * - An account with the same address as an account here (case does not matter) changes
 *   the values of that account. Its session stays, so it stays signed in.
 * - The accounts here that the configuration does not have stay as they are. An import
 *   never removes an account.
 * - The General values of the configuration replace the values here.
 */
export function previewImport(config: Config, imported: ExportedConfiguration): ImportPreview {
  const preview: ImportPreview = {
    exportedAt: imported.exportedAt || null,
    addedAccounts: [],
    changedAccounts: [],
    generalChanges: generalChanges(config, imported.general),
    unchangedAccounts: 0
  }
  const changed = new Set<string>()
  const added: AccountConfig[] = []
  for (const account of imported.accounts) {
    const same = findSameAddress(config.accounts, account.email)
    if (same) {
      const changes = accountChanges(same, account)
      if (changes.length > 0 && !changed.has(same.id)) {
        changed.add(same.id)
        preview.changedAccounts.push({
          email: same.email,
          nickname: account.nickname ?? same.nickname,
          color: account.color ?? same.color,
          changes
        })
      }
      continue
    }
    const fresh = newImportedAccount([...config.accounts, ...added], account)
    added.push(fresh)
    preview.addedAccounts.push({ email: fresh.email, nickname: fresh.nickname, color: fresh.color })
  }
  preview.unchangedAccounts = config.accounts.length - changed.size
  return preview
}

/** True when the import changes nothing. */
export function isEmptyImport(preview: ImportPreview): boolean {
  return (
    preview.addedAccounts.length === 0 &&
    preview.changedAccounts.length === 0 &&
    preview.generalChanges.length === 0
  )
}

/** A new account from an exported account: a new ID, the next order, and no sign-in yet. */
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

/** The values of an account here, changed by the account with the same address. */
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

/**
 * Apply an import to the configuration, with the rules of `previewImport`. The new
 * accounts come after the accounts here, in the order of the exported configuration.
 *
 * @returns The new configuration. The configuration that it gets does not change.
 */
export function applyImport(config: Config, imported: ExportedConfiguration): Config {
  let accounts = config.accounts.map((account) => ({ ...account }))
  for (const account of imported.accounts) {
    const same = findSameAddress(accounts, account.email)
    if (same) {
      accounts = accounts.map((candidate) =>
        candidate.id === same.id ? updatedAccount(candidate, account) : candidate
      )
    } else {
      accounts = [...accounts, newImportedAccount(accounts, account)]
    }
  }
  return {
    ...config,
    general: { ...config.general, ...imported.general },
    accounts
  }
}
