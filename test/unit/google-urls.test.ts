import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  calendarUrl,
  feedUrl,
  gmailUrl,
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
