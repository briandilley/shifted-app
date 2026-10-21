/**
 * The Gmail Atom feed. See `docs/spec/docs/adr/0005-unread-counts-from-gmail-atom-feed.md`.
 *
 * The feed looks like this:
 *
 * ```xml
 * <feed version="0.3" xmlns="http://purl.org/atom/ns#">
 *   <title>Gmail - Inbox for name@gmail.com</title>
 *   <fullcount>2</fullcount>
 *   <entry>
 *     <title>Subject</title>
 *     <link rel="alternate" href="<link to the message in Gmail>" type="text/html" />
 *     <issued>2026-10-21T08:00:00Z</issued>
 *     <id>tag:…,2004:1234567890</id>
 *     <author><name>Sender</name><email>sender@example.com</email></author>
 *   </entry>
 * </feed>
 * ```
 *
 * This module needs no Electron. The caller gives it a fetch function that uses the
 * session of the account.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { feedUrl, isSignInPageUrl } from './google-urls'

const FEED_TITLE_PATTERN = /^Gmail - Inbox for (\S+@\S+)$/

/** One message in the feed. */
export interface FeedEntry {
  id: string
  /** The subject of the message. */
  title: string
  authorName: string
  authorEmail: string
  /** The time of the message, as the feed gives it (ISO 8601). */
  issued: string
  /** The link to the message in Gmail. */
  link: string
}

/** What one feed says. */
export interface Feed {
  /** The address from the feed title, or `undefined` if the title has another form. */
  address: string | undefined
  /** The number of unread messages, from `<fullcount>`. */
  fullcount: number
  entries: FeedEntry[]
}

/**
 * Why a read of the feed failed.
 *
 * - `signed-out`: Google answered 401 or 403, or sent the request to the sign-in page.
 * - `http`: Google answered with another status that is not 200.
 * - `parse`: the answer is not a feed.
 * - `network`: the request did not reach Google, for example because the computer is offline.
 */
export type FeedError =
  | { kind: 'signed-out' }
  | { kind: 'http'; status: number }
  | { kind: 'parse' }
  | { kind: 'network' }

export type FeedResult = { ok: true; feed: Feed } | { ok: false; error: FeedError }

/** The parts of a fetch response that the feed reader uses. */
export interface FeedResponse {
  status: number
  /** Each URL that a redirect went to, in order. */
  redirects: readonly string[]
  text(): Promise<string>
}

/** A fetch function that sends the request with the session of the account. */
export type FeedFetch = (url: string) => Promise<FeedResponse>

/**
 * Read the email address of the account from the title of the feed,
 * `Gmail - Inbox for <address>`.
 *
 * @param title The text of the feed title.
 * @returns The address, or `undefined` if the title has another form.
 */
export function parseFeedTitleAddress(title: string): string | undefined {
  return FEED_TITLE_PATTERN.exec(title.trim())?.[1]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Keep every value as text. A subject such as "123" must stay a string.
  parseTagValue: false,
  parseAttributeValue: false,
  // Decode numeric character references such as `&#43;`.
  htmlEntities: true,
  isArray: (_name, jpath) => jpath === 'feed.entry' || jpath === 'feed.entry.link'
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The text of an element. An element with attributes keeps its text in `#text`. */
function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (isRecord(value) && typeof value['#text'] === 'string') return value['#text'].trim()
  return ''
}

/** The `href` of the `alternate` link, or of the first link. */
function entryLink(value: unknown): string {
  const links = Array.isArray(value) ? value.filter(isRecord) : []
  const alternate = links.find((link) => link['@_rel'] === 'alternate') ?? links[0]
  const href = alternate?.['@_href']
  return typeof href === 'string' ? href : ''
}

function parseEntry(value: unknown): FeedEntry | undefined {
  if (!isRecord(value)) return undefined
  const author = isRecord(value['author']) ? value['author'] : {}
  return {
    id: text(value['id']),
    title: text(value['title']),
    authorName: text(author['name']),
    authorEmail: text(author['email']),
    issued: text(value['issued']),
    link: entryLink(value['link'])
  }
}

/**
 * Read a feed from its XML.
 *
 * @returns The feed, or `undefined` if the XML is not a Gmail Atom feed with a `fullcount`.
 */
export function parseFeed(xml: string): Feed | undefined {
  if (xml.trim() === '' || XMLValidator.validate(xml) !== true) return undefined
  let document: unknown
  try {
    document = parser.parse(xml)
  } catch {
    return undefined
  }
  if (!isRecord(document) || !isRecord(document['feed'])) return undefined
  const feed = document['feed']
  const fullcountText = text(feed['fullcount'])
  if (!/^\d+$/.test(fullcountText)) return undefined
  const entries = Array.isArray(feed['entry']) ? feed['entry'] : []
  return {
    address: parseFeedTitleAddress(text(feed['title'])),
    fullcount: Number.parseInt(fullcountText, 10),
    entries: entries.flatMap((entry) => parseEntry(entry) ?? [])
  }
}

/**
 * Read the email address of the account from the XML of the feed.
 *
 * @returns The address, or `undefined` if the XML is not a feed with a title of the right form.
 */
export function parseFeedAddress(xml: string): string | undefined {
  return parseFeed(xml)?.address
}

/**
 * Read one feed of one account.
 *
 * @param fetch Sends the request with the session of the account.
 * @param label The feed label, in URL form (see `FEED_LABELS` in `google-urls.ts`).
 */
export async function readFeed(fetch: FeedFetch, label: string): Promise<FeedResult> {
  let response: FeedResponse
  let body: string
  try {
    response = await fetch(feedUrl(label))
    body = await response.text()
  } catch {
    return { ok: false, error: { kind: 'network' } }
  }
  if (
    response.redirects.some(isSignInPageUrl) ||
    response.status === 401 ||
    response.status === 403
  ) {
    return { ok: false, error: { kind: 'signed-out' } }
  }
  if (response.status !== 200) {
    return { ok: false, error: { kind: 'http', status: response.status } }
  }
  const feed = parseFeed(body)
  return feed ? { ok: true, feed } : { ok: false, error: { kind: 'parse' } }
}

/** The reason that the tooltip of the warning mark shows. */
export function feedErrorText(error: FeedError): string {
  switch (error.kind) {
    case 'signed-out':
      return 'Signed out'
    case 'network':
      return 'Offline'
    case 'http':
      return `Gmail answered with an error (HTTP ${error.status})`
    case 'parse':
      return 'Gmail sent something that is not a feed'
  }
}
