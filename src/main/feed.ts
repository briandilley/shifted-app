/**
 * The Gmail Atom feed. See `docs/spec/docs/adr/0005-unread-counts-from-gmail-atom-feed.md`.
 */

const FEED_TITLE_PATTERN = /^Gmail - Inbox for (\S+@\S+)$/

function decodeXmlText(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

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

/**
 * Read the email address of the account from the XML of the feed. The first `<title>`
 * element of the feed is the title of the feed itself.
 *
 * @returns The address, or `undefined` if the feed has no title of the right form.
 */
export function parseFeedAddress(xml: string): string | undefined {
  const match = /<title(?:\s[^>]*)?>([^<]*)<\/title>/.exec(xml)
  if (!match?.[1]) return undefined
  return parseFeedTitleAddress(decodeXmlText(match[1]))
}
