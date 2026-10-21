import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultNotificationSwitches,
  defaultQuietHours,
  unreadBadgeText,
  type AccountState
} from '../../src/shared/api'
import { BADGE_IMAGE_SIZE, drawBadgeBitmap, drawTrayIconBitmap } from '../../src/main/badge-image'
import {
  appBadgeTotal,
  chooseAutomaticFeed,
  feedToRead,
  MAX_JITTER_MS,
  nextReadDelayMs,
  randomJitterMs
} from '../../src/main/unread-counts'
import { UnreadPoller, type ReadOutcome } from '../../src/main/unread-poller'

describe('chooseAutomaticFeed', () => {
  it('picks Primary when only the Primary count equals the number of Gmail', () => {
    // An inbox with category tabs: Gmail counts only the Primary tab.
    expect(chooseAutomaticFeed(2, 3418, 2)).toBe('primary')
  })

  it('picks Whole inbox when only the whole-inbox count equals the number of Gmail', () => {
    // An inbox with no category tabs.
    expect(chooseAutomaticFeed(5, 5, 1)).toBe('whole-inbox')
  })

  it('waits when both counts match', () => {
    expect(chooseAutomaticFeed(0, 0, 0)).toBeUndefined()
    expect(chooseAutomaticFeed(4, 4, 4)).toBeUndefined()
  })

  it('waits when neither count matches', () => {
    expect(chooseAutomaticFeed(7, 12, 3)).toBeUndefined()
  })
})

describe('feedToRead', () => {
  it('reads the chosen feed of an override', () => {
    expect(feedToRead('primary', 'whole-inbox')).toBe('primary')
    expect(feedToRead('whole-inbox', null)).toBe('whole-inbox')
    expect(feedToRead('important', 'primary')).toBe('important')
  })

  it('reads the saved automatic choice, and Primary until a choice is saved', () => {
    expect(feedToRead('automatic', 'whole-inbox')).toBe('whole-inbox')
    expect(feedToRead('automatic', 'primary')).toBe('primary')
    expect(feedToRead('automatic', null)).toBe('primary')
  })
})

describe('nextReadDelayMs', () => {
  it('reads about every 60 seconds while reads work', () => {
    expect(nextReadDelayMs(0)).toBe(60_000)
  })

  it('waits 60 seconds, then 2 minutes, then 5 minutes at most after errors', () => {
    expect(nextReadDelayMs(1)).toBe(60_000)
    expect(nextReadDelayMs(2)).toBe(120_000)
    expect(nextReadDelayMs(3)).toBe(300_000)
    expect(nextReadDelayMs(4)).toBe(300_000)
    expect(nextReadDelayMs(50)).toBe(300_000)
  })

  it('adds a small random delay', () => {
    expect(randomJitterMs(() => 0)).toBe(0)
    expect(randomJitterMs(() => 0.5)).toBe(MAX_JITTER_MS / 2)
    expect(randomJitterMs(() => 0.999999)).toBeLessThan(MAX_JITTER_MS)
  })
})

