/**
 * The types and IPC channel names that the main process, the preload script, and the
 * screens of Shifted share. This file holds no code that needs Node.js or Electron.
 */

/** The Google apps of an account. */
export type GoogleApp = 'gmail' | 'calendar'

/** The Google apps in the order of the tab bar. */
export const GOOGLE_APPS: readonly GoogleApp[] = ['gmail', 'calendar']

export function isGoogleApp(value: unknown): value is GoogleApp {
  return value === 'gmail' || value === 'calendar'
}

/** The fixed set of 8 account colors. Each new account gets the next color. */
export const ACCOUNT_COLORS = [
  '#1A73E8',
  '#D93025',
  '#188038',
  '#F9AB00',
  '#A142F4',
  '#12B5CB',
  '#E8710A',
  '#5F6368'
] as const

/** The names of the account colors, for screen readers. */
export const ACCOUNT_COLOR_NAMES: Readonly<Record<string, string>> = {
  '#1A73E8': 'Blue',
  '#D93025': 'Red',
  '#188038': 'Green',
  '#F9AB00': 'Yellow',
  '#A142F4': 'Purple',
  '#12B5CB': 'Cyan',
  '#E8710A': 'Orange',
  '#5F6368': 'Grey'
}

/** True when two colors are the same, without regard to upper or lower case. */
export function isSameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** The color of the set that equals the value, or `undefined` if it is not in the set. */
export function findAccountColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return ACCOUNT_COLORS.find((color) => isSameColor(color, value))
}

/** The longest nickname that Shifted keeps. */
export const MAX_NICKNAME_LENGTH = 100

/**
 * What the content area shows for one account.
 *
 * - `signed-in`: the Google app of the account.
 * - `signing-in`: the sign-in window of the account is open.
 * - `signed-out`: the account is signed out. The content area shows "Sign in again".
 */
export type AccountStatus = 'signed-in' | 'signing-in' | 'signed-out'

/**
 * The page permissions that Shifted asks the person about, the first time a page of an
 * account asks for them. `media` is the camera and the microphone together.
 */
export type AskedPermission = 'media' | 'display-capture' | 'clipboard-read'

/** The asked permissions, in the order that the configuration window shows them. */
export const ASKED_PERMISSIONS: readonly AskedPermission[] = [
  'media',
  'display-capture',
  'clipboard-read'
]

export function isAskedPermission(value: unknown): value is AskedPermission {
  return value === 'media' || value === 'display-capture' || value === 'clipboard-read'
}

/** The names of the asked permissions on screen. */
export const ASKED_PERMISSION_NAMES: Readonly<Record<AskedPermission, string>> = {
  media: 'Camera and microphone',
  'display-capture': 'Screen sharing',
  'clipboard-read': 'Clipboard read'
}

/** The answer of the person to an asked permission. */
export type PermissionAnswer = 'allow' | 'deny'

/** The saved answers of one account. A missing permission has no answer yet. */
export type PagePermissions = Partial<Record<AskedPermission, PermissionAnswer>>

/** A Gmail Atom feed that the unread count can come from. */
export type FeedChoice = 'whole-inbox' | 'primary' | 'important'

/**
 * Where the unread count of an account comes from. "Automatic" learns the feed that
 * matches the number next to Inbox in Gmail.
 */
export type UnreadCountSource = 'automatic' | FeedChoice

/** The choices of "Unread count source", in the order that the configuration window shows them. */
export const UNREAD_COUNT_SOURCES: readonly UnreadCountSource[] = [
  'automatic',
  'primary',
  'whole-inbox',
  'important'
]

/** The names of the choices of "Unread count source" on screen. */
export const UNREAD_COUNT_SOURCE_NAMES: Readonly<Record<UnreadCountSource, string>> = {
  automatic: 'Automatic',
  primary: 'Primary',
  'whole-inbox': 'Whole inbox',
  important: 'Important'
}

export function isFeedChoice(value: unknown): value is FeedChoice {
  return value === 'whole-inbox' || value === 'primary' || value === 'important'
}

