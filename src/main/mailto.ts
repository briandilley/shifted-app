/**
 * `mailto:` links from other apps: the parser for display, the link on the command line,
 * and the choice between the account picker, the saved `mailto:` default, and "no
 * accounts". See "mailto: links" in `docs/spec/PRODUCT.md`.
 *
 * This module needs no Electron, so that unit tests can use it.
 */

/** The fields of a `mailto:` link, as RFC 6068 describes them. */
export interface MailtoFields {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
}

const MAILTO_SCHEME = /^mailto:/i

/** True when the text is a `mailto:` link. */
export function isMailtoUrl(text: string): boolean {
  return MAILTO_SCHEME.test(text)
}

/** Percent-decode the text as UTF-8. Text with a broken percent code stays as it is. */
function decode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** The addresses of a list separated by commas, without spaces and empty entries. */
function addresses(text: string): string[] {
  return decode(text)
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address !== '')
}

/**
 * Read a `mailto:` link into its fields, as RFC 6068 describes.
 *
 * - The addresses before `?` and the `to` fields go into `to`.
 * - `cc` and `bcc` can each give several addresses, separated by commas.
 * - `subject` and `body` take the first field with that name.
 * - Field names have no case. Other fields are ignored. `+` stays `+`, as RFC 6068 says.
 *
 * Shifted uses the fields only for the top line of the account picker. Gmail always gets
 * the whole link.
 *
 * @returns The fields, or `undefined` if the text is not a `mailto:` link.
 */
export function parseMailto(url: string): MailtoFields | undefined {
  if (!isMailtoUrl(url)) return undefined
  const rest = url.replace(MAILTO_SCHEME, '')
  const queryStart = rest.indexOf('?')
  const toPart = queryStart === -1 ? rest : rest.slice(0, queryStart)
  const query = queryStart === -1 ? '' : rest.slice(queryStart + 1)

  const fields: MailtoFields = { to: addresses(toPart), cc: [], bcc: [], subject: '', body: '' }
  let subject: string | undefined
  let body: string | undefined
  for (const field of query.split('&')) {
    if (field === '') continue
    const equals = field.indexOf('=')
    const name = decode(equals === -1 ? field : field.slice(0, equals)).toLowerCase()
    const value = equals === -1 ? '' : field.slice(equals + 1)
    switch (name) {
      case 'to':
      case 'cc':
      case 'bcc':
        fields[name].push(...addresses(value))
        break
      case 'subject':
        subject ??= decode(value)
        break
      case 'body':
        body ??= decode(value)
        break
    }
  }
  fields.subject = subject ?? ''
  fields.body = body ?? ''
  return fields
}

/**
 * The top line of the account picker: "New message to bob@example.com", or "New message"
 * when the link has no address.
 */
export function mailtoHeading(url: string): string {
  const to = parseMailto(url)?.to ?? []
  return to.length === 0 ? 'New message' : `New message to ${to.join(', ')}`
}

/**
 * The `mailto:` link on a command line, for example from `process.argv` or the
 * `second-instance` event, or `undefined` if it has none. The last link wins.
 */
export function findMailtoArgument(argv: readonly string[]): string | undefined {
  return [...argv].reverse().find((argument) => isMailtoUrl(argument))
}

/** What Shifted does with a `mailto:` link from another app. */
export type MailtoAction =
  /** Shifted has no accounts. Show the main window and the text "Add an account first". */
  | { kind: 'no-accounts' }
  /** Open the new message in this account at once: the saved `mailto:` default. */
  | { kind: 'account'; accountId: string }
  /** Show the account picker with this account selected. */
  | { kind: 'picker'; selectedAccountId: string }

/**
 * Choose what to do with a `mailto:` link from another app.
 *
 * @param accountIds The accounts, in the order of the sidebar.
 * @param defaultAccountId The `mailto:` default ("Always use this account"), or `null`.
 * @param lastAccountId The account that the person used last for a `mailto:` link, or
 *   `null`.
 */
export function chooseMailtoAction(
  accountIds: readonly string[],
  defaultAccountId: string | null,
  lastAccountId: string | null
): MailtoAction {
  const [first] = accountIds
  if (first === undefined) return { kind: 'no-accounts' }
  if (defaultAccountId !== null && accountIds.includes(defaultAccountId)) {
    return { kind: 'account', accountId: defaultAccountId }
  }
  const selected =
    lastAccountId !== null && accountIds.includes(lastAccountId) ? lastAccountId : first
  return { kind: 'picker', selectedAccountId: selected }
}