describe('UnreadPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** A poller with no random delay whose reads give the next outcome of the list. */
  function poller(outcomes: ReadOutcome[]): { poller: UnreadPoller; reads: number[] } {
    const reads: number[] = []
    const read = (): Promise<ReadOutcome> => {
      reads.push(Date.now())
      return Promise.resolve(outcomes.shift() ?? 'ok')
    }
    return { poller: new UnreadPoller(read, { random: () => 0 }), reads }
  }

  it('grows the error delay from 60 seconds to 5 minutes, and resets it after a success', async () => {
    const { poller: unread, reads } = poller(['error', 'error', 'error', 'error', 'ok', 'ok'])
    vi.setSystemTime(0)
    unread.sync(['a'])
    await vi.advanceTimersByTimeAsync(0) // first read at once (no random delay)
    expect(reads).toEqual([0])
    expect(unread.failures('a')).toBe(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(reads).toEqual([0, 60_000])
    expect(unread.failures('a')).toBe(2)

    await vi.advanceTimersByTimeAsync(120_000)
    expect(reads).toEqual([0, 60_000, 180_000])
    expect(unread.failures('a')).toBe(3)

    await vi.advanceTimersByTimeAsync(300_000)
    expect(reads).toEqual([0, 60_000, 180_000, 480_000])
    expect(unread.failures('a')).toBe(4)

    await vi.advanceTimersByTimeAsync(300_000)
    expect(reads).toHaveLength(5)
    expect(unread.failures('a')).toBe(0)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(reads).toEqual([0, 60_000, 180_000, 480_000, 780_000, 840_000])
    unread.stopAll()
  })

  it('reads at once on readNow and starts the 60 seconds again', async () => {
    const { poller: unread, reads } = poller([])
    vi.setSystemTime(0)
    unread.sync(['a'])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(30_000)
    unread.readNow('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(reads).toEqual([0, 30_000])
    await vi.advanceTimersByTimeAsync(59_000)
    expect(reads).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(reads).toEqual([0, 30_000, 90_000])
    unread.stopAll()
  })

  it('does not count a skipped read as an error, and stops a removed account', async () => {
    const { poller: unread, reads } = poller(['skipped'])
    unread.sync(['a', 'b'])
    await vi.advanceTimersByTimeAsync(0)
    expect(unread.failures('a')).toBe(0)
    unread.sync(['b'])
    expect(unread.failures('a')).toBeUndefined()
    const before = reads.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(reads.length - before).toBe(1) // only account b
    unread.stopAll()
  })
})

describe('the badges', () => {
  function account(unreadCount: number | null, unreadWarning: string | null = null): AccountState {
    return {
      id: 'id',
      email: 'a@b.com',
      nickname: '',
      color: '#1A73E8',
      status: 'signed-in',
      lastGoogleApp: 'gmail',
      photo: null,
      pagePermissions: {},
      unreadCount,
      unreadWarning,
      notifications: defaultNotificationSwitches(),
      quietHours: defaultQuietHours(),
      unreadCountSource: 'automatic',
      unreadFeed: 'primary',
      automaticFeedLearned: false,
      pageProblems: {}
    }
  }

  it('shows nothing for 0, the number, or 99+ for more than 99', () => {
    expect(unreadBadgeText(0)).toBe('')
    expect(unreadBadgeText(1)).toBe('1')
    expect(unreadBadgeText(99)).toBe('99')
    expect(unreadBadgeText(100)).toBe('99+')
  })

  it('sums the unread counts, and an account with a warning mark adds nothing', () => {
    expect(appBadgeTotal([])).toBe(0)
    expect(appBadgeTotal([account(3), account(null), account(140)])).toBe(143)
    expect(appBadgeTotal([account(3), account(8, 'Offline')])).toBe(3)
  })

  it('draws the Windows overlay: a red circle with white digits and clear corners', () => {
    const { width, height, pixels } = drawBadgeBitmap('7')
    expect([width, height]).toEqual([BADGE_IMAGE_SIZE, BADGE_IMAGE_SIZE])
    expect(pixels).toHaveLength(BADGE_IMAGE_SIZE * BADGE_IMAGE_SIZE * 4)
    const pixel = (x: number, y: number): number[] => {
      const offset = (y * width + x) * 4
      return [...pixels.subarray(offset, offset + 4)]
    }
    expect(pixel(0, 0)).toEqual([0, 0, 0, 0])
    expect(pixel(3, 16)).toEqual([0x25, 0x30, 0xd9, 255])
    // The top row of "7" is white, in the middle of the circle.
    expect(pixel(16, 9)).toEqual([255, 255, 255, 255])
    const white = (bitmap: Buffer): number =>
      bitmap.reduce(
        (count, value, index) => (index % 4 === 0 && value === 255 ? count + 1 : count),
        0
      )
    expect(white(drawBadgeBitmap('99+').pixels)).toBeGreaterThan(white(pixels))
  })

  it('draws the tray icon: the app icon with the badge on its bottom-right corner', () => {
    // A plain blue icon stands for the app icon.
    const size = 32
    const icon = Buffer.alloc(size * size * 4)
    for (let offset = 0; offset < icon.length; offset += 4) icon.set([0xff, 0, 0, 0xff], offset)
    const base = { width: size, height: size, pixels: icon }
    const pixel = (pixels: Buffer, x: number, y: number): number[] => {
      const offset = (y * size + x) * 4
      return [...pixels.subarray(offset, offset + 4)]
    }

    // No unread messages: the icon stays as it is.
    expect(drawTrayIconBitmap(base, '').pixels.equals(icon)).toBe(true)

    const withBadge = drawTrayIconBitmap(base, '7').pixels
    // The top-left corner keeps the icon. The edge of the badge circle is red.
    expect(pixel(withBadge, 1, 1)).toEqual([0xff, 0, 0, 0xff])
    expect(pixel(withBadge, 9, 20)).toEqual([0x25, 0x30, 0xd9, 255])
    // The source icon does not change.
    expect(pixel(icon, 9, 20)).toEqual([0xff, 0, 0, 0xff])
  })
})
