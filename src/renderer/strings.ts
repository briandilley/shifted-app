/**
 * Every English text of the screens of Shifted. The screens are in English only in
 * version 1 (see "Shifted's own screens" in `docs/spec/PRODUCT.md`). A translation would
 * replace this one module.
 *
 * Texts that the main process makes (menus, dialogs, notifications, and messages such as
 * the reason of a warning badge) are not here: the screens show them as they come.
 *
 * The names of the account colors come from the table of `DESIGN.md` in
 * `src/shared/account-colors.ts`. This module gives them to the screens.
 */
import { accountColorName } from '../shared/account-colors'
import type {
  AccountStatus,
  AskedPermission,
  BackgroundLoading,
  GoogleApp,
  NotificationKind,
  PageProblem,
  UnreadCountSource
} from '../shared/api'

/** The name of an account color, for example "Blue". */
export const colorName = (color: string): string => accountColorName(color)

// Accounts

/** The name of an account that has no address yet. */
export const NEW_ACCOUNT = 'New account'

export const GOOGLE_APP_NAMES: Readonly<Record<GoogleApp, string>> = {
  gmail: 'Gmail',
  calendar: 'Calendar'
}

/** The status that an account that is not signed in shows in the account picker. */
export const ACCOUNT_STATUS_NAMES: Readonly<Record<AccountStatus, string>> = {
  'signed-in': '',
  'signing-in': 'Signing in',
  'signed-out': 'Signed out',
  'not-signed-in': 'Not signed in'
}

/** The unread part of the accessible name of an account, for example "3 unread". */
export const unreadText = (count: number): string => `${count} unread`

/** The unread part of the accessible name of an account when the last read failed. */
export const unreadWarningText = (reason: string): string => `unread count not available: ${reason}`

// The main window

export const MAIN = {
  accountsLabel: 'Accounts',
  googleAppsLabel: 'Google apps',
  addAccount: 'Add account',
  importConfiguration: 'Import configuration…',
  noAccounts: 'No accounts yet',
  addAccountFirst: 'Add an account first',
  signingIn: 'Signing in…',
  signedOut: 'This account is signed out.',
  signInAgain: 'Sign in again',
  signIn: 'Sign in',
  signInTo: (address: string): string => `Sign in to ${address}.`,
  signInToThisAccount: 'Sign in to this account.',
  reload: 'Reload'
} as const

/** The text of the panel that shows in place of a Google app whose page stopped. */
export const PAGE_PROBLEM_TEXTS: Readonly<Record<PageProblem, string>> = {
  crashed: 'This page stopped.',
  'certificate-error': 'Shifted blocked this page. Its certificate is not valid.'
}

// The sign-in window

export const SIGN_IN = {
  passkeyHelp:
    'Passkeys do not work in Shifted on this computer. If Google asks for a passkey, click "Try another way" and use your password.',
  passkeyHelpWindows: 'If Google asks for a passkey, Windows Hello opens.'
} as const

// The configuration window

export const SETTINGS = {
  pagesLabel: 'Settings pages',
  accountsLabel: 'Accounts',
  general: 'General',
  notifications: 'Notifications',
  // The page of an account
  nickname: 'Nickname',
  color: 'Color',
  unreadCountSource: 'Unread count source',
  unreadOverrideNote:
    'The badge counts the unread messages of this feed. Choose Automatic to match the number next to Inbox in Gmail.',
  automaticFound: (primary: boolean): string =>
    `Shifted found that Gmail counts ${primary ? 'the Primary tab' : 'the whole inbox'}, and reads that count.`,
  automaticLearning:
    'Shifted compares the number next to Inbox in Gmail with its feeds the next time Gmail loads. Until then, it counts the Primary tab.',
  quietHours: 'Quiet hours',
  quietFrom: 'Quiet every day from',
  quietTo: 'to',
  quietAllDayOn: 'Quiet all day on',
  quietHoursNote:
    'While quiet hours are on, this account shows no notifications in the time range and on the days that you choose. The range can cross midnight, for example 22:00 to 07:00. A notification that quiet hours stop does not show later. The unread badge keeps updating.',
  pagePermissions: 'Page permissions',
  noPagePermissions:
    'No saved answers. Shifted asks the first time a page asks for the camera and microphone, screen sharing, or the clipboard.',
  permissionAnswer: (name: string, allowed: boolean): string =>
    `${name}: ${allowed ? 'Allowed' : 'Denied'}`,
  resetPagePermissions: 'Reset page permissions',
  signOut: 'Sign out',
  remove: 'Remove',
  // The Notifications page
  snooze: 'Snooze',
  snoozeOff: 'Notifications are on. Snooze is off.',
  snoozedUntilTurnedOff: 'Snoozed until you turn it off.',
  snoozedUntil: (when: string): string => `Snoozed until ${when}.`,
  stopSnooze: 'Stop snooze',
  snoozeNote: (mac: boolean): string =>
    `Snooze stops the notifications of all accounts. To snooze, press ${
      mac
        ? 'Cmd+Shift+S, or use Snooze in the Shifted menu.'
        : 'Ctrl+Shift+S, or use Snooze in the File menu.'
    }`,
  gmailNotifications: "Gmail's own notifications",
  gmailNotificationsNote:
    "Keep Gmail's own desktop notifications for new mail off. Shifted already shows them.",
  // The General page
  startup: 'Startup',
  openAtLogin: 'Open at login',
  openAtLoginNote:
    'Shifted starts with no window when you log in, so that badges and notifications work at once.',
  backgroundLoading: 'Background loading',
  backgroundLoadingNoteEnd: 'Unread badges and new-mail notifications work for every account.',
  downloads: 'Downloads',
  askWhereToSave: 'Ask where to save each file',
  downloadsNote: 'When this is off, Shifted saves each download in your Downloads folder.',
  defaultEmailApp: 'Default email app',
  makeDefaultEmailApp: 'Make Shifted the default email app',
  isDefaultEmailApp: 'Shifted is the default email app.',
  isNotDefaultEmailApp: 'Shifted is not the default email app.',
  defaultEmailAppNoteWindows:
    'Windows opens its Default apps page. Choose Shifted for email links (MAILTO) there.',
  defaultEmailAppNote: 'Email links from other apps then open a new message in Shifted.',
  accountPicker: 'Account picker',
  alwaysUses: (name: string): string => `Email links from other apps always use ${name}.`,
  asksEachTime: 'Shifted asks which account to use for each email link from another app.',
  clearAlwaysUse: 'Clear the always-use account',
  moveToAnotherComputer: 'Move to another computer',
  exportConfiguration: 'Export configuration…',
  emailItToMyself: 'Email it to myself',
  importConfiguration: 'Import configuration…',
  saved: (fileName: string): string => `Saved ${fileName}.`,
  moveNote:
    'The exported configuration has your accounts with their nicknames, colors, and notification values, background loading, "Ask where to save each file", and the always-use account. It never has sign-ins or values that belong to this computer, such as open at login. It has no password: keep it as you keep other personal files. On the other computer, the import merges by address, and you sign in to each new account.',
  emailNote: (address: string): string =>
    `Email it to myself opens a new message to ${address} in Gmail. You click Send.`,
  emailNeedsAccount:
    'To email it to yourself, select an account that is signed in, in the main window.'
} as const

