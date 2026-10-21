/**
 * The types and IPC channel names that the main process, the preload script, and the
 * screens of Shifted share. This file holds no code that needs Node.js or Electron.
 */

/**
 * What the content area shows for one account.
 *
 * - `gmail`: the Gmail Google app of the account.
 * - `signing-in`: the sign-in window of the account is open.
 * - `signed-out`: Google signed the account out. The content area shows "Sign in again".
 */
export type AccountStatus = 'gmail' | 'signing-in' | 'signed-out'

/** One account, as the screens of Shifted see it. */
export interface AccountState {
  id: string
  /** The email address of the account. Empty until Shifted reads the Atom feed. */
  email: string
  nickname: string
  color: string
  status: AccountStatus
}

/** The state that the main window shows. */
export interface ShiftedState {
  accounts: AccountState[]
  selectedAccountId: string | null
}

/** A rectangle in the window, in points, where a Google page shows. */
export interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
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
  /** Ask the person to confirm, then remove the account and delete its session. */
  removeAccount(accountId: string): void
  /** Open the sign-in window for an account that Google signed out. */
  signInAgain(accountId: string): void
  /** Tell Shifted where the Google page of this window shows. */
  setViewBounds(bounds: ViewBounds): void
}

export const IpcChannel = {
  getState: 'shifted:get-state',
  stateChanged: 'shifted:state-changed',
  addAccount: 'shifted:add-account',
  removeAccount: 'shifted:remove-account',
  signInAgain: 'shifted:sign-in-again',
  setViewBounds: 'shifted:set-view-bounds'
} as const

/** The URL hash of the screen at the top of the sign-in window. */
export const SIGN_IN_SCREEN_HASH = 'sign-in'
