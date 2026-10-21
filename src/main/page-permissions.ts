/**
 * The rules for page permissions. See "Page permissions" in `docs/spec/PRODUCT.md`.
 *
 * This module needs no Electron, so that unit tests can use it.
 */
import { isAskedPermission, type AskedPermission, type PagePermissions } from '../shared/api'

/**
 * What Shifted does with a permission request of a page.
 *
 * - `allow`: allow it with no dialog.
 * - `deny`: deny it with no dialog.
 * - `ask`: ask the person, then save the answer for the account.
 */
export type PermissionDecision = 'allow' | 'deny' | 'ask'

/**
 * Decide a permission request of a page of an account.
 *
 * - `notifications` is always allowed.
 * - `media` (camera and microphone), `display-capture`, and `clipboard-read` use the saved
 *   answer of the account. With no saved answer, Shifted asks.
 * - Every other permission is denied with no dialog.
 *
 * @param permission The Electron name of the permission.
 * @param saved The saved answers of the account.
 */
export function permissionDecision(permission: string, saved: PagePermissions): PermissionDecision {
  if (permission === 'notifications') return 'allow'
  if (!isAskedPermission(permission)) return 'deny'
  return saved[permission] ?? 'ask'
}

/**
 * Answer a permission check of a page of an account. A check never shows a dialog, so a
 * permission with no saved answer is not granted.
 */
export function permissionCheck(permission: string, saved: PagePermissions): boolean {
  return permissionDecision(permission, saved) === 'allow'
}

/** The words for a permission in the question to the person. */
export function permissionQuestionWords(permission: AskedPermission): string {
  switch (permission) {
    case 'media':
      return 'use your camera and microphone'
    case 'display-capture':
      return 'share your screen'
    case 'clipboard-read':
      return 'read your clipboard'
  }
}
