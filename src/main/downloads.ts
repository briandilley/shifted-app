/**
 * Downloads, for example Gmail attachments. See "Downloads" in `docs/spec/PRODUCT.md`.
 *
 * Shifted saves each download in the Downloads folder of the operating system, with a
 * name that is not taken yet. With "Ask where to save each file" on, it shows a save
 * dialog. When a download finishes, Shifted shows a notification. A click on the
 * notification shows the file in the file manager.
 */
import { app, Notification, type DownloadItem } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { uniqueFileName } from './download-names'
import { showInFolder } from './external'
import { testRecords } from './test-hooks'

export class Downloads {
  /** The paths of the downloads that run now. Two downloads never get the same path. */
  private readonly reserved = new Set<string>()
  /** Keep each notification until it closes, so that its click still works. */
  private readonly notifications = new Set<Notification>()

  /** @param askWhereToSave Returns the value of "Ask where to save each file". */
  constructor(private readonly askWhereToSave: () => boolean) {}

  /** Handle the `will-download` event of the session of an account. */
  handle(item: DownloadItem): void {
    const folder = app.getPath('downloads')
    const name = uniqueFileName(item.getFilename(), (candidate) => {
      const path = join(folder, candidate)
      return this.reserved.has(path) || existsSync(path)
    })
    const path = join(folder, name)

    if (this.askWhereToSave()) {
      // With no save path, Electron shows a save dialog with these options.
      item.setSaveDialogOptions({ defaultPath: path })
    } else {
      mkdirSync(folder, { recursive: true })
      item.setSavePath(path)
      this.reserved.add(path)
    }

    item.once('done', (_event, state) => {
      this.reserved.delete(path)
      if (state === 'completed') this.notify(item.getSavePath())
    })
  }

  private notify(path: string): void {
    if (!path || !Notification.isSupported()) return
    const notification = new Notification({
      title: 'Download finished',
      body: `${basename(path)} is in ${basename(join(path, '..'))}. Click to show it.`
    })
    this.notifications.add(notification)
    const forget = (): void => {
      this.notifications.delete(notification)
    }
    notification.on('click', () => {
      forget()
      showInFolder(path)
    })
    notification.on('close', forget)
    testRecords()?.downloadNotifications.push(notification)
    notification.show()
  }
}
