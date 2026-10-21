/**
 * The web notifications of the Gmail and Calendar pages: Calendar reminders and Chat
 * messages. The preload script `src/preload/google-page.ts` sends them here.
 *
 * A notification from a Calendar view is a Calendar reminder. A notification from a Gmail
 * view, or from a child window (a Gmail pop-out), is a Chat message. A click brings the
 * main window to the front, selects the account and the tab that sent the notification,
 * and then calls the `onclick` of the page.
 */
import { ipcMain, type IpcMainEvent, type WebFrameMain } from 'electron'
import type { GoogleApp } from '../shared/api'
import {
  isDataImageUrl,
  isPageNotificationId,
  PageNotificationChannel,
  parsePageNotification,
  type PageNotificationEvent
} from '../shared/page-notifications'
import type { ShownGoogleApp } from './account-views'
import { iconFromDataUrl, type Notifier } from './notifications'

export interface PageNotificationDeps {
  notifier: Notifier
  /** The account and the Google app of a Google page, or `undefined` for another sender. */
  source(contents: Electron.WebContents): ShownGoogleApp | undefined
  /** Bring the main window to the front, and select the account and the Google app. */
  showGoogleApp(accountId: string, googleApp: GoogleApp): void
  /** The saved profile photo of the account as a `data:` URL, or `null`. */
  accountPhoto(accountId: string): string | null
}

/** A key for one notification of one frame. */
function frameKey(frame: WebFrameMain, id: number): string {
  return `${frame.processId}:${frame.routingId}:${id}`
}

/** Send an event of a notification back to the frame that made it. */
function sendToFrame(frame: WebFrameMain, id: number, type: PageNotificationEvent): void {
  try {
    if (!frame.detached) frame.send(PageNotificationChannel.event, id, type)
  } catch {
    // The frame went away. Nothing to do.
  }
}

/** Listen to the web notifications of the Google pages. */
export function registerPageNotifications(deps: PageNotificationDeps): void {
  ipcMain.on(PageNotificationChannel.show, (event: IpcMainEvent, value: unknown) => {
    const source = deps.source(event.sender)
    const frame = event.senderFrame
    const details = parsePageNotification(value)
    if (!source || !frame || !details) return
    const { accountId, googleApp } = source
    const icon = isDataImageUrl(details.icon)
      ? iconFromDataUrl(details.icon)
      : iconFromDataUrl(deps.accountPhoto(accountId))
    deps.notifier.notify({
      accountId,
      kind: googleApp === 'calendar' ? 'calendar' : 'chat',
      title: details.title,
      body: details.body,
      icon,
      replaceKey: details.tag ? `${event.sender.id}:${details.tag}` : undefined,
      closeKey: frameKey(frame, details.id),
      onClick: () => {
        deps.showGoogleApp(accountId, googleApp)
        if (details.source === 'notification') sendToFrame(frame, details.id, 'click')
      },
      onClose: () => {
        if (details.source === 'notification') sendToFrame(frame, details.id, 'close')
      }
    })
  })

  ipcMain.on(PageNotificationChannel.close, (event: IpcMainEvent, id: unknown) => {
    const frame = event.senderFrame
    if (!frame || !isPageNotificationId(id) || !deps.source(event.sender)) return
    deps.notifier.close(frameKey(frame, id))
  })
}
