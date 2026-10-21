import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryUse } from '../../src/main/memory-use'
import { NetworkWatcher } from '../../src/main/network-watcher'
import {
  CRASH_PERIOD_MS,
  CrashCounter,
  isCertificateError,
  isConnectionError,
  isCrash
} from '../../src/main/page-problems'
import { removeRemoteDebuggingSwitches } from '../../src/main/remote-debugging'
import { spellCheckLanguages } from '../../src/main/spell-check'
import { sidebarAccountLabel } from '../../src/renderer/src/account-display'
import {
  defaultNotificationSwitches,
  defaultQuietHours,
  type AccountState
} from '../../src/shared/api'

describe('crashes', () => {
  it('reloads on its own until the third crash in 5 minutes', () => {
    const counter = new CrashCounter()
    expect(counter.record('a gmail', 0)).toBe('reload')
    expect(counter.record('a gmail', 1000)).toBe('reload')
    // Another Google app counts on its own.
    expect(counter.record('a calendar', 1500)).toBe('reload')
    expect(counter.record('a gmail', 2000)).toBe('wait')
    expect(counter.record('a gmail', 3000)).toBe('wait')
  })

  it('forgets crashes older than 5 minutes', () => {
    const counter = new CrashCounter()
    expect(counter.record('a gmail', 0)).toBe('reload')
    expect(counter.record('a gmail', 1000)).toBe('reload')
    expect(counter.record('a gmail', CRASH_PERIOD_MS + 500)).toBe('reload')
    expect(counter.record('a gmail', CRASH_PERIOD_MS + 900)).toBe('wait')
    counter.forget('a gmail')
    expect(counter.record('a gmail', CRASH_PERIOD_MS + 1000)).toBe('reload')
  })

  it('tells a crash from a clean exit', () => {
    expect(isCrash('crashed')).toBe(true)
    expect(isCrash('oom')).toBe(true)
    expect(isCrash('killed')).toBe(true)
    expect(isCrash('clean-exit')).toBe(false)
  })
})

describe('failed loads', () => {
  it('finds the certificate errors', () => {
    expect(isCertificateError(-200)).toBe(true) // ERR_CERT_COMMON_NAME_INVALID
    expect(isCertificateError(-202)).toBe(true) // ERR_CERT_AUTHORITY_INVALID
    expect(isCertificateError(-106)).toBe(false)
    expect(isCertificateError(-3)).toBe(false)
  })

  it('finds the errors of a network that does not answer', () => {
    expect(isConnectionError(-106)).toBe(true) // ERR_INTERNET_DISCONNECTED
    expect(isConnectionError(-105)).toBe(true) // ERR_NAME_NOT_RESOLVED
    expect(isConnectionError(-21)).toBe(true) // ERR_NETWORK_CHANGED
    expect(isConnectionError(-3)).toBe(false) // ERR_ABORTED
    expect(isConnectionError(-202)).toBe(false)
  })
})

describe('the network watcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls back once each time the network comes back', () => {
    let online = true
    const back = vi.fn()
    const watcher = new NetworkWatcher(() => online, back, 1000)
    watcher.start()
    vi.advanceTimersByTime(3000)
    expect(back).not.toHaveBeenCalled()
    online = false
    vi.advanceTimersByTime(3000)
    expect(back).not.toHaveBeenCalled()
    online = true
    vi.advanceTimersByTime(1000)
    expect(back).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(back).toHaveBeenCalledTimes(1)
    watcher.stop()
    online = false
    vi.advanceTimersByTime(1000)
    online = true
    vi.advanceTimersByTime(1000)
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('calls back when Shifted starts offline and the network comes', () => {
    let online = false
    const back = vi.fn()
    const watcher = new NetworkWatcher(() => online, back, 1000)
    watcher.start()
    online = true
    vi.advanceTimersByTime(1000)
    expect(back).toHaveBeenCalledTimes(1)
    watcher.stop()
  })
})

