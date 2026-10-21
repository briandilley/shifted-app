/**
 * The web notifications of the Gmail and Calendar pages: the IPC channels and the values
 * that the preload script of the Google pages (`src/preload/google-page.ts`) and the main
 * process share.
 *
 * Only the preload script of the Google pages and the main process import this file, so
 * that the build gives each preload script one file with no shared parts. This file holds
 * no code that needs Node.js or Electron.
 */

export const PageNotificationChannel = {
  /** Page to main: a page made a notification. The value is a `PageNotificationDetails`. */
  show: 'shifted:page-notification-show',
  /** Page to main: the page closed a notification. The value is its `id`. */
  close: 'shifted:page-notification-close',
  /** Main to page: an event of a notification, `(id, type)`. See `PageNotificationEvent`. */
  event: 'shifted:page-notification-event'
} as const

/** The events that Shifted sends back to the page. */
export type PageNotificationEvent = 'click' | 'close'

/**
 * Where the page made the notification: `notification` for `new Notification(...)`, and
 * `service-worker` for `ServiceWorkerRegistration.showNotification(...)`.
 */
export type PageNotificationSource = 'notification' | 'service-worker'

/** What a page sends for one notification. */
export interface PageNotificationDetails {
  /** A number that the preload script gives to the notification, unique in its frame. */
  id: number
  title: string
  body: string
  tag: string
  icon: string
  source: PageNotificationSource
}

/** The longest texts that Shifted keeps. A longer text is cut. */
export const MAX_TITLE_LENGTH = 500
export const MAX_BODY_LENGTH = 2000
export const MAX_TAG_LENGTH = 500
/** An icon URL, or a `data:` URL, longer than this is dropped. */
export const MAX_ICON_LENGTH = 512 * 1024

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

/** True when the value is a valid notification id. */
export function isPageNotificationId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Check what a page sent for one notification. The page can send anything, so Shifted
 * checks each field and cuts long texts.
 *
 * @returns The details, or `undefined` if the value has no valid `id`.
 */
export function parsePageNotification(value: unknown): PageNotificationDetails | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (!isPageNotificationId(record['id'])) return undefined
  const icon = typeof record['icon'] === 'string' ? record['icon'] : ''
  return {
    id: record['id'],
    title: text(record['title'], MAX_TITLE_LENGTH),
    body: text(record['body'], MAX_BODY_LENGTH),
    tag: text(record['tag'], MAX_TAG_LENGTH),
    icon: icon.length <= MAX_ICON_LENGTH ? icon : '',
    source: record['source'] === 'service-worker' ? 'service-worker' : 'notification'
  }
}

/** True when the icon is a PNG or JPEG image in a `data:` URL, which needs no download. */
export function isDataImageUrl(icon: string): boolean {
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(icon)
}
