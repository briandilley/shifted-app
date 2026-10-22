/**
 * Checks for version 1 of Shifted, from the spec trace of prompt 10: the version, the name,
 * the bundle identifier, the letter of an avatar with no photo, and the rules of "What
 * Shifted is not", "Page permissions", and "Privacy and network" in `docs/spec/PRODUCT.md`
 * that a look at the sources can prove.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeUserAgent } from '../../src/main/user-agent'
import { accountLetter } from '../../src/renderer/src/account-display'
import {
  defaultNotificationSwitches,
  defaultQuietHours,
  type AccountState
} from '../../src/shared/api'

const ROOT = resolve(__dirname, '../..')
const SRC = join(ROOT, 'src')

interface PackageJson {
  name: string
  productName: string
  version: string
}

const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageJson
const BUILDER_CONFIG = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8')

/** The default user agent of Electron, with the app token that Electron puts in it. */
const DEFAULT_USER_AGENT = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) shifted/${PACKAGE.version} Chrome/156.0.7000.0 Electron/45.0.0 Safari/537.36`

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

/** The files in `src/` that contain the text, as paths relative to `src/`. */
function filesThatContain(pattern: RegExp): string[] {
  return listFiles(SRC)
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC, file))
}

/** A top-level value of `electron-builder.yml`, for example `appId`. */
function builderValue(key: string): string | undefined {
  return new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(BUILDER_CONFIG)?.[1]?.trim()
}

describe('the version', () => {
  it('is a version of the form major.minor.patch in package.json', () => {
    expect(PACKAGE.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('is in the user agent as Shifted/<version>', () => {
    const userAgent = makeUserAgent(DEFAULT_USER_AGENT, PACKAGE.version, [PACKAGE.name])
    expect(userAgent).toContain(`Shifted/${PACKAGE.version}`)
    expect(userAgent).toMatch(/\bElectron\/\d+/)
  })
})

describe('the name and the bundle identifier', () => {
  it('are the values of "Name" in PRODUCT.md', () => {
    expect(PACKAGE.productName).toBe('Shifted')
    expect(builderValue('productName')).toBe('Shifted')
    expect(builderValue('appId')).toBe('io.github.briandilley.shifted')
  })
})

describe('the macOS usage descriptions', () => {
  it('say why Shifted needs the camera and the microphone', () => {
    expect(BUILDER_CONFIG).toMatch(/^\s+NSCameraUsageDescription: \S.+$/m)
    expect(BUILDER_CONFIG).toMatch(/^\s+NSMicrophoneUsageDescription: \S.+$/m)
  })
})

describe('the sources', () => {
  it('load no Chrome extension', () => {
    expect(filesThatContain(/\bloadExtension\b|\bextensions\.loadExtension\b/)).toEqual([])
  })

  it('call no Gmail API and no other Google API', () => {
    expect(filesThatContain(/googleapis\.com|gmail\/v1/)).toEqual([])
  })

  it('have no crash reporting and no telemetry', () => {
    expect(filesThatContain(/\bcrashReporter\b|\bsentry\b|\banalytics\b/i)).toEqual([])
  })

  it('ask the operating system for no permission at startup', () => {
    expect(filesThatContain(/\baskForMediaAccess\b/)).toEqual([])
  })

  it('have no web address outside google-urls.ts, except the name of the Atom format', () => {
    const offenders = listFiles(SRC)
      .filter((file) => file !== join(SRC, 'main', 'google-urls.ts'))
      .flatMap((file) =>
        (readFileSync(file, 'utf8').match(/https?:\/\/[^\s'"`)>]+/g) ?? [])
          .filter((url) => url !== 'http://purl.org/atom/ns#')
          .map((url) => `${relative(SRC, file)}: ${url}`)
      )
    expect(offenders).toEqual([])
  })
})

describe('the avatar with no photo', () => {
  function account(change: Partial<AccountState>): AccountState {
    return {
      id: 'id',
      email: 'work@company.com',
      nickname: '',
      color: '#1A73E8',
      status: 'signed-in',
      lastGoogleApp: 'gmail',
      photo: null,
      pagePermissions: {},
      unreadCount: null,
      unreadWarning: null,
      notifications: defaultNotificationSwitches(),
      quietHours: defaultQuietHours(),
      unreadCountSource: 'automatic',
      unreadFeed: 'primary',
      automaticFeedLearned: false,
      pageProblems: {},
      checkingSignIn: [],
      ...change
    }
  }

  it('shows the first letter of the account name, which is the address', () => {
    expect(accountLetter(account({}))).toBe('W')
    expect(accountLetter(account({ nickname: 'Personal' }))).toBe('W')
    expect(accountLetter(account({ email: 'ana@example.com' }))).toBe('A')
  })
})
