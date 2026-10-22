import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deleteLeftoverSessionFolders,
  deleteSessionFolderAtNextStart,
  isFileInUse,
  SESSIONS_TO_DELETE_FILE_NAME,
  sessionFoldersToDelete
} from '../../src/main/session-folders'

let userData = ''

/** Make the folder of a session with one file in it. */
function makeSessionFolder(name: string): string {
  const folder = join(userData, 'Partitions', name)
  mkdirSync(join(folder, 'Network'), { recursive: true })
  writeFileSync(join(folder, 'Network', 'Cookies'), 'cookies')
  return folder
}

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'shifted-session-folders-'))
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('the folders of removed sessions', () => {
  it('knows the errors of a file that is open in another place', () => {
    expect(isFileInUse(Object.assign(new Error('busy'), { code: 'EBUSY' }))).toBe(true)
    expect(isFileInUse(Object.assign(new Error('perm'), { code: 'EPERM' }))).toBe(true)
    expect(isFileInUse(Object.assign(new Error('full'), { code: 'ENOTEMPTY' }))).toBe(true)
    expect(isFileInUse(Object.assign(new Error('gone'), { code: 'ENOENT' }))).toBe(false)
    expect(isFileInUse(null)).toBe(false)
  })

  it('remembers a folder once, and the next start deletes it and the list', () => {
    const folder = makeSessionFolder('account-1')
    deleteSessionFolderAtNextStart(userData, folder)
    deleteSessionFolderAtNextStart(userData, folder)
    expect(sessionFoldersToDelete(userData)).toEqual([folder])

    deleteLeftoverSessionFolders(userData)
    expect(existsSync(folder)).toBe(false)
    expect(existsSync(join(userData, SESSIONS_TO_DELETE_FILE_NAME))).toBe(false)
  })

  it('deletes only folders inside the sessions folder of the user data folder', () => {
    const outside = mkdtempSync(join(tmpdir(), 'shifted-outside-'))
    try {
      deleteSessionFolderAtNextStart(userData, outside)
      deleteSessionFolderAtNextStart(userData, join(userData, 'Partitions'))
      expect(sessionFoldersToDelete(userData)).toEqual([])

      // A list that was changed by hand.
      writeFileSync(
        join(userData, SESSIONS_TO_DELETE_FILE_NAME),
        JSON.stringify([outside, join(userData, 'Partitions', '..', 'config.json')])
      )
      deleteLeftoverSessionFolders(userData)
      expect(existsSync(outside)).toBe(true)
      expect(sessionFoldersToDelete(userData)).toEqual([])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('reads a missing or broken list as empty', () => {
    expect(sessionFoldersToDelete(userData)).toEqual([])
    writeFileSync(join(userData, SESSIONS_TO_DELETE_FILE_NAME), '{ not json')
    expect(sessionFoldersToDelete(userData)).toEqual([])
    deleteLeftoverSessionFolders(userData)
  })
})
