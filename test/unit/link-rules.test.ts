import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isDefaultBrowserUrl,
  linkTarget,
  routeNavigation,
  type LinkSource,
  type NavigationResult,
  type RequestKind
} from '../../src/main/link-rules'

const GMAIL = 'https://mail.google.com/mail/u/0/#inbox'
const GMAIL_PRINT =
  'https://mail.google.com/mail/u/0/?ik=abc&view=pt&search=all&permthid=thread-f:1'
const CALENDAR_EVENT = 'https://calendar.google.com/calendar/event?action=VIEW&eid=abc'
const CALENDAR = 'https://calendar.google.com/calendar/u/0/r/week'
const DOCS = 'https://docs.google.com/document/d/abc/edit'
const OUTSIDE = 'https://example.com/doc'
const SIGN_IN = 'https://accounts.google.com/v3/signin/identifier'
const IDENTITY_PROVIDER = 'https://company.okta.com/login'
const MAILTO = 'mailto:friend@example.com?subject=Hello'
const REDIRECT_TO_CALENDAR = `https://www.google.com/url?q=${encodeURIComponent(CALENDAR_EVENT)}&sa=D`
const REDIRECT_TO_OUTSIDE = `https://www.google.com/url?q=${encodeURIComponent(OUTSIDE)}&sa=D`

const ACCOUNT_SOURCES: LinkSource[] = ['gmail', 'calendar', 'child-window']
const ALL_SOURCES: LinkSource[] = [...ACCOUNT_SOURCES, 'sign-in']
const KINDS: RequestKind[] = ['navigation', 'new-window']

function route(url: string, source: LinkSource, kind: RequestKind): NavigationResult {
  return routeNavigation(url, { source, kind })
}

