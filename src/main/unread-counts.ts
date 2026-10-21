/**
 * The rules of the unread counts that need no Electron: the automatic choice of feed, the
 * delay before the next read of the feed, and the app badge.
 */
import type { AccountState, FeedChoice, UnreadCountSource } from '../shared/api'
import type { AutomaticFeed } from './config'

/** Until "Automatic" chose a feed, Shifted reads the Primary feed. */
export const DEFAULT_AUTOMATIC_FEED: AutomaticFeed = 'primary'

/** The feed that Shifted reads for the unread count of an account. */
export function feedToRead(
  source: UnreadCountSource,
  automaticFeed: AutomaticFeed | null
): FeedChoice {
  if (source !== 'automatic') return source
  return automaticFeed ?? DEFAULT_AUTOMATIC_FEED
}

/**
 * The automatic choice of feed.
 *
 * @param gmailCount The number that Gmail shows next to Inbox.
 * @param wholeInbox The `fullcount` of the "Whole inbox" feed.
 * @param primary The `fullcount` of the "Primary" feed.
 * @returns The feed whose count equals the number of Gmail, or `undefined` when both or
 *   neither match. Then Shifted tries again on the next load of Gmail.
 */
export function chooseAutomaticFeed(
  gmailCount: number,
  wholeInbox: number,
  primary: number
): AutomaticFeed | undefined {
  const wholeInboxMatches = wholeInbox === gmailCount
  const primaryMatches = primary === gmailCount
  if (wholeInboxMatches === primaryMatches) return undefined
  return primaryMatches ? 'primary' : 'whole-inbox'
}

/** The time between two reads of the feed of an account, when the last read worked. */
export const READ_INTERVAL_MS = 60_000

/** The time before the next read after 1, 2, and 3 or more failed reads in a row. */
export const ERROR_DELAYS_MS: readonly number[] = [60_000, 120_000, 300_000]

/** The largest random delay that Shifted adds to each read, so that reads do not happen together. */
export const MAX_JITTER_MS = 5_000

/**
 * The time before the next read of the feed of an account, without the random delay.
 *
 * @param failures The number of failed reads in a row. A good read sets it to 0.
 */
export function nextReadDelayMs(failures: number): number {
  if (failures <= 0) return READ_INTERVAL_MS
  const index = Math.min(failures, ERROR_DELAYS_MS.length) - 1
  return ERROR_DELAYS_MS[index] ?? READ_INTERVAL_MS
}

/** A random delay from 0 to `MAX_JITTER_MS`. */
export function randomJitterMs(random: () => number = Math.random): number {
  return Math.floor(random() * MAX_JITTER_MS)
}

/**
 * The app badge: the sum of the unread counts of all accounts. An account with a warning
 * mark adds nothing.
 */
export function appBadgeTotal(accounts: readonly AccountState[]): number {
  return accounts.reduce(
    (total, account) => total + (account.unreadWarning === null ? (account.unreadCount ?? 0) : 0),
    0
  )
}
