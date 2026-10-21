/**
 * The desktop notifications of new mail, Calendar reminders, and Chat messages. See
 * "Notifications" in `docs/spec/PRODUCT.md`.
 *
 * Each notification goes through `shouldNotify` first: the switches of the account,
 * snooze, and quiet hours. A notification that the rules stop is dropped. Shifted uses
 * the notification system and the notification sound of the operating system. It adds no
 * sound of its own.
 *
 * In test mode, Shifted shows no notification. It records each one in the test records,
 * where an end-to-end test can read it and click it.
 */
import { nativeImage, Notification, type NativeImage } from 'electron'
import type { NotificationKind, Snooze } from '../shared/api'
import { shouldNotify, type NotificationAccount } from './notification-rules'
import { testRecords } from './test-hooks'

/** One notification that Shifted wants to show. */
export interface NotificationRequest {
  accountId: string
  kind: NotificationKind
  title: string
  body: string
  icon?: NativeImage | undefined
  /**
   * A notification with the same key replaces the one that shows, like the `tag` of a
   * web notification.
   */
  replaceKey?: string | undefined
  /** The key that `close` uses. */
  closeKey?: string | undefined
  /** Called when the person clicks the notification. */
  onClick(): void
  /** Called when the notification closes without a click. */
  onClose?(): void
}

export interface NotifierDeps {
  /** The switches and the quiet hours of the account, or `undefined` if it was removed. */
  account(accountId: string): NotificationAccount | undefined
  /** The snooze that runs now, or `null`. */
  snooze(): Snooze | null
  /** The time now. Tests replace it. */
  now?(): Date
}

/** An image for the `icon` of a notification from a `data:` URL, or `undefined`. */
export function iconFromDataUrl(dataUrl: string | null | undefined): NativeImage | undefined {
  if (!dataUrl) return undefined
  const image = nativeImage.createFromDataURL(dataUrl)
  return image.isEmpty() ? undefined : image
}

export class Notifier {
  /** Keep each notification until it closes, so that its click still works. */
  private readonly shown = new Set<Notification>()
  private readonly byReplaceKey = new Map<string, Notification>()
  private readonly byCloseKey = new Map<string, Notification>()

  constructor(private readonly deps: NotifierDeps) {}

  /**
   * Show a notification if the rules allow it.
   *
   * @returns True when the notification showed (or, in test mode, was recorded).
   */
  notify(request: NotificationRequest): boolean {
    const account = this.deps.account(request.accountId)
    const now = this.deps.now?.() ?? new Date()
    if (!account || !shouldNotify(request.kind, account, now, { snooze: this.deps.snooze() })) {
      return false
    }

    const records = testRecords()
    if (records) {
      records.notifications.push({
        accountId: request.accountId,
        kind: request.kind,
        title: request.title,
        body: request.body,
        click: () => request.onClick()
      })
      return true
    }

    if (!Notification.isSupported()) return false
    if (request.replaceKey) this.byReplaceKey.get(request.replaceKey)?.close()
    // No `sound` and no `silent`: the operating system plays its own notification sound.
    const notification = new Notification({
      title: request.title,
      body: request.body,
      ...(request.icon ? { icon: request.icon } : {})
    })
    this.shown.add(notification)
    if (request.replaceKey) this.byReplaceKey.set(request.replaceKey, notification)
    if (request.closeKey) this.byCloseKey.set(request.closeKey, notification)
    let clicked = false
    const forget = (): void => {
      this.shown.delete(notification)
      if (request.replaceKey && this.byReplaceKey.get(request.replaceKey) === notification) {
        this.byReplaceKey.delete(request.replaceKey)
      }
      if (request.closeKey && this.byCloseKey.get(request.closeKey) === notification) {
        this.byCloseKey.delete(request.closeKey)
      }
    }
    notification.on('click', () => {
      clicked = true
      forget()
      request.onClick()
    })
    notification.on('close', () => {
      forget()
      if (!clicked) request.onClose?.()
    })
    notification.show()
    return true
  }

  /** Close the notification with this close key, if it still shows. */
  close(closeKey: string): void {
    this.byCloseKey.get(closeKey)?.close()
  }
}
