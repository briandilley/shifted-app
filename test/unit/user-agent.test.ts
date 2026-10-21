import { describe, expect, it } from 'vitest'
import { applyUserAgent, makeUserAgent } from '../../src/main/user-agent'

// The default user agents of Electron, as `app.userAgentFallback` gives them.
const DEFAULT_WITH_PACKAGE_NAME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) shifted/0.1.0 Chrome/156.0.7000.0 Electron/45.0.0 Safari/537.36'
const DEFAULT_WITH_PRODUCT_NAME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Shifted/0.1.0 Chrome/156.0.7000.0 Electron/45.0.0 Safari/537.36'
const DEFAULT_WITH_NO_APP_TOKEN =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.7000.0 Electron/45.0.0 Safari/537.36'

function expectHonest(userAgent: string, version: string): void {
  expect(userAgent).toMatch(/\bElectron\/\d+\.\d+\.\d+/)
  expect(userAgent).toContain(`Shifted/${version}`)
  expect(userAgent).toMatch(/\bChrome\/\d+/)
  expect(userAgent.match(/Shifted\//gi)).toHaveLength(1)
}

describe('makeUserAgent', () => {
  it('keeps the Electron/ token and has one Shifted/ token', () => {
    for (const defaultUserAgent of [
      DEFAULT_WITH_PACKAGE_NAME,
      DEFAULT_WITH_PRODUCT_NAME,
      DEFAULT_WITH_NO_APP_TOKEN
    ]) {
      expectHonest(makeUserAgent(defaultUserAgent, '1.2.3'), '1.2.3')
    }
  })

  it('puts the Shifted/ token before the Chrome/ token', () => {
    expect(makeUserAgent(DEFAULT_WITH_PACKAGE_NAME, '0.1.0')).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Shifted/0.1.0 Chrome/156.0.7000.0 Electron/45.0.0 Safari/537.36'
    )
  })

  it('removes an app token with another app name', () => {
    const userAgent = makeUserAgent(
      DEFAULT_WITH_NO_APP_TOKEN.replace('Chrome/', 'Other-Name/0.1.0 Chrome/'),
      '0.1.0',
      ['Other-Name']
    )
    expect(userAgent).not.toContain('Other-Name')
    expectHonest(userAgent, '0.1.0')
  })

  it('refuses a user agent with no Electron/ token', () => {
    expect(() =>
      makeUserAgent(
        'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
        '0.1.0'
      )
    ).toThrow(/Electron/)
  })
})

describe('applyUserAgent', () => {
  it('sets userAgentFallback with the Shifted/ and Electron/ tokens', () => {
    const app = {
      userAgentFallback: DEFAULT_WITH_PACKAGE_NAME,
      getVersion: () => '0.1.0',
      getName: () => 'Shifted'
    }
    applyUserAgent(app)
    expectHonest(app.userAgentFallback, '0.1.0')
  })
})
