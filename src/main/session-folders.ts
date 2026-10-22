/**
 * The folders of removed sessions that Shifted could not delete yet.
 *
 * When you remove an account, Shifted deletes the folder of its session from disk. On
 * Windows, Chromium keeps some files of the session open (for example the cookies) while
 * Shifted runs, and Windows does not delete an open file. Then Shifted writes the folder
 * to `sessions-to-delete.json` in its user data folder and deletes it at the next start,
 * before any session opens. See "CI on three platforms" in `docs/decisions.md`.
 *
 * This module does not need Electron, so that unit tests can check it.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'

export const SESSIONS_TO_DELETE_FILE_NAME = 'sessions-to-delete.json'

/** The folder in the user data folder where Electron keeps the persistent sessions. */
const SESSIONS_FOLDER_NAME = 'Partitions'

/**
 * True when a delete failed because a file is open in another place (Windows): `EBUSY` or
 * `EPERM` for the open file, or `ENOTEMPTY` for a folder that still holds one.
 */
export function isFileInUse(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY'
}

/**
 * True when the folder is inside the sessions folder of this user data folder. Shifted
 * deletes nothing else, also if `sessions-to-delete.json` was changed by hand.
 */
function isSessionFolder(userData: string, folder: string): boolean {
  if (!isAbsolute(folder)) return false
  const inside = relative(join(userData, SESSIONS_FOLDER_NAME), folder)
  return inside.length > 0 && !inside.startsWith('..') && !isAbsolute(inside)
}

/** The folders in `sessions-to-delete.json`, or none if the file is missing or broken. */
export function sessionFoldersToDelete(userData: string): string[] {
  try {
    const value: unknown = JSON.parse(
      readFileSync(join(userData, SESSIONS_TO_DELETE_FILE_NAME), 'utf8')
    )
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

/** Write the list, or delete the file when the list is empty. */
function writeSessionFoldersToDelete(userData: string, folders: readonly string[]): void {
  const path = join(userData, SESSIONS_TO_DELETE_FILE_NAME)
  if (folders.length === 0) {
    rmSync(path, { force: true })
    return
  }
  mkdirSync(userData, { recursive: true })
  const temporaryPath = `${path}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(folders, null, 2)}\n`, 'utf8')
  renameSync(temporaryPath, path)
}

/** Remember the folder of a removed session, so that the next start deletes it. */
export function deleteSessionFolderAtNextStart(userData: string, folder: string): void {
  if (!isSessionFolder(userData, folder)) return
  const folders = sessionFoldersToDelete(userData)
  if (!folders.includes(folder)) writeSessionFoldersToDelete(userData, [...folders, folder])
}

/**
 * Delete the folders of removed sessions that Shifted could not delete before. Call this
 * at startup, before any session opens. A folder that still cannot be deleted stays in
 * the list for the next start.
 */
export function deleteLeftoverSessionFolders(userData: string): void {
  const folders = sessionFoldersToDelete(userData)
  if (folders.length === 0) return
  const left: string[] = []
  for (const folder of folders) {
    if (!isSessionFolder(userData, folder)) continue
    try {
      rmSync(folder, { recursive: true, force: true })
    } catch (error) {
      console.error('Shifted could not delete the folder of a removed session:', error)
      left.push(folder)
    }
  }
  try {
    writeSessionFoldersToDelete(userData, left)
  } catch (error) {
    console.error(`Shifted could not write ${SESSIONS_TO_DELETE_FILE_NAME}:`, error)
  }
}
