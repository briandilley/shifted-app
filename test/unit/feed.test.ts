import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  feedErrorText,
  parseFeed,
  parseFeedAddress,
  parseFeedTitleAddress,
  readFeed,
  type FeedResponse
} from '../../src/main/feed'

/** Read a handmade fixture of `test/unit/fixtures/`. */
function fixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8')
}

function feed(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
<title>${title}</title>
<tagline>New messages in your Gmail Inbox</tagline>
<fullcount>2</fullcount>
<entry><title>Lunch on Friday</title></entry>
</feed>`
}

describe('parseFeedTitleAddress', () => {
  it('returns the address of the title "Gmail - Inbox for <address>"', () => {
    expect(parseFeedTitleAddress('Gmail - Inbox for name@gmail.com')).toBe('name@gmail.com')
    expect(parseFeedTitleAddress('Gmail - Inbox for name@company.com')).toBe('name@company.com')
  })

  it('returns nothing for a wrong title', () => {
    for (const title of [
      '',
      'Gmail - Inbox',
      'Gmail - Inbox for ',
      'Gmail - Inbox for nobody',
      'Inbox for name@gmail.com',
      'Gmail - Label for name@gmail.com',
      'Gmail - Inbox for name@gmail.com and more'
    ]) {
      expect(parseFeedTitleAddress(title), title).toBeUndefined()
    }
  })
})

describe('parseFeedAddress', () => {
  it('reads the address from the feed title, not from an entry title', () => {
    expect(parseFeedAddress(feed('Gmail - Inbox for name@gmail.com'))).toBe('name@gmail.com')
  })

  it('decodes XML entities in the title', () => {
    expect(parseFeedAddress(feed('Gmail - Inbox for o&apos;brien&#43;x@example.com'))).toBe(
      "o'brien+x@example.com"
    )
  })

  it('returns nothing for a wrong title or no feed', () => {
    expect(parseFeedAddress(feed('Something else'))).toBeUndefined()
    expect(parseFeedAddress('<html><body>Sign in</body></html>')).toBeUndefined()
    expect(parseFeedAddress('')).toBeUndefined()
  })
})

describe('parseFeed', () => {
  it('reads the address, the fullcount, and the entries', () => {
    expect(parseFeed(fixture('feed-two-entries.xml'))).toEqual({
      address: 'alex.example@gmail.com',
      fullcount: 2,
      entries: [
        {
          id: 'tag:gmail.google.com,2004:1800000000000000001',
          title: 'Lunch on Friday & a question',
          authorName: 'Sam Sender',
          authorEmail: 'sam@example.com',
          issued: '2026-10-21T09:15:00Z',
          link: 'https://mail.google.com/mail/u/0?account_id=alex.example@gmail.com&message_id=18f0000000000001&view=conv&extsrc=atom'
        },
        {
          id: 'tag:gmail.google.com,2004:1800000000000000002',
          title: '2026',
          authorName: "O'Brien + Co",
          authorEmail: 'obrien@example.org',
          issued: '2026-10-21T08:00:00Z',
          link: 'https://mail.google.com/mail/u/0?account_id=alex.example@gmail.com&message_id=18f0000000000002&view=conv&extsrc=atom'
        }
      ]
    })
  })

  it('reads a feed with no entries', () => {
    expect(parseFeed(fixture('feed-empty.xml'))).toEqual({
      address: 'name@company.example',
      fullcount: 0,
      entries: []
    })
  })

  it('reads a feed with one entry and a large count, and no address from a label title', () => {
    const feed = parseFeed(fixture('feed-label.xml'))
    expect(feed?.address).toBeUndefined()
    expect(feed?.fullcount).toBe(1234)
    expect(feed?.entries).toHaveLength(1)
    expect(feed?.entries[0]).toMatchObject({ title: 'Only one', authorEmail: 'pat@example.net' })
  })

  it('returns nothing for a page that is not a feed, a feed with no fullcount, or broken XML', () => {
    expect(parseFeed(fixture('sign-in-page.html'))).toBeUndefined()
    expect(parseFeed(fixture('feed-no-fullcount.xml'))).toBeUndefined()
    expect(parseFeed('<feed><fullcount>2</fullcount>')).toBeUndefined()
    expect(parseFeed('<feed><fullcount>two</fullcount></feed>')).toBeUndefined()
    expect(parseFeed('')).toBeUndefined()
  })
})

describe('readFeed', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env['SHIFTED_TEST_SERVER']
    delete process.env['SHIFTED_TEST_SERVER']
  })

  afterEach(() => {
    if (saved === undefined) delete process.env['SHIFTED_TEST_SERVER']
    else process.env['SHIFTED_TEST_SERVER'] = saved
  })

  function respond(
    status: number,
    body: string,
    redirects: string[] = []
  ): { fetch: (requested: string) => Promise<FeedResponse>; requests: string[] } {
    const requests: string[] = []
    const fetch = (requested: string): Promise<FeedResponse> => {
      requests.push(requested)
      return Promise.resolve({ status, redirects, text: () => Promise.resolve(body) })
    }
    return { fetch, requests }
  }

  it('reads the feed of the label', async () => {
    const { fetch, requests } = respond(200, fixture('feed-two-entries.xml'))
    const result = await readFeed(fetch, '%5Esq_ig_i_personal')
    expect(requests).toEqual(['https://mail.google.com/mail/u/0/feed/atom/%5Esq_ig_i_personal'])
    expect(result.ok && result.feed.fullcount).toBe(2)
  })

  it('returns an error for a status that is not 200', async () => {
    expect(await readFeed(respond(500, 'Oops').fetch, '')).toEqual({
      ok: false,
      error: { kind: 'http', status: 500 }
    })
    expect(await readFeed(respond(401, 'Unauthorized').fetch, '')).toEqual({
      ok: false,
      error: { kind: 'signed-out' }
    })
  })

  it('returns "signed out" for a redirect to the sign-in page', async () => {
    const { fetch } = respond(200, fixture('sign-in-page.html'), [
      'https://accounts.google.com/ServiceLogin?service=mail'
    ])
    expect(await readFeed(fetch, '')).toEqual({ ok: false, error: { kind: 'signed-out' } })
    // Also when the sign-in page sends the request on to another page.
    const onward = respond(200, '<html></html>', [
      'https://accounts.google.com/ServiceLogin?service=mail',
      'https://mail.google.com/mail/u/0/'
    ])
    expect(await readFeed(onward.fetch, '')).toEqual({ ok: false, error: { kind: 'signed-out' } })
  })

  it('reads a feed after a redirect that does not go to the sign-in page', async () => {
    const { fetch } = respond(200, fixture('feed-empty.xml'), [
      'https://mail.google.com/mail/u/0/feed/atom/?x=1'
    ])
    const result = await readFeed(fetch, '')
    expect(result.ok && result.feed.fullcount).toBe(0)
  })

  it('returns a parse error for an answer that is not a feed', async () => {
    expect(await readFeed(respond(200, '<html><body>Hello</body></html>').fetch, '')).toEqual({
      ok: false,
      error: { kind: 'parse' }
    })
  })

  it('returns a network error when the request fails', async () => {
    const fetch = (): Promise<FeedResponse> =>
      Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED'))
    expect(await readFeed(fetch, '')).toEqual({ ok: false, error: { kind: 'network' } })
  })

  it('says why a read failed, for the tooltip of the warning mark', () => {
    expect(feedErrorText({ kind: 'signed-out' })).toBe('Signed out')
    expect(feedErrorText({ kind: 'network' })).toBe('Offline')
    expect(feedErrorText({ kind: 'http', status: 500 })).toContain('HTTP 500')
    expect(feedErrorText({ kind: 'parse' })).not.toBe('')
  })
})
