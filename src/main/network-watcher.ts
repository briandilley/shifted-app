/**
 * Watches whether the computer is online. When the network comes back, Shifted reads
 * every feed at once, so that the unread badges come back without a wait. See "Failure
 * states" in `docs/spec/PRODUCT.md`.
 *
 * The main process asks `net.isOnline()` every 2 seconds. This module needs no Electron:
 * the caller gives it the function that says whether the computer is online.
 */

/** How often Shifted asks whether the computer is online. */
export const NETWORK_CHECK_INTERVAL_MS = 2000

export class NetworkWatcher {
  private timer: ReturnType<typeof setInterval> | null = null
  private online: boolean

  /**
   * @param isOnline Says whether the computer is online now, for example `net.isOnline`.
   * @param onBackOnline Called once each time the computer goes from offline to online.
   */
  constructor(
    private readonly isOnline: () => boolean,
    private readonly onBackOnline: () => void,
    private readonly intervalMs = NETWORK_CHECK_INTERVAL_MS
  ) {
    this.online = isOnline()
  }

  /** Start to ask at each interval. */
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.check(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Ask now. Calls `onBackOnline` if the computer was offline and is online now. */
  check(): void {
    const online = this.isOnline()
    const back = online && !this.online
    this.online = online
    if (back) this.onBackOnline()
  }
}
