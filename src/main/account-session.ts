/**
 * The session of each account. See `docs/spec/docs/adr/0002-isolated-session-per-account.md`.
 *
 * Each account has its own persistent session, with the partition
 * `persist:account-<id>`. Two accounts never share a session.
 */
import { app, session, type Session, type WebPreferences } from 'electron'
import { rm } from 'node:fs/promises'

const configuredSessions = new WeakSet<Session>()

/** The partition name of the session of an account. */
export function partitionName(accountId: string): string {
  return `persist:account-${accountId}`
}

/** The session of an account, with the user agent of Shifted. */
export function accountSession(accountId: string): Session {
  const accountSession = session.fromPartition(partitionName(accountId))
  if (!configuredSessions.has(accountSession)) {
    // `app.userAgentFallback` already holds the user agent from `user-agent.ts`.
    accountSession.setUserAgent(app.userAgentFallback)
    configuredSessions.add(accountSession)
  }
  return accountSession
}

/**
 * The web preferences of a view that shows a Google page of an account. See the
 * "Security" section of `docs/spec/BUILD.md`.
 */
export function googlePageWebPreferences(accountSession: Session): WebPreferences {
  return {
    session: accountSession,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false
  }
}

/** Write the cookies and the site data of an account to disk now. */
export async function flushAccountSession(accountId: string): Promise<void> {
  const accountSession = session.fromPartition(partitionName(accountId))
  accountSession.flushStorageData()
  await accountSession.cookies.flushStore()
}

/**
 * Delete the session of an account: clear its storage data, then delete its partition
 * folder from disk. Close every view of the account first.
 */
export async function deleteAccountSession(accountId: string): Promise<void> {
  const accountSession = session.fromPartition(partitionName(accountId))
  const folder = accountSession.storagePath
  await accountSession.clearStorageData()
  if (folder) {
    await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}
