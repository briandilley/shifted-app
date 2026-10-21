/**
 * "Background loading": which Google apps stay loaded, and the timers that put the other
 * Google apps to sleep. See "Background loading" in `docs/spec/PRODUCT.md`.
 *
 * A Google app that must not stay loaded sleeps 5 minutes after you leave it: Shifted
 * closes its view and destroys its web contents, and keeps the session. If you come back
 * before the timer ends, the timer stops. If you open a Google app that is asleep, Shifted
 * makes its view again and loads it. The feed polling does not depend on this.
 *
 * This module needs no Electron, so that unit tests can check the rules.
 */
import { GOOGLE_APPS, type BackgroundLoading, type GoogleApp } from '../shared/api'

/** The time from leaving a Google app to its sleep. */
export const SLEEP_DELAY_MS = 5 * 60_000

/** One Google app of one account. */
export interface AccountGoogleApp {
  accountId: string
  googleApp: GoogleApp
}

/** The key of one Google app of one account, for sets and maps. */
export function googleAppKey(app: AccountGoogleApp): string {
  return `${app.accountId}/${app.googleApp}`
}

/**
 * The Google apps that must stay loaded.
 *
 * @param accountIds The accounts whose Google apps can load: the signed-in accounts.
 * @param selectedAccountId The selected account, or `null`.
 */
export function googleAppsToKeepLoaded(
  value: BackgroundLoading,
  accountIds: readonly string[],
  selectedAccountId: string | null
): AccountGoogleApp[] {
  const keep: AccountGoogleApp[] = []
  for (const accountId of accountIds) {
    for (const googleApp of GOOGLE_APPS) {
      const selected = accountId === selectedAccountId
      const stays =
        value === 'everything' ||
        selected ||
        (value === 'calendars-only' && googleApp === 'calendar')
      if (stays) keep.push({ accountId, googleApp })
    }
  }
  return keep
}

export interface SleepTimerOptions {
  /** The time from leaving a Google app to its sleep. */
  delayMs?: number
  /**
   * Put the Google app to sleep. Returns false if it cannot sleep now, for example while
   * it has a child window open. Then a new timer starts.
   */
  sleep(app: AccountGoogleApp): boolean
}

/** The sleep timers of the Google apps that do not stay loaded. */
export class SleepTimers {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly delayMs: number

  constructor(private readonly options: SleepTimerOptions) {
    this.delayMs = options.delayMs ?? SLEEP_DELAY_MS
  }

  /**
   * Start a timer for each loaded Google app that must not stay loaded and has no timer
   * yet. Stop the timer of each Google app that must stay loaded or is not loaded.
   *
   * @param keep The Google apps that must stay loaded.
   * @param loaded The Google apps that are loaded now.
   */
  sync(keep: readonly AccountGoogleApp[], loaded: readonly AccountGoogleApp[]): void {
    const keepKeys = new Set(keep.map(googleAppKey))
    const loadedApps = new Map(loaded.map((app) => [googleAppKey(app), app]))
    for (const key of [...this.timers.keys()]) {
      if (keepKeys.has(key) || !loadedApps.has(key)) this.stop(key)
    }
    for (const [key, app] of loadedApps) {
      if (!keepKeys.has(key) && !this.timers.has(key)) this.start(key, app)
    }
  }

  /** True when the Google app has a running timer. For tests. */
  isWaiting(app: AccountGoogleApp): boolean {
    return this.timers.has(googleAppKey(app))
  }

  /** Stop every timer. */
  stopAll(): void {
    for (const key of [...this.timers.keys()]) this.stop(key)
  }

  private start(key: string, app: AccountGoogleApp): void {
    const timer = setTimeout(() => {
      this.timers.delete(key)
      if (!this.options.sleep(app)) this.start(key, app)
    }, this.delayMs)
    this.timers.set(key, timer)
  }

  private stop(key: string): void {
    const timer = this.timers.get(key)
    if (timer) clearTimeout(timer)
    this.timers.delete(key)
  }
}
