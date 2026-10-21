/**
 * The timers that read the feed of each account: about every 60 seconds, with a small
 * random delay for each account, and longer after an error (60 seconds, 2 minutes, then
 * 5 minutes at most). The poller reads the feed of every account, also of an account whose
 * Gmail is asleep or not loaded.
 *
 * This module needs no Electron. The caller gives it the function that reads one account.
 */
import { nextReadDelayMs, randomJitterMs } from './unread-counts'

/**
 * The result of one read.
 *
 * - `ok`: the read worked.
 * - `error`: the read failed. The next read waits longer.
 * - `skipped`: Shifted did not read, for example during the first sign-in of the account.
 */
export type ReadOutcome = 'ok' | 'error' | 'skipped'

export type ReadAccount = (accountId: string) => Promise<ReadOutcome>

interface PollState {
  timer: ReturnType<typeof setTimeout> | null
  /** The number of failed reads in a row. */
  failures: number
  running: boolean
  /** True when another read was asked for while one was running. */
  again: boolean
}

export interface UnreadPollerOptions {
  /** A number from 0 to 1, as `Math.random` gives. Tests replace it. */
  random?: () => number
}

export class UnreadPoller {
  private readonly accounts = new Map<string, PollState>()
  private readonly random: () => number

  constructor(
    private readonly read: ReadAccount,
    options: UnreadPollerOptions = {}
  ) {
    this.random = options.random ?? Math.random
  }

  /**
   * Poll exactly these accounts. A new account gets its first read after a small random
   * delay. An account that is no longer in the list stops.
   */
  sync(accountIds: readonly string[]): void {
    const wanted = new Set(accountIds)
    for (const accountId of [...this.accounts.keys()]) {
      if (!wanted.has(accountId)) this.stop(accountId)
    }
    for (const accountId of accountIds) {
      if (this.accounts.has(accountId)) continue
      const state: PollState = { timer: null, failures: 0, running: false, again: false }
      this.accounts.set(accountId, state)
      this.schedule(accountId, state, randomJitterMs(this.random))
    }
  }

  /** Read the feed of the account now, for example when you switch to it. */
  readNow(accountId: string): void {
    const state = this.accounts.get(accountId)
    if (!state) return
    if (state.running) {
      state.again = true
      return
    }
    void this.run(accountId, state)
  }

  /** The number of failed reads in a row of the account, for tests. */
  failures(accountId: string): number | undefined {
    return this.accounts.get(accountId)?.failures
  }

  /** Stop every timer. */
  stopAll(): void {
    for (const accountId of [...this.accounts.keys()]) this.stop(accountId)
  }

  private stop(accountId: string): void {
    const state = this.accounts.get(accountId)
    if (state?.timer) clearTimeout(state.timer)
    this.accounts.delete(accountId)
  }

  private schedule(accountId: string, state: PollState, delayMs: number): void {
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      state.timer = null
      void this.run(accountId, state)
    }, delayMs)
  }

  private async run(accountId: string, state: PollState): Promise<void> {
    if (state.timer) clearTimeout(state.timer)
    state.timer = null
    state.running = true
    state.again = false
    let outcome: ReadOutcome
    try {
      outcome = await this.read(accountId)
    } catch {
      outcome = 'error'
    }
    state.running = false
    // The account was removed during the read.
    if (this.accounts.get(accountId) !== state) return
    if (outcome === 'ok') state.failures = 0
    else if (outcome === 'error') state.failures += 1
    if (state.again) {
      void this.run(accountId, state)
      return
    }
    this.schedule(accountId, state, nextReadDelayMs(state.failures) + randomJitterMs(this.random))
  }
}
