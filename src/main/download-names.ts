/**
 * The names of downloaded files. This module needs no Electron, so that unit tests can
 * use it.
 */
import { basename, extname } from 'node:path'

/** The name that Shifted uses when a download has no usable name. */
export const DEFAULT_DOWNLOAD_NAME = 'download'

/**
 * A file name that is not taken yet.
 *
 * If the name is taken, Shifted adds " (1)", " (2)", and so on before the extension:
 * `report.pdf` becomes `report (1).pdf`. A name with no extension, or a name that starts
 * with a dot, gets the number at the end: `README (1)`, `.env (1)`.
 *
 * @param name The name that the page suggests. Only its last part is used.
 * @param isTaken Returns true when a file with that name exists or is reserved.
 */
export function uniqueFileName(name: string, isTaken: (candidate: string) => boolean): string {
  const fileName = basename(name.replace(/\\/g, '/')).trim() || DEFAULT_DOWNLOAD_NAME
  if (!isTaken(fileName)) return fileName
  const extension = extname(fileName)
  const stem = fileName.slice(0, fileName.length - extension.length)
  for (let number = 1; ; number++) {
    const candidate = `${stem} (${number})${extension}`
    if (!isTaken(candidate)) return candidate
  }
}