describe('spell check languages', () => {
  const available = ['de', 'en-AU', 'en-GB', 'en-US', 'fr', 'pt-BR', 'pt-PT', 'sv']

  it('takes the languages of the operating system that have a dictionary, in order', () => {
    expect(spellCheckLanguages(['en-US', 'de-DE'], available)).toEqual(['en-US', 'de'])
    expect(spellCheckLanguages(['fr-CA', 'en-GB'], available)).toEqual(['fr', 'en-GB'])
    expect(spellCheckLanguages(['pt-PT'], available)).toEqual(['pt-PT'])
    expect(spellCheckLanguages(['pt'], available)).toEqual(['pt-PT'])
    expect(spellCheckLanguages(['en'], available)).toEqual(['en-AU'])
    expect(spellCheckLanguages(['sv_SE'], available)).toEqual(['sv'])
  })

  it('leaves out languages with no dictionary, and each language once', () => {
    expect(spellCheckLanguages(['ja-JP', 'zh-Hans-CN'], available)).toEqual([])
    expect(spellCheckLanguages(['de-AT', 'de-CH', 'EN-us'], available)).toEqual(['de', 'en-US'])
    expect(spellCheckLanguages(['', 'en-US'], available)).toEqual(['en-US'])
  })
})

describe('memory use', () => {
  it('gives each Google app the memory of its processes, and counts each process once', () => {
    const use = memoryUse(
      [
        { accountName: 'Work', googleApp: 'gmail', processIds: [10, 11] },
        { accountName: 'Work', googleApp: 'calendar', processIds: [11, 12] },
        { accountName: 'home@example.com', googleApp: 'gmail', processIds: null },
        { accountName: 'home@example.com', googleApp: 'calendar', processIds: [13] }
      ],
      [
        { pid: 1, kilobytes: 100_000 },
        { pid: 10, kilobytes: 300_000 },
        { pid: 11, kilobytes: 50_000 },
        { pid: 12, kilobytes: 200_000 },
        { pid: 13, kilobytes: 250_000 }
      ]
    )
    expect(use.rows).toEqual([
      { accountName: 'Work', googleApp: 'gmail', kilobytes: 350_000 },
      { accountName: 'Work', googleApp: 'calendar', kilobytes: 200_000 },
      { accountName: 'home@example.com', googleApp: 'gmail', kilobytes: null },
      { accountName: 'home@example.com', googleApp: 'calendar', kilobytes: 250_000 }
    ])
    expect(use.totalKilobytes).toBe(900_000)
    expect(use.otherKilobytes).toBe(100_000)
  })
})

describe('the remote debugging port', () => {
  it('removes every switch that opens it', () => {
    const switches = new Set(['remote-debugging-port', 'remote-debugging-pipe', 'lang'])
    const removed = removeRemoteDebuggingSwitches({
      hasSwitch: (name) => switches.has(name),
      removeSwitch: (name) => {
        switches.delete(name)
      }
    })
    expect(removed).toEqual(['remote-debugging-port', 'remote-debugging-pipe'])
    expect([...switches]).toEqual(['lang'])
  })
})

describe('the accessible name of an account in the sidebar', () => {
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
      ...change
    }
  }

  it('has the account name and the unread count', () => {
    expect(sidebarAccountLabel(account({ unreadCount: 3 }))).toBe('work@company.com, 3 unread')
    expect(sidebarAccountLabel(account({ unreadCount: 120, nickname: 'Work' }))).toBe(
      'Work, work@company.com, 120 unread'
    )
    expect(sidebarAccountLabel(account({ unreadCount: 0 }))).toBe('work@company.com')
    expect(sidebarAccountLabel(account({}))).toBe('work@company.com')
    expect(sidebarAccountLabel(account({ unreadCount: 3, unreadWarning: 'Offline' }))).toBe(
      'work@company.com, unread count not available: Offline'
    )
  })
})
