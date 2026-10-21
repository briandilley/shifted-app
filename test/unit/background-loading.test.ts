import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  googleAppKey,
  googleAppsToKeepLoaded,
  SLEEP_DELAY_MS,
  SleepTimers,
  type AccountGoogleApp
} from '../../src/main/background-loading'

const ACCOUNTS = ['a', 'b', 'c']

function keys(apps: readonly AccountGoogleApp[]): string[] {
  return apps.map(googleAppKey).sort()
}

describe('the Google apps that stay loaded', () => {
  it('Everything: Gmail and Calendar of every account', () => {
    expect(keys(googleAppsToKeepLoaded('everything', ACCOUNTS, 'b'))).toEqual([
      'a/calendar',
      'a/gmail',
      'b/calendar',
      'b/gmail',
      'c/calendar',
      'c/gmail'
    ])
  })

  it('Calendars only: Calendar of every account, and both apps of the selected account', () => {
    expect(keys(googleAppsToKeepLoaded('calendars-only', ACCOUNTS, 'b'))).toEqual([
      'a/calendar',
      'b/calendar',
      'b/gmail',
      'c/calendar'
    ])
  })

  it('Selected account only: both apps of the selected account', () => {
    expect(keys(googleAppsToKeepLoaded('selected-account-only', ACCOUNTS, 'b'))).toEqual([
      'b/calendar',
      'b/gmail'
    ])
  })

  it('keeps nothing of an account that cannot load, and nothing with no selection', () => {
    expect(keys(googleAppsToKeepLoaded('selected-account-only', ['a', 'c'], 'b'))).toEqual([])
    expect(keys(googleAppsToKeepLoaded('calendars-only', ACCOUNTS, null))).toEqual([
      'a/calendar',
      'b/calendar',
      'c/calendar'
    ])
  })
})

describe('the sleep timers', () => {
  const gmailA = { accountId: 'a', googleApp: 'gmail' } as const
  const gmailB = { accountId: 'b', googleApp: 'gmail' } as const

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('puts a Google app to sleep 5 minutes after you leave it', () => {
    const sleep = vi.fn(() => true)
    const timers = new SleepTimers({ sleep })
    timers.sync([gmailB], [gmailA, gmailB])
    expect(timers.isWaiting(gmailA)).toBe(true)
    expect(timers.isWaiting(gmailB)).toBe(false)
    vi.advanceTimersByTime(SLEEP_DELAY_MS - 1)
    expect(sleep).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(sleep).toHaveBeenCalledExactlyOnceWith(gmailA)
    expect(timers.isWaiting(gmailA)).toBe(false)
  })

  it('stops the timer when you come back before it ends', () => {
    const sleep = vi.fn(() => true)
    const timers = new SleepTimers({ sleep, delayMs: 1000 })
    timers.sync([gmailB], [gmailA, gmailB])
    vi.advanceTimersByTime(500)
    timers.sync([gmailA], [gmailA, gmailB])
    expect(timers.isWaiting(gmailA)).toBe(false)
    vi.advanceTimersByTime(600)
    // Only B, which you left now, waits. A never sleeps.
    expect(sleep).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(sleep).toHaveBeenCalledExactlyOnceWith(gmailB)
  })

  it('does not restart a running timer, and stops the timer of a closed view', () => {
    const sleep = vi.fn(() => true)
    const timers = new SleepTimers({ sleep, delayMs: 1000 })
    timers.sync([], [gmailA])
    vi.advanceTimersByTime(700)
    timers.sync([], [gmailA])
    vi.advanceTimersByTime(300)
    expect(sleep).toHaveBeenCalledTimes(1)
    timers.sync([], [gmailB])
    timers.sync([], [])
    vi.advanceTimersByTime(2000)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('tries again later when the Google app cannot sleep now', () => {
    const sleep = vi.fn().mockReturnValueOnce(false).mockReturnValue(true)
    const timers = new SleepTimers({ sleep, delayMs: 1000 })
    timers.sync([], [gmailA])
    vi.advanceTimersByTime(1000)
    expect(timers.isWaiting(gmailA)).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(timers.isWaiting(gmailA)).toBe(false)
  })

  it('stops every timer', () => {
    const sleep = vi.fn(() => true)
    const timers = new SleepTimers({ sleep, delayMs: 1000 })
    timers.sync([], [gmailA, gmailB])
    timers.stopAll()
    vi.advanceTimersByTime(5000)
    expect(sleep).not.toHaveBeenCalled()
  })
})
