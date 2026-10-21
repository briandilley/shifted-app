import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isSignInFinished } from '../../src/main/sign-in'
import { isSignInPageUrl } from '../../src/main/google-urls'

describe('isSignInFinished', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env['SHIFTED_TEST_SERVER']
    delete process.env['SHIFTED_TEST_SERVER']
  })

  afterEach(() => {
    if (saved === undefined) delete process.env['SHIFTED_TEST_SERVER']
    else process.env['SHIFTED_TEST_SERVER'] = saved
  })

  it('returns true for Gmail URLs', () => {
    expect(isSignInFinished('https://mail.google.com/mail/u/0/')).toBe(true)
    expect(isSignInFinished('https://mail.google.com/mail/u/0/#inbox')).toBe(true)
    expect(isSignInFinished('https://mail.google.com/mail/u/1/?ogbl#inbox')).toBe(true)
  })

  it('returns false for sign-in pages, identity providers, and other URLs', () => {
    for (const url of [
      'https://accounts.google.com/ServiceLogin?service=mail&continue=https://mail.google.com/mail/u/0/',
      'https://accounts.google.com/v3/signin/challenge/pwd',
      'https://accounts.google.com/CheckCookie?continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F',
      'https://mail.google.com/accounts/SetOSID?continue=https://mail.google.com/mail/u/0/',
      'https://mail.google.com/',
      'https://company.okta.com/app/google/sso/saml',
      'https://login.microsoftonline.com/common/oauth2/authorize',
      'https://calendar.google.com/calendar/u/0/r',
      'http://mail.google.com/mail/u/0/',
      'https://mail.google.com.example.com/mail/u/0/',
      'https://example.com/?next=https://mail.google.com/mail/u/0/',
      'not a url',
      ''
    ]) {
      expect(isSignInFinished(url), url).toBe(false)
    }
  })

  it('uses the fake Gmail of the test server in test mode', () => {
    process.env['SHIFTED_TEST_SERVER'] = 'http://127.0.0.1:4555'
    expect(isSignInFinished('http://127.0.0.1:4555/gmail/')).toBe(true)
    expect(isSignInFinished('http://127.0.0.1:4555/signin')).toBe(false)
    expect(isSignInFinished('http://127.0.0.1:4556/gmail/')).toBe(false)
    expect(isSignInFinished('https://mail.google.com/mail/u/0/')).toBe(false)
  })
})

describe('isSignInPageUrl', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env['SHIFTED_TEST_SERVER']
    delete process.env['SHIFTED_TEST_SERVER']
  })

  afterEach(() => {
    if (saved === undefined) delete process.env['SHIFTED_TEST_SERVER']
    else process.env['SHIFTED_TEST_SERVER'] = saved
  })

  it('returns true only for pages of accounts.google.com', () => {
    expect(isSignInPageUrl('https://accounts.google.com/ServiceLogin?service=mail')).toBe(true)
    expect(isSignInPageUrl('https://accounts.google.com/v3/signin/identifier')).toBe(true)
    expect(isSignInPageUrl('https://mail.google.com/mail/u/0/')).toBe(false)
    expect(isSignInPageUrl('https://accounts.google.com.example.com/')).toBe(false)
    expect(isSignInPageUrl('https://myaccount.google.com/')).toBe(false)
  })

  it('uses the fake sign-in page of the test server in test mode', () => {
    process.env['SHIFTED_TEST_SERVER'] = 'http://127.0.0.1:4555'
    expect(isSignInPageUrl('http://127.0.0.1:4555/signin')).toBe(true)
    expect(isSignInPageUrl('http://127.0.0.1:4555/gmail/')).toBe(false)
    expect(isSignInPageUrl('http://127.0.0.1:4555/signinx')).toBe(false)
  })
})
