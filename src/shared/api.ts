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
}

/** The state that the screens of Shifted show. */
export interface ShiftedState {
  accounts: AccountState[]
  selectedAccountId: string | null
  general: GeneralConfig
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
export type SettingsFocus = 'nickname' | 'color'

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
  if (focus !== undefined && focus !== 'nickname' && focus !== 'color') return undefined
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
  /** The screen picker only: the screens and windows that the person can share. */
  getScreenSources(): Promise<ScreenPickerInfo>
  /** The screen picker only: share this screen or window. `null` shares nothing. */
  chooseScreenSource(sourceId: string | null): void
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
  getScreenSources: 'shifted:get-screen-sources',
  chooseScreenSource: 'shifted:choose-screen-source'
} as const

/** The URL hash of the screen at the top of the sign-in window. */
export const SIGN_IN_SCREEN_HASH = 'sign-in'

/** The URL hash of the screen picker. */
export const SCREEN_PICKER_HASH = 'screen-picker'
