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

  it('serves the fake pages', async () => {
    const gmail = await fetch(`${fakeGoogle.url}/gmail/`)
    expect(await gmail.text()).toContain('<title>Inbox (0) - test@example.com - Gmail</title>')

    const calendar = await fetch(`${fakeGoogle.url}/calendar/`)
    expect(await calendar.text()).toContain('<title>Calendar</title>')

    const signIn = await fetch(`${fakeGoogle.url}/signin`)
    expect(await signIn.text()).toContain('Sign in</button>')

    const signedIn = await fetch(`${fakeGoogle.url}/signin`, { method: 'POST', redirect: 'manual' })
    expect(signedIn.status).toBe(302)
    expect(signedIn.headers.get('location')).toBe('/gmail/')
    expect(signedIn.headers.get('set-cookie')).toContain('FAKE_SID=')

    const feed = await fetch(`${fakeGoogle.url}/feed/atom/`)
    const xml = await feed.text()
    expect(xml).toContain('<title>Gmail - Inbox for test@example.com</title>')
    expect(xml).toContain('<fullcount>0</fullcount>')
  })
})
