import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  CALENDAR_EVENT_PATH,
  FAKE_DOWNLOAD_CONTENT,
  FAKE_DOWNLOAD_NAME,
  FAKE_DOWNLOAD_PATH,
  MAILTO_LINK,
  OUTSIDE_LINK,
  startFakeGoogle,
  type FakeGoogleServer
} from '../fake-google/server'

/** Sign in on the fake server with this address, and return the cookie header. */
async function signIn(fakeGoogle: FakeGoogleServer, email?: string): Promise<string> {
  const response = await fetch(`${fakeGoogle.url}/signin`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: email === undefined ? '' : new URLSearchParams({ email }).toString()
  })
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

describe('the fake Google test server', () => {
  let fakeGoogle: FakeGoogleServer

  beforeAll(async () => {
    fakeGoogle = await startFakeGoogle()
  })

  afterAll(async () => {
    await fakeGoogle.close()
  })

  it('starts on a free port of 127.0.0.1', () => {
    expect(fakeGoogle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it('serves the fake pages to a signed-in session', async () => {
    const signedIn = await fetch(`${fakeGoogle.url}/signin`, { method: 'POST', redirect: 'manual' })
    expect(signedIn.status).toBe(302)
    expect(signedIn.headers.get('location')).toBe('/gmail/')
    const setCookie = signedIn.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/^FAKE_SID=[^;]+;/)
    expect(setCookie).toContain('Max-Age=')
    const cookie = setCookie.split(';')[0] ?? ''
    const headers = { cookie }

    const gmail = await fetch(`${fakeGoogle.url}/gmail/`, { headers })
    expect(await gmail.text()).toContain('<title>Inbox - test@example.com - Gmail</title>')

    const calendar = await fetch(`${fakeGoogle.url}/calendar/`, { headers })
    expect(await calendar.text()).toContain('<title>Calendar</title>')

    const avatar = await fetch(`${fakeGoogle.url}/avatar.png`, { headers })
    expect(avatar.headers.get('content-type')).toBe('image/png')
    const png = Buffer.from(await avatar.arrayBuffer())
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')

    const signInAgain = await fetch(`${fakeGoogle.url}/signin`, { headers, redirect: 'manual' })
    expect(signInAgain.status).toBe(302)
    expect(signInAgain.headers.get('location')).toBe('/gmail/')

    const feed = await fetch(`${fakeGoogle.url}/feed/atom/`, { headers })
    const xml = await feed.text()
    expect(xml).toContain('<title>Gmail - Inbox for test@example.com</title>')
    expect(xml).toContain('<fullcount>0</fullcount>')
  })

  it('sends a session with no cookie to the sign-in page', async () => {
    const gmail = await fetch(`${fakeGoogle.url}/gmail/`, { redirect: 'manual' })
    expect(gmail.status).toBe(302)
    expect(gmail.headers.get('location')).toBe('/signin')

    const calendar = await fetch(`${fakeGoogle.url}/calendar/`, { redirect: 'manual' })
    expect(calendar.status).toBe(302)
    expect(calendar.headers.get('location')).toBe('/signin')

    const signInPage = await fetch(`${fakeGoogle.url}/signin`)
    const html = await signInPage.text()
    expect(html).toContain('Sign in</button>')
    expect(html).toContain('name="email" value="test@example.com"')

    const avatar = await fetch(`${fakeGoogle.url}/avatar.png`)
    expect(avatar.status).toBe(404)

    const feed = await fetch(`${fakeGoogle.url}/feed/atom/`)
    expect(feed.status).toBe(401)
  })

  it('gives each session the address that signed in', async () => {
    const first = await signIn(fakeGoogle, 'one@example.com')
    const second = await signIn(fakeGoogle, 'two@example.com')
    const third = await signIn(fakeGoogle)

    const gmailOf = async (cookie: string): Promise<string> =>
      (await fetch(`${fakeGoogle.url}/gmail/`, { headers: { cookie } })).text()
    expect(await gmailOf(first)).toContain('<p id="address">one@example.com</p>')
    expect(await gmailOf(second)).toContain('<p id="address">two@example.com</p>')
    expect(await gmailOf(third)).toContain('<p id="address">test@example.com</p>')
    // The fake Gmail shows the photo where gmail-page.ts looks for it.
    expect(await gmailOf(first)).toMatch(
      /<a href="\/SignOutOptions"[^>]*><img class="gbii" src="\/avatar.png"/
    )

    const feedOf = async (cookie: string): Promise<string> =>
      (await fetch(`${fakeGoogle.url}/feed/atom/`, { headers: { cookie } })).text()
    expect(await feedOf(second)).toContain('<title>Gmail - Inbox for two@example.com</title>')

    const avatarOf = async (cookie: string): Promise<Buffer> =>
      Buffer.from(
        await (await fetch(`${fakeGoogle.url}/avatar.png`, { headers: { cookie } })).arrayBuffer()
      )
    expect((await avatarOf(first)).equals(await avatarOf(second))).toBe(false)
  })

  it('signs every session out with the control route, and clears the cookie', async () => {
    const signedIn = await fetch(`${fakeGoogle.url}/signin`, { method: 'POST', redirect: 'manual' })
    const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0] ?? ''

    await fakeGoogle.signOut()

    const gmail = await fetch(`${fakeGoogle.url}/gmail/`, {
      headers: { cookie },
      redirect: 'manual'
    })
    expect(gmail.status).toBe(302)
    expect(gmail.headers.get('location')).toBe('/signin')
    expect(gmail.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('serves the link pages: pop-out, Calendar event, outside links, mailto, microphone, download', async () => {
    const cookie = await signIn(fakeGoogle, 'links@example.com')
    const headers = { cookie }

    const gmail = await (await fetch(`${fakeGoogle.url}/gmail/`, { headers })).text()
    expect(gmail).toContain("window.open('about:blank'")
    expect(gmail).toContain(`href="${CALENDAR_EVENT_PATH.replace('&', '&amp;')}" target="_blank"`)
    expect(gmail).toContain(`href="${OUTSIDE_LINK}"`)
    expect(gmail).toContain(`href="${MAILTO_LINK}"`)
    expect(gmail).toContain('getUserMedia')
    expect(gmail).toContain(`href="${FAKE_DOWNLOAD_PATH}"`)
    expect(gmail).not.toContain('id="compose-url"')

    const compose = await fetch(
      `${fakeGoogle.url}/gmail/?extsrc=mailto&url=${encodeURIComponent(MAILTO_LINK)}`,
      { headers }
    )
    expect(await compose.text()).toContain(`<p id="compose-url">${MAILTO_LINK}</p>`)

    const event = await fetch(`${fakeGoogle.url}${CALENDAR_EVENT_PATH}`, { headers })
    const eventHtml = await event.text()
    expect(eventHtml).toContain('<p id="event">fake-event</p>')
    expect(eventHtml).toContain('<p id="address">links@example.com</p>')

    const download = await fetch(`${fakeGoogle.url}${FAKE_DOWNLOAD_PATH}`, { headers })
    expect(download.headers.get('content-disposition')).toBe(
      `attachment; filename="${FAKE_DOWNLOAD_NAME}"`
    )
    expect(await download.text()).toBe(FAKE_DOWNLOAD_CONTENT)
  })

  it('sets the count and the entries of each feed for each address, and the Gmail title follows Primary', async () => {
    const one = await signIn(fakeGoogle, 'feed-one@example.com')
    const two = await signIn(fakeGoogle, 'feed-two@example.com')
    const feedOf = async (cookie: string, label: string): Promise<string> =>
      (await fetch(`${fakeGoogle.url}/feed/atom/${label}`, { headers: { cookie } })).text()
    const titleOf = async (cookie: string): Promise<string> =>
      /<title>([^<]*)<\/title>/.exec(
        await (await fetch(`${fakeGoogle.url}/gmail/`, { headers: { cookie } })).text()
      )?.[1] ?? ''

    await fakeGoogle.setFeed({ feed: 'whole-inbox', count: 40 })
    await fakeGoogle.setFeed({
      address: 'feed-one@example.com',
      feed: 'primary',
      count: 3,
      entries: [
        {
          id: '101',
          title: 'Hello <there>',
          authorName: 'Sam',
          authorEmail: 'sam@example.com',
          issued: '2026-10-21T09:00:00Z'
        }
      ]
    })
    await fakeGoogle.setFeed({ address: 'feed-two@example.com', feed: 'important', count: 7 })

    const primaryOne = await feedOf(one, '%5Esq_ig_i_personal')
    expect(primaryOne).toContain('<fullcount>3</fullcount>')
    expect(primaryOne).toContain('<title>Hello &lt;there&gt;</title>')
    expect(primaryOne).toContain('<email>sam@example.com</email>')
    expect(await feedOf(one, '')).toContain('<fullcount>40</fullcount>')
    expect(await feedOf(two, '')).toContain('<fullcount>40</fullcount>')
    expect(await feedOf(two, '%5Esq_ig_i_personal')).toContain('<fullcount>0</fullcount>')
    expect(await feedOf(two, '%5Eiim')).toContain('<fullcount>7</fullcount>')

    expect(await titleOf(one)).toBe('Inbox (3) - feed-one@example.com - Gmail')
    expect(await titleOf(two)).toBe('Inbox - feed-two@example.com - Gmail')

    const bad = await fetch(`${fakeGoogle.url}/control/feed`, {
      method: 'POST',
      body: JSON.stringify({ feed: 'spam', count: 1 })
    })
    expect(bad.status).toBe(400)
  })

  it('makes every feed fail with HTTP 500 until the failure is turned off', async () => {
    const cookie = await signIn(fakeGoogle, 'failure@example.com')
    await fakeGoogle.setFeedFailure(true)
    for (const label of ['', '%5Esq_ig_i_personal', '%5Eiim']) {
      const response = await fetch(`${fakeGoogle.url}/feed/atom/${label}`, { headers: { cookie } })
      expect(response.status).toBe(500)
    }
    await fakeGoogle.setFeedFailure('sign-in-redirect')
    const redirected = await fetch(`${fakeGoogle.url}/feed/atom/%5Eiim`, {
      headers: { cookie },
      redirect: 'manual'
    })
    expect(redirected.status).toBe(302)
    expect(redirected.headers.get('location')).toBe('/signin')
    await fakeGoogle.setFeedFailure(false)
    const response = await fetch(`${fakeGoogle.url}/feed/atom/`, { headers: { cookie } })
    expect(response.status).toBe(200)
  })
})
