import { describe, expect, it } from 'vitest'
import { parseFeedAddress, parseFeedTitleAddress } from '../../src/main/feed'

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