export function isUnreadCountSource(value: unknown): value is UnreadCountSource {
  return value === 'automatic' || isFeedChoice(value)
}

/** The largest unread count that a badge shows as a number. */
export const MAX_BADGE_NUMBER = 99

/** The text of an unread badge: nothing for 0, the number, or "99+" for more than 99. */
export function unreadBadgeText(count: number): string {
  if (count <= 0) return ''
  return count > MAX_BADGE_NUMBER ? `${MAX_BADGE_NUMBER}+` : String(count)
}

/**
 * The kinds of notifications. Each account has one switch for each kind.
 *
 * - `new-mail`: Shifted makes it from the Atom feed.
 * - `calendar`: a web notification of the Calendar page (a Calendar reminder).
 * - `chat`: a web notification of the Gmail page (a Google Chat message).
 */
export type NotificationKind = 'new-mail' | 'calendar' | 'chat'

/** The kinds of notifications, in the order that the configuration window shows them. */
export const NOTIFICATION_KINDS: readonly NotificationKind[] = ['new-mail', 'calendar', 'chat']

/** The names of the notification switches on screen. */
export const NOTIFICATION_KIND_NAMES: Readonly<Record<NotificationKind, string>> = {
  'new-mail': 'New mail',
  calendar: 'Calendar reminders',
  chat: 'Chat messages'
}

export function isNotificationKind(value: unknown): value is NotificationKind {
  return value === 'new-mail' || value === 'calendar' || value === 'chat'
}

/** The three notification switches of an account. All three are on for a new account. */
export type NotificationSwitches = Record<NotificationKind, boolean>

export function defaultNotificationSwitches(): NotificationSwitches {
  return { 'new-mail': true, calendar: true, chat: true }
}

/**
 * The quiet hours of an account. While they are on, the account shows no notifications:
 *
 * - every day from `start` to `end` (the range can cross midnight, for example 22:00 to
 *   07:00; the same start and end give no daily range), and
 * - all day on each day in `days`.
 */
export interface QuietHours {
  enabled: boolean
  /** The start of the daily range, `HH:MM` in 24-hour time. */
  start: string
  /** The end of the daily range, `HH:MM` in 24-hour time. The range stops just before it. */
  end: string
  /** The days that are quiet all day: 0 is Sunday, 1 is Monday, and so on to 6, Saturday. */
  days: number[]
}

export function defaultQuietHours(): QuietHours {
  return { enabled: false, start: '22:00', end: '07:00', days: [] }
}

/** The days of the week in the order that the configuration window shows them, Monday first. */
export const WEEKDAYS: readonly { day: number; name: string; short: string }[] = [
  { day: 1, name: 'Monday', short: 'Mon' },
  { day: 2, name: 'Tuesday', short: 'Tue' },
  { day: 3, name: 'Wednesday', short: 'Wed' },
  { day: 4, name: 'Thursday', short: 'Thu' },
  { day: 5, name: 'Friday', short: 'Fri' },
  { day: 6, name: 'Saturday', short: 'Sat' },
  { day: 0, name: 'Sunday', short: 'Sun' }
]

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/** True when the value is a time of day in the form `HH:MM`, from `00:00` to `23:59`. */
export function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value)
}

/**
 * Read quiet hours from a value, for example from the configuration file or from an IPC
 * message.
 *
 * @returns The quiet hours, with the days sorted and each day once, or `undefined` if the
 *   value is not valid.
 */
export function parseQuietHours(value: unknown): QuietHours | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const { enabled, start, end, days } = value as Record<string, unknown>
  if (typeof enabled !== 'boolean' || !isTimeOfDay(start) || !isTimeOfDay(end)) return undefined
  if (!Array.isArray(days)) return undefined
  if (
    !days.every((day) => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6)
  ) {
    return undefined
  }
  const unique = [...new Set(days as number[])].sort((a, b) => a - b)
  return { enabled, start, end, days: unique }
}

