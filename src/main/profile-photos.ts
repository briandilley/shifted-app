/**
 * The saved profile photos of the accounts: `photos/<id>.png` in the user data folder.
 *
 * Shifted reads the photo URL from the Gmail page (see `gmail-page.ts`), downloads the
 * image with the session of the account, and saves a small PNG copy. The sidebar shows
 * the copy, also when Gmail of the account is not loaded.
 */
import { nativeImage, type Session } from 'electron'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isBlankBitmap } from './photo-pixels'

/** The width and height of a saved photo, in pixels. The sidebar shows it at 36 points. */
export const PHOTO_SIZE = 96

/** Shifted does not download a photo larger than this. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export class ProfilePhotos {
  /** The photo of each account as a `data:` URL, or `null` when there is no photo. */
  private readonly cache = new Map<string, string | null>()

  /** @param dir The folder of the photos, `photos` in the user data folder. */
  constructor(private readonly dir: string) {}

  /** The file of the photo of an account. The account id is a UUID. */
  path(accountId: string): string {
    return join(this.dir, `${accountId}.png`)
  }

  /** The saved photo of the account as a `data:` URL, or `null` if there is none. */
  dataUrl(accountId: string): string | null {
    const cached = this.cache.get(accountId)
    if (cached !== undefined) return cached
    let dataUrl: string | null
    try {
      dataUrl = `data:image/png;base64,${readFileSync(this.path(accountId)).toString('base64')}`
    } catch {
      dataUrl = null
    }
    this.cache.set(accountId, dataUrl)
    return dataUrl
  }

  /**
   * Download the photo with the session of the account, and save it as a PNG.
   *
   * @returns True when Shifted saved a new photo.
   */
  async download(accountId: string, accountSession: Session, url: string): Promise<boolean> {
    const response = await accountSession.fetch(url, {
      credentials: 'include',
      // nativeImage reads PNG and JPEG on every operating system.
      headers: { Accept: 'image/png,image/jpeg;q=0.9' }
    })
    if (!response.ok) return false
    const length = Number(response.headers.get('content-length') ?? '0')
    if (length > MAX_PHOTO_BYTES) return false
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return false

    const image = nativeImage.createFromBuffer(bytes)
    if (image.isEmpty()) return false
    const resized = image.resize({ width: PHOTO_SIZE, height: PHOTO_SIZE, quality: 'best' })
    // A photo that shows nothing would leave an empty ring. The avatar shows the letter.
    if (isBlankBitmap(resized.toBitmap())) return false
    const png = resized.toPNG()

    mkdirSync(this.dir, { recursive: true })
    const temporaryPath = `${this.path(accountId)}.tmp`
    writeFileSync(temporaryPath, png)
    renameSync(temporaryPath, this.path(accountId))
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`
    if (this.cache.get(accountId) === dataUrl) return false
    this.cache.set(accountId, dataUrl)
    return true
  }

  /** Delete the saved photo of an account. */
  delete(accountId: string): void {
    this.cache.delete(accountId)
    rmSync(this.path(accountId), { force: true })
  }
}
