import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startFakeGoogle, type FakeGoogleServer } from '../fake-google/server'

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
    expect(await gmail.text()).toContain('<title>Inbox (0) - test@example.com - Gmail</title>')

    const calendar = await fetch(`${fakeGoogle.url}/calendar/`, { headers })
    expect(await calendar.text()).toContain('<title>Calendar</title>')

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

    const signIn = await fetch(`${fakeGoogle.url}/signin`)
    expect(await signIn.text()).toContain('Sign in</button>')

    const feed = await fetch(`${fakeGoogle.url}/feed/atom/`)
    expect(feed.status).toBe(401)
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
})