/** The choices of snooze. */
export type SnoozeChoice = '30-minutes' | '1-hour' | 'tomorrow-8' | 'until-turned-off'

/** The snooze choices, in the order that the menus show them. */
export const SNOOZE_CHOICES: readonly SnoozeChoice[] = [
  '30-minutes',
  '1-hour',
  'tomorrow-8',
  'until-turned-off'
]

/** The names of the snooze choices in the menus. */
export const SNOOZE_CHOICE_NAMES: Readonly<Record<SnoozeChoice, string>> = {
  '30-minutes': 'For 30 minutes',
  '1-hour': 'For 1 hour',
  'tomorrow-8': 'Until 8:00 tomorrow',
  'until-turned-off': 'Until I turn it off'
}

export function isSnoozeChoice(value: unknown): value is SnoozeChoice {
  return (SNOOZE_CHOICES as readonly unknown[]).includes(value)
}

/**
 * Snooze stops all notifications of all accounts. `until` is the end of the snooze, in
 * milliseconds since 1970 (as `Date.now()` gives), or `null` for "until I turn it off".
 */
export interface Snooze {
  until: number | null
}

/** The values of the General page of the configuration window. */
export interface GeneralConfig {
  /** Show a save dialog for each download. Off by default. */
  askWhereToSave: boolean
}

/** One account, as the screens of Shifted see it. */
export interface AccountState {
  id: string
  /** The email address of the account. Empty until Shifted reads the Atom feed. */
  email: string
  nickname: string
  color: string
  status: AccountStatus
  /** The Google app that the account used last. The tab bar selects it. */
  lastGoogleApp: GoogleApp
  /** The saved profile photo as a `data:` URL, or `null` if Shifted has no photo. */
  photo: string | null
  /** The saved answers to the asked page permissions. */
  pagePermissions: PagePermissions
  /** The unread count from the last good read of the feed, or `null` before the first one. */
  unreadCount: number | null
  /**
   * Why the last read of the feed failed, for example "Signed out" or "Offline", or `null`
   * if it worked. The badge shows a warning mark in place of the number.
   */
  unreadWarning: string | null
  /** "Unread count source" in the configuration. */
  unreadCountSource: UnreadCountSource
  /** The feed that Shifted reads now for the unread count. */
  unreadFeed: FeedChoice
  /** True when "Automatic" found the feed that matches Gmail and saved it. */
  automaticFeedLearned: boolean
  /** The notification switches of the account. */
  notifications: NotificationSwitches
  /** The quiet hours of the account. */
  quietHours: QuietHours
}

/** The state that the screens of Shifted show. */
export interface ShiftedState {
  accounts: AccountState[]
  selectedAccountId: string | null
  general: GeneralConfig
  /** The snooze that runs now, or `null` when notifications are not snoozed. */
  snooze: Snooze | null
  /** The account of "Always use this account" in the account picker, or `null`. */
  mailtoDefaultAccountId: string | null
  /**
   * True after a `mailto:` link came from another app while Shifted had no accounts. The
   * main window then says "Add an account first".
   */
  addAccountFirst: boolean
}

/** A rectangle in the window, in points, where a Google page shows. */
export interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
}

/** A page of the configuration window: General, Notifications, or one account. */
export type SettingsPage = 'general' | 'notifications' | `account/${string}`

/** The field of an account page that gets the keyboard focus. */
export type SettingsFocus = 'nickname' | 'color' | 'notifications'

function isSettingsFocus(value: unknown): value is SettingsFocus {
  return value === 'nickname' || value === 'color' || value === 'notifications'
}

/** Which page the configuration window shows, and which field gets the focus. */
export interface SettingsRequest {
  page: SettingsPage
  focus?: SettingsFocus
}

/** The page of the configuration window for one account. */
export function accountSettingsPage(accountId: string): SettingsPage {
  return `account/${accountId}`
}

/** The account of a page of the configuration window, or `undefined` for another page. */
export function settingsPageAccountId(page: SettingsPage): string | undefined {
  return page.startsWith('account/') ? page.slice('account/'.length) : undefined
}