export const ASKED_PERMISSION_NAMES: Readonly<Record<AskedPermission, string>> = {
  media: 'Camera and microphone',
  'display-capture': 'Screen sharing',
  'clipboard-read': 'Clipboard read'
}

export const UNREAD_COUNT_SOURCE_NAMES: Readonly<Record<UnreadCountSource, string>> = {
  automatic: 'Automatic',
  primary: 'Primary',
  'whole-inbox': 'Whole inbox',
  important: 'Important'
}

export const NOTIFICATION_KIND_NAMES: Readonly<Record<NotificationKind, string>> = {
  'new-mail': 'New mail',
  calendar: 'Calendar reminders',
  chat: 'Chat messages'
}

export const BACKGROUND_LOADING_NAMES: Readonly<Record<BackgroundLoading, string>> = {
  everything: 'Everything',
  'calendars-only': 'Calendars only',
  'selected-account-only': 'Selected account only'
}

/** What each value of "Background loading" does, below the field. */
export const BACKGROUND_LOADING_NOTES: Readonly<Record<BackgroundLoading, string>> = {
  everything: 'Gmail and Calendar of every account stay loaded. This uses the most memory.',
  'calendars-only':
    'Calendar of every account stays loaded. Gmail of each other account sleeps 5 minutes after you leave it.',
  'selected-account-only':
    'Only the selected account stays loaded. Each other account sleeps 5 minutes after you leave it, and Calendar reminders come only from the selected account.'
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

// The account picker

export const ACCOUNT_PICKER = {
  note: 'Choose the account that writes the message.',
  accountsLabel: 'Accounts',
  alwaysUse: 'Always use this account',
  cancel: 'Cancel'
} as const

// The screen picker

export const SCREEN_PICKER = {
  title: 'Share your screen',
  note: (accountName: string): string =>
    `A page of ${accountName} asks to share. Choose a screen or a window.`,
  nothingToShare: 'Nothing to share.',
  screens: 'Screens',
  windows: 'Windows',
  cancel: 'Cancel'
} as const

// The import window

export const IMPORT = {
  title: 'Import configuration',
  previewNote: 'Check what will change. Nothing changes until you import.',
  inputNote:
    'Choose the file that you exported, or paste the whole message that you emailed to yourself.',
  exportedOn: (date: string): string => `Exported on ${date}.`,
  nothingChanges: 'This configuration changes nothing on this computer.',
  changesLabel: 'Changes',
  afterImportNote:
    'Accounts on this computer keep their sign-ins. Each new account shows a Sign in button after the import.',
  chooseFile: 'Choose file…',
  pasteLabel: 'Or paste the message',
  cancel: 'Cancel',
  continue: 'Continue',
  import: 'Import'
} as const

// The "Memory use" window

export const MEMORY = {
  title: 'Memory use',
  note: 'The memory of each Google app of each account, from the processes of Shifted. It updates every 2 seconds.',
  account: 'Account',
  googleApp: 'Google app',
  memory: 'Memory',
  asleep: 'Asleep',
  other: 'Shifted and its screens',
  total: 'Total',
  noAccounts: 'No accounts yet.',
  megabytes: (kilobytes: number): string => `${Math.round(kilobytes / 1024)} MB`
} as const
