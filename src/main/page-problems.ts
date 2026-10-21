/**
 * The rules for a Google page that stopped. See "Failure states" in `docs/spec/PRODUCT.md`.
 *
 * - A page that crashed reloads on its own. If the same Google app crashes 3 times in 5
 *   minutes, Shifted stops reloading it on its own and waits for the "Reload" button.
 * - A page with a certificate error is blocked. Shifted never skips a certificate error.
 *
 * This module needs no Electron, so that unit tests can use it.
 */

/** After this many crashes in `CRASH_PERIOD_MS`, Shifted waits for the "Reload" button. */
export const CRASH_LIMIT = 3

/** The period in which `CRASH_LIMIT` crashes stop the reloads on their own: 5 minutes. */
export const CRASH_PERIOD_MS = 5 * 60 * 1000

/** What Shifted does after a crash: reload the page on its own, or wait for the button. */
export type CrashDecision = 'reload' | 'wait'

/** Counts the crashes of each page, for example of one Google app of one account. */
export class CrashCounter {
  private readonly crashes = new Map<string, number[]>()

  constructor(
    private readonly limit = CRASH_LIMIT,
    private readonly periodMs = CRASH_PERIOD_MS
  ) {}

  /**
   * Count one crash of the page with this key.
   *
   * @returns `wait` when this is crash number `limit` or more in the period, else `reload`.
   */
  record(key: string, now: number = Date.now()): CrashDecision {
    const recent = (this.crashes.get(key) ?? []).filter((time) => now - time < this.periodMs)
    recent.push(now)
    this.crashes.set(key, recent)
    return recent.length >= this.limit ? 'wait' : 'reload'
  }

  /** Forget the crashes of the page with this key, for example when its account goes away. */
  forget(key: string): void {
    this.crashes.delete(key)
  }
}

/**
 * True when the reason of `render-process-gone` means that the page stopped. A clean exit
 * (exit code 0) happens when Shifted closes the page itself.
 */
export function isCrash(reason: string): boolean {
  return reason !== 'clean-exit'
}

/**
 * True when a failed load (the error code of `did-fail-load`) is a certificate error.
 * Chromium gives the certificate errors the codes -200 to -299.
 */
export function isCertificateError(errorCode: number): boolean {
  return errorCode <= -200 && errorCode > -300
}

/**
 * True when a failed load did not reach the server, for example because the computer is
 * offline. Chromium gives the connection errors the codes -100 to -199, and -7 is a
 * timeout, -21 a change of the network, and -106 "internet disconnected".
 */
export function isConnectionError(errorCode: number): boolean {
  return errorCode === -7 || errorCode === -21 || (errorCode <= -100 && errorCode > -200)
}
