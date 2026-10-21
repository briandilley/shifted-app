/**
 * New mail from the Atom feed. See "Notifications" in `docs/spec/PRODUCT.md` and
 * `docs/spec/docs/adr/0005-unread-counts-from-gmail-atom-feed.md`.
 *
 * Shifted keeps, in memory only, the IDs of the feed entries that it saw for each account.
 * The first read of the feed only fills the set. On each later read, every entry with a
 * new ID is a new message.
 *
 * This module needs no Electron, so that unit tests can use it.
 */
import type { FeedEntry } from './feed'

/** With more new messages than this in one read, Shifted shows one summary notification. */
export const MAX_SEPARATE_NOTIFICATIONS = 3

interface SeenEntries {
  /** The feed label that the set belongs to. */
  feed: string
  ids: Set<string>
}

export class NewMailTracker {
  private readonly seen = new Map<string, SeenEntries>()

  /**
   * Take the entries of one good read of the feed of an account.
   *
   * The first read of an account, and the first read after `forget` or after a change of
   * feed, only fills the set and returns no new messages.
   *
   * @param accountId The account.
   * @param feed The label of the feed that Shifted read, the one that the unread count uses.
   * @param entries The entries of the feed.
   * @returns The new messages, in the order of the feed. Each ID shows once.
   */
  read(accountId: string, feed: string, entries: readonly FeedEntry[]): FeedEntry[] {
    const withId = entries.filter((entry) => entry.id !== '')
    const known = this.seen.get(accountId)
    if (!known || known.feed !== feed) {
      this.seen.set(accountId, { feed, ids: new Set(withId.map((entry) => entry.id)) })
      return []
    }
    const fresh: FeedEntry[] = []
    for (const entry of withId) {
      if (known.ids.has(entry.id)) continue
      known.ids.add(entry.id)
      fresh.push(entry)
    }
    return fresh
  }

  /** Forget the set of an account, so that its next read only fills the set again. */
  forget(accountId: string): void {
    this.seen.delete(accountId)
  }
}

/** One new-mail notification. */
export interface NewMailNotification {
  title: string
  body: string
  /** The message that a click opens, or `null` for a summary, whose click opens the inbox. */
  entry: FeedEntry | null
}

/** The sender name of an entry, or its address when the feed gives no name. */
export function senderName(entry: FeedEntry): string {
  return entry.authorName || entry.authorEmail || 'Unknown sender'
}

/**
 * The notifications for the new messages of one read of one account.
 *
 * @param accountTitle The nickname of the account, or its address.
 * @param entries The new messages, in the order of the feed.
 * @returns One notification for each new message, or one summary for more than 3.
 */
export function newMailNotifications(
  accountTitle: string,
  entries: readonly FeedEntry[]
): NewMailNotification[] {
  if (entries.length === 0) return []
  if (entries.length > MAX_SEPARATE_NOTIFICATIONS) {
    return [{ title: accountTitle, body: `${entries.length} new messages`, entry: null }]
  }
  return entries.map((entry) => ({
    title: accountTitle,
    body: `${senderName(entry)}\n${entry.title || '(no subject)'}`,
    entry
  }))
}
