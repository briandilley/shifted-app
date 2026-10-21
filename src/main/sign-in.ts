/**
 * The rules of the sign-in window that need no Electron.
 */
import { isGmailUrl } from './google-urls'

/**
 * True when the sign-in window reached Gmail, so sign-in is finished.
 *
 * Google's sign-in ends at Gmail (see `isGmailUrl` in `google-urls.ts`). Every other page,
 * for example Google's sign-in pages or a company identity provider, means that
 * sign-in is still in progress.
 */
export function isSignInFinished(url: string): boolean {
  return isGmailUrl(url)
}