describe('routeNavigation', () => {
  let saved: string | undefined

  beforeEach(() => {
    saved = process.env['SHIFTED_TEST_SERVER']
    delete process.env['SHIFTED_TEST_SERVER']
  })

  afterEach(() => {
    if (saved === undefined) delete process.env['SHIFTED_TEST_SERVER']
    else process.env['SHIFTED_TEST_SERVER'] = saved
  })

  describe('rule 1: a Gmail link opens in Gmail of the same account', () => {
    it('stays in the Gmail view for a navigation of the Gmail view', () => {
      expect(route(GMAIL, 'gmail', 'navigation')).toBe('stay')
    })

    it('selects the Gmail tab for a Gmail link in Calendar', () => {
      expect(route(GMAIL, 'calendar', 'navigation')).toBe('gmail-tab')
      expect(route(GMAIL, 'calendar', 'new-window')).toBe('gmail-tab')
    })

    it('stays in a child window for a navigation of the child window', () => {
      expect(route(GMAIL, 'child-window', 'navigation')).toBe('stay')
    })

    it('selects the Gmail tab for a Gmail link through the Google redirect page', () => {
      const redirect = `https://www.google.com/url?q=${encodeURIComponent(GMAIL)}`
      expect(route(redirect, 'gmail', 'new-window')).toBe('gmail-tab')
      expect(linkTarget(redirect)).toBe(GMAIL)
    })
  })

  describe('rule 2: a Calendar link opens in Calendar of the same account', () => {
    it('selects the Calendar tab for a Calendar link in Gmail, with no new window', () => {
      expect(route(CALENDAR_EVENT, 'gmail', 'navigation')).toBe('calendar-tab')
      expect(route(CALENDAR_EVENT, 'gmail', 'new-window')).toBe('calendar-tab')
    })

    it('selects the Calendar tab for a Calendar link in a child window', () => {
      expect(route(CALENDAR_EVENT, 'child-window', 'navigation')).toBe('calendar-tab')
      expect(route(CALENDAR_EVENT, 'child-window', 'new-window')).toBe('calendar-tab')
    })

    it('stays in the Calendar view for a navigation of the Calendar view', () => {
      expect(route(CALENDAR, 'calendar', 'navigation')).toBe('stay')
    })

    it('loads a new window of Calendar on a Calendar page in the Calendar view', () => {
      expect(route(CALENDAR_EVENT, 'calendar', 'new-window')).toBe('calendar-tab')
    })

    it('selects the Calendar tab for a Calendar link through the Google redirect page', () => {
      expect(route(REDIRECT_TO_CALENDAR, 'gmail', 'new-window')).toBe('calendar-tab')
      expect(route(REDIRECT_TO_CALENDAR, 'calendar', 'navigation')).toBe('calendar-tab')
      expect(linkTarget(REDIRECT_TO_CALENDAR)).toBe(CALENDAR_EVENT)
    })
  })

  describe('rule 3: every page stays in the sign-in window', () => {
    it('keeps Google sign-in pages, identity providers, Gmail, and other pages', () => {
      for (const url of [SIGN_IN, IDENTITY_PROVIDER, GMAIL, CALENDAR_EVENT, DOCS, OUTSIDE]) {
        for (const kind of KINDS) expect(route(url, 'sign-in', kind)).toBe('stay')
      }
    })

    it('never opens the default browser, Gmail, or a child window', () => {
      expect(route(MAILTO, 'sign-in', 'navigation')).toBe('block')
      expect(route(MAILTO, 'sign-in', 'new-window')).toBe('block')
      expect(route('about:blank', 'sign-in', 'new-window')).toBe('block')
      expect(route('', 'sign-in', 'new-window')).toBe('block')
      expect(route('about:blank', 'sign-in', 'navigation')).toBe('stay')
    })
  })

  describe('rule 4: a Gmail pop-out opens in a child window', () => {
    it('opens a child window for a new window of Gmail on a Gmail page', () => {
      expect(route(GMAIL_PRINT, 'gmail', 'new-window')).toBe('child-window')
      expect(route(GMAIL, 'gmail', 'new-window')).toBe('child-window')
    })

    it('opens a child window for a new window on about:blank', () => {
      for (const source of ACCOUNT_SOURCES) {
        expect(route('about:blank', source, 'new-window')).toBe('child-window')
        expect(route('', source, 'new-window')).toBe('child-window')
      }
    })

    it('opens another child window for a pop-out of a child window', () => {
      expect(route(GMAIL_PRINT, 'child-window', 'new-window')).toBe('child-window')
    })

    it('lets a page navigate to about:blank', () => {
      for (const source of ACCOUNT_SOURCES) {
        expect(route('about:blank', source, 'navigation')).toBe('stay')
      }
    })
  })

  describe('rule 5: every other link opens in the default browser', () => {
    it('opens Docs, Drive, Meet, Contacts, and outside pages in the default browser', () => {
      const urls = [
        DOCS,
        'https://drive.google.com/drive/u/0/my-drive',
        'https://meet.google.com/abc-defg-hij',
        'https://contacts.google.com/',
        OUTSIDE,
        'http://example.com/plain',
        REDIRECT_TO_OUTSIDE,
        // Gmail and Calendar are https only.
        'http://mail.google.com/mail/u/0/',
        'https://mail.google.com.example.com/',
        'https://evilcalendar.google.com.example.com/'
      ]
      for (const url of urls) {
        for (const source of ACCOUNT_SOURCES) {
          for (const kind of KINDS) expect(route(url, source, kind)).toBe('default-browser')
        }
      }
    })
  })

  describe('mailto: links', () => {
    it('open a new message in Gmail of the same account', () => {
      for (const source of ACCOUNT_SOURCES) {
        for (const kind of KINDS) expect(route(MAILTO, source, kind)).toBe('mailto')
      }
    })
  })

  describe('block', () => {
    it('blocks every scheme other than http, https, mailto, and about:blank', () => {
      const urls = [
        'file:///etc/passwd',
        'javascript:alert(1)',
        'data:text/html,<p>hi</p>',
        'blob:https://mail.google.com/abc',
        'chrome://settings',
        'ftp://example.com/file',
        'about:srcdoc',
        'about:config',
        'tel:+15551234567',
        'intent://example',
        'not a url'
      ]
      for (const url of urls) {
        for (const source of ALL_SOURCES) {
          for (const kind of KINDS) expect(route(url, source, kind)).toBe('block')
        }
      }
    })
  })

  describe('test mode', () => {
    beforeEach(() => {
      process.env['SHIFTED_TEST_SERVER'] = 'http://127.0.0.1:4555'
    })

    it('uses the fake Gmail and the fake Calendar of the test server', () => {
      const gmail = 'http://127.0.0.1:4555/gmail/'
      const event = 'http://127.0.0.1:4555/calendar/event?eid=fake-event'
      expect(route(gmail, 'gmail', 'navigation')).toBe('stay')
      expect(route(gmail, 'gmail', 'new-window')).toBe('child-window')
      expect(route(event, 'gmail', 'new-window')).toBe('calendar-tab')
      expect(route(gmail, 'calendar', 'navigation')).toBe('gmail-tab')
      expect(route('http://127.0.0.1:4555/signin', 'gmail', 'new-window')).toBe('default-browser')
      expect(route(OUTSIDE, 'gmail', 'navigation')).toBe('default-browser')
      // The real Google hosts are outside pages in test mode.
      expect(route(GMAIL, 'gmail', 'navigation')).toBe('default-browser')
      const redirect = `http://127.0.0.1:4555/url?q=${encodeURIComponent(event)}`
      expect(route(redirect, 'gmail', 'new-window')).toBe('calendar-tab')
    })
  })
})

describe('isDefaultBrowserUrl', () => {
  it('allows only http and https URLs', () => {
    expect(isDefaultBrowserUrl(OUTSIDE)).toBe(true)
    expect(isDefaultBrowserUrl('http://example.com/')).toBe(true)
    expect(isDefaultBrowserUrl(MAILTO)).toBe(false)
    expect(isDefaultBrowserUrl('file:///etc/passwd')).toBe(false)
    expect(isDefaultBrowserUrl('about:blank')).toBe(false)
    expect(isDefaultBrowserUrl('not a url')).toBe(false)
  })
})
