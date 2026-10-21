import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  calendarUrl,
  feedUrl,
  gmailComposeUrl,
  gmailUrl,
  googleRedirectTarget,
  isCalendarLink,
  isGmailLink,
  isProfilePhotoUrl,
  isTestMode,
  signInUrl
} from '../../src/main/google-urls'

const SRC = resolve(__dirname, '../../src')
const GOOGLE_URLS_FILE = join(SRC, 'main', 'google-urls.ts')

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

describe('google-urls', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env['SHIFTED_TEST_SERVER']
    delete process.env['SHIFTED_TEST_SERVER']
  })

  afterEach(() => {
    if (saved === undefined) delete process.env['SHIFTED_TEST_SERVER']
    else process.env['SHIFTED_TEST_SERVER'] = saved
  })

  it('returns the real Google URLs when SHIFTED_TEST_SERVER is not set', () => {
    expect(isTestMode()).toBe(false)
    expect(gmailUrl()).toBe('https://mail.google.com/mail/u/0/')
    expect(calendarUrl()).toBe('https://calendar.google.com/calendar/u/0/r')
    expect(signInUrl()).toBe(
      'https://accounts.google.com/ServiceLogin?service=mail&continue=https://mail.google.com/mail/u/0/'
    )
    expect(feedUrl()).toBe('https://mail.google.com/mail/u/0/feed/atom/')
    expect(feedUrl('%5Esq_ig_i_personal')).toBe(
      'https://mail.google.com/mail/u/0/feed/atom/%5Esq_ig_i_personal'
    )
  })

  it('returns a URL on the test server for each URL function when SHIFTED_TEST_SERVER is set', () => {
    process.env['SHIFTED_TEST_SERVER'] = 'http://127.0.0.1:4555'
    expect(isTestMode()).toBe(true)
    expect(gmailUrl()).toBe('http://127.0.0.1:4555/gmail/')
    expect(calendarUrl()).toBe('http://127.0.0.1:4555/calendar/')
    expect(signInUrl()).toBe('http://127.0.0.1:4555/signin')
    expect(feedUrl()).toBe('http://127.0.0.1:4555/feed/atom/')
    expect(feedUrl('%5Eiim')).toBe('http://127.0.0.1:4555/feed/atom/%5Eiim')
  })

  it('accepts profile photo URLs only on Google photo hosts with https', () => {
    expect(isProfilePhotoUrl('https://lh3.googleusercontent.com/ogw/abc=s64-c-mo')).toBe(true)
    expect(isProfilePhotoUrl('https://ssl.gstatic.com/accounts/ui/avatar_2x.png')).toBe(true)
    expect(isProfilePhotoUrl('http://lh3.googleusercontent.com/ogw/abc')).toBe(false)
    expect(isProfilePhotoUrl('https://evilgoogleusercontent.com/a.png')).toBe(false)
    expect(isProfilePhotoUrl('https://example.com/a.png')).toBe(false)
    expect(isProfilePhotoUrl('not a url')).toBe(false)
  })

  it('accepts profile photo URLs only on the fake server in test mode', () => {
    process.env['SHIFTED_TEST_SERVER'] = 'http://127.0.0.1:4555'
    expect(isProfilePhotoUrl('http://127.0.0.1:4555/avatar.png')).toBe(true)
    expect(isProfilePhotoUrl('http://127.0.0.1:4556/avatar.png')).toBe(false)
    expect(isProfilePhotoUrl('https://lh3.googleusercontent.com/ogw/abc')).toBe(false)
  })

  it('knows Gmail links and Calendar links by their https host', () => {
    expect(isGmailLink('https://mail.google.com/mail/u/0/?view=pt')).toBe(true)
    expect(isGmailLink('https://mail.google.com/')).toBe(true)
    expect(isGmailLink('http://mail.google.com/mail/u/0/')).toBe(false)
    expect(isGmailLink('https://calendar.google.com/calendar/r')).toBe(false)
    expect(isGmailLink('https://mail.google.com.example.com/')).toBe(false)
    expect(isCalendarLink('https://calendar.google.com/calendar/event?eid=abc')).toBe(true)
    expect(isCalendarLink('https://mail.google.com/mail/u/0/')).toBe(false)
    expect(isCalendarLink('not a url')).toBe(false)
  })

  it('knows Gmail links and Calendar links by their path on the test server', () => {
    process.env['SHIFTED_TEST_SERVER'] = 'http://127.0.0.1:4555'
    expect(isGmailLink('http://127.0.0.1:4555/gmail/?extsrc=mailto')).toBe(true)
    expect(isGmailLink('http://127.0.0.1:4555/calendar/')).toBe(false)
    expect(isCalendarLink('http://127.0.0.1:4555/calendar/event?eid=x')).toBe(true)
    expect(isCalendarLink('http://127.0.0.1:4556/calendar/event?eid=x')).toBe(false)
    expect(isGmailLink('https://mail.google.com/mail/u/0/')).toBe(false)
  })

  it('makes the Gmail compose URL for a mailto: link', () => {
    expect(gmailComposeUrl('mailto:a@example.com?subject=Hi there')).toBe(
      'https://mail.google.com/mail/u/0/?extsrc=mailto&url=mailto%3Aa%40example.com%3Fsubject%3DHi%20there'
    )
    process.env['SHIFTED_TEST_SERVER'] = 'http://127.0.0.1:4555'
    expect(gmailComposeUrl('mailto:a@example.com')).toBe(
      'http://127.0.0.1:4555/gmail/?extsrc=mailto&url=mailto%3Aa%40example.com'
    )
  })

  it('reads the target of the Google redirect page', () => {
    const target = 'https://calendar.google.com/calendar/event?eid=abc&tok=1'
    expect(googleRedirectTarget(`https://www.google.com/url?q=${encodeURIComponent(target)}`)).toBe(
      target
    )
    expect(
      googleRedirectTarget(`https://www.google.com/url?url=${encodeURIComponent(target)}`)
    ).toBe(target)
    expect(googleRedirectTarget('https://www.google.com/url?q=javascript:alert(1)')).toBeUndefined()
    expect(
      googleRedirectTarget('https://www.google.com/search?q=https://example.com')
    ).toBeUndefined()
    expect(googleRedirectTarget('https://example.com/url?q=https://example.com')).toBeUndefined()
    expect(googleRedirectTarget('not a url')).toBeUndefined()
  })

  it('accepts a test server URL with a trailing slash', () => {
    process.env['SHIFTED_TEST_SERVER'] = 'http://127.0.0.1:4555/'
    expect(gmailUrl()).toBe('http://127.0.0.1:4555/gmail/')
  })

  it('no file in src/ outside google-urls.ts contains a Google host name', () => {
    const offenders = listFiles(SRC)
      .filter((file) => file !== GOOGLE_URLS_FILE)
      .filter((file) => readFileSync(file).toString('latin1').includes('google.com'))
      .map((file) => relative(SRC, file))
    expect(offenders).toEqual([])
  })
})