/** The URL hash of the screen of the configuration window. */
export const SETTINGS_SCREEN_HASH = 'settings'

/** The URL hash that opens the configuration window at a page. */
export function settingsHash(request: SettingsRequest): string {
  const parts = [SETTINGS_SCREEN_HASH, request.page]
  if (request.focus) parts.push(request.focus)
  return parts.join('/')
}

const ACCOUNT_ID_PART = /^[0-9a-f-]{36}$/i

/**
 * Read a request for the configuration window from a value: a URL hash (with or without
 * `#`) or an IPC message.
 *
 * @returns The request, or `undefined` if the value is not a valid request.
 */
export function parseSettingsRequest(value: unknown): SettingsRequest | undefined {
  if (typeof value === 'string') {
    const parts = value.replace(/^#/, '').split('/')
    if (parts[0] !== SETTINGS_SCREEN_HASH) return undefined
    if (parts.length === 1) return { page: 'general' }
    if (parts[1] === 'account') {
      return parseSettingsRequest({ page: `account/${parts[2] ?? ''}`, focus: parts[3] })
    }
    return parseSettingsRequest({ page: parts[1], focus: parts[2] })
  }
  if (typeof value !== 'object' || value === null) return undefined
  const { page, focus } = value as Record<string, unknown>
  if (typeof page !== 'string') return undefined
  if (focus !== undefined && !isSettingsFocus(focus)) return undefined
  const withFocus = (valid: SettingsPage): SettingsRequest =>
    focus === undefined ? { page: valid } : { page: valid, focus }
  if (page === 'general' || page === 'notifications') return withFocus(page)
  const accountId = page.startsWith('account/') ? page.slice('account/'.length) : ''
  if (!ACCOUNT_ID_PART.test(accountId)) return undefined
  return withFocus(accountSettingsPage(accountId))
}

/** The functions that the preload script gives to the screens of Shifted. */
export interface ShiftedApi {
  /** The operating system: `darwin`, `win32`, or `linux`. */
  readonly platform: string
  getState(): Promise<ShiftedState>
  /** Calls the listener each time the state changes. Returns a function that stops it. */
  onStateChanged(listener: (state: ShiftedState) => void): () => void
  /** Make a new account and open its sign-in window. */
  addAccount(): void
  /** Show this account in the content area. */
  selectAccount(accountId: string): void
  /** Show this Google app of the selected account in the content area. */
  selectGoogleApp(googleApp: GoogleApp): void
  /** Move the account to this place in the sidebar. The first place is 0. */
  moveAccount(accountId: string, toIndex: number): void
  /** Open the context menu of the account. */
  showAccountMenu(accountId: string): void
  /** Ask the person to confirm, then remove the account and delete its session. */
  removeAccount(accountId: string): void
  /** Clear the session of the account and show the signed-out panel. */
  signOut(accountId: string): void
  /** Open the sign-in window for an account that is signed out. */
  signInAgain(accountId: string): void
  setNickname(accountId: string, nickname: string): void
  /** Set the color of the account. The color must be one of `ACCOUNT_COLORS`. */
  setColor(accountId: string, color: string): void
  /** Tell Shifted where the Google page of this window shows. */
  setViewBounds(bounds: ViewBounds): void
  /**
   * The configuration window only: calls the listener when Shifted asks it to show a
   * page. Returns a function that stops it.
   */
  onShowSettingsPage(listener: (request: SettingsRequest) => void): () => void
  /** Turn "Ask where to save each file" on or off. */
  setAskWhereToSave(value: boolean): void
  /** Forget the saved answers to the page permissions of the account. */
  resetPagePermissions(accountId: string): void
  /** Set "Unread count source" of the account. */
  setUnreadCountSource(accountId: string, source: UnreadCountSource): void
  /** Turn one notification switch of the account on or off. */
  setNotificationSwitch(accountId: string, kind: NotificationKind, on: boolean): void
  /** Set the quiet hours of the account. */
  setQuietHours(accountId: string, quietHours: QuietHours): void
  /** Stop the snooze. */
  stopSnooze(): void
  /** The screen picker only: the screens and windows that the person can share. */
  getScreenSources(): Promise<ScreenPickerInfo>
  /** The screen picker only: share this screen or window. `null` shares nothing. */
  chooseScreenSource(sourceId: string | null): void
  /** Forget the account of "Always use this account" of the account picker. */
  clearMailtoDefault(): void
  /** True when Shifted is the default email app of the computer now. */
  isDefaultEmailApp(): Promise<boolean>
  /**
   * Make Shifted the default email app. On Windows, this opens the "Default apps" page of
   * Windows. Gives the new answer of `isDefaultEmailApp`.
   */
  makeDefaultEmailApp(): Promise<boolean>
  /** The account picker only: what it shows. */
  getMailtoPicker(): Promise<MailtoPickerInfo>
  /**
   * The account picker only: calls the listener when a new `mailto:` link replaces the one
   * that it shows. Returns a function that stops it.
   */
  onMailtoPickerChanged(listener: (info: MailtoPickerInfo) => void): () => void
  /** The account picker only: open the new message in this account. */
  chooseMailtoAccount(accountId: string, always: boolean): void
  /** The account picker only: close it, and open no new message. */
  cancelMailtoPicker(): void
}

/** What the account picker shows. */
export interface MailtoPickerInfo {
  /** The top line, for example "New message to bob@example.com". */
  heading: string
  /** The account that is selected when the picker opens. */
  selectedAccountId: string | null
}

/** One screen or window that the screen picker lists. */
export interface ScreenSource {
  id: string
  name: string
  kind: 'screen' | 'window'
  /** A small picture of the screen or window, as a `data:` URL. */
  thumbnail: string
}

/** What the screen picker shows. */
export interface ScreenPickerInfo {
  /** The name of the account whose page asks to share the screen. */
  accountName: string
  sources: ScreenSource[]
}

export const IpcChannel = {
  getState: 'shifted:get-state',
  stateChanged: 'shifted:state-changed',
  addAccount: 'shifted:add-account',
  selectAccount: 'shifted:select-account',
  selectGoogleApp: 'shifted:select-google-app',
  moveAccount: 'shifted:move-account',
  showAccountMenu: 'shifted:show-account-menu',
  removeAccount: 'shifted:remove-account',
  signOut: 'shifted:sign-out',
  signInAgain: 'shifted:sign-in-again',
  setNickname: 'shifted:set-nickname',
  setColor: 'shifted:set-color',
  setViewBounds: 'shifted:set-view-bounds',
  showSettingsPage: 'shifted:show-settings-page',
  setAskWhereToSave: 'shifted:set-ask-where-to-save',
  resetPagePermissions: 'shifted:reset-page-permissions',
  setUnreadCountSource: 'shifted:set-unread-count-source',
  setNotificationSwitch: 'shifted:set-notification-switch',
  setQuietHours: 'shifted:set-quiet-hours',
  stopSnooze: 'shifted:stop-snooze',
  getScreenSources: 'shifted:get-screen-sources',
  chooseScreenSource: 'shifted:choose-screen-source',
  clearMailtoDefault: 'shifted:clear-mailto-default',
  isDefaultEmailApp: 'shifted:is-default-email-app',
  makeDefaultEmailApp: 'shifted:make-default-email-app',
  getMailtoPicker: 'shifted:get-mailto-picker',
  mailtoPickerChanged: 'shifted:mailto-picker-changed',
  chooseMailtoAccount: 'shifted:choose-mailto-account',
  cancelMailtoPicker: 'shifted:cancel-mailto-picker'
} as const

/** The URL hash of the screen at the top of the sign-in window. */
export const SIGN_IN_SCREEN_HASH = 'sign-in'

/** The URL hash of the screen picker. */
export const SCREEN_PICKER_HASH = 'screen-picker'

/** The URL hash of the account picker. */
export const MAILTO_PICKER_HASH = 'mailto-picker'
