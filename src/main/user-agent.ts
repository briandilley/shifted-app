/**
 * The user agent of Shifted.
 *
 * Shifted never pretends to be another browser (see
 * `docs/spec/docs/adr/0004-honest-user-agent-for-sign-in.md`). The user agent is the
 * default Electron user agent, with the app token `Shifted/<version>` and the
 * `Electron/<version>` token kept.
 */

export const APP_TOKEN_NAME = 'Shifted'

/**
 * Make the user agent of Shifted from the default Electron user agent.
 *
 * Electron puts an app token `<app name>/<app version>` in its default user agent.
 * The app name can be the package name (`shifted`) or the product name (`Shifted`).
 * This function removes that token and puts `Shifted/<version>` before `Chrome/`.
 *
 * @param defaultUserAgent The default Electron user agent (`app.userAgentFallback`).
 * @param version The version of Shifted (`app.getVersion()`).
 * @param appNames Other app names that Electron can have put in the user agent.
 */
export function makeUserAgent(
  defaultUserAgent: string,
  version: string,
  appNames: readonly string[] = []
): string {
  if (!/\bElectron\/\S+/.test(defaultUserAgent)) {
    throw new Error(`The default user agent has no Electron/ token: ${defaultUserAgent}`)
  }
  const names = new Set([APP_TOKEN_NAME, APP_TOKEN_NAME.toLowerCase(), ...appNames])
  const tokens = defaultUserAgent.split(' ').filter((token) => {
    const slash = token.indexOf('/')
    if (slash <= 0) return true
    return !names.has(token.slice(0, slash))
  })
  const appToken = `${APP_TOKEN_NAME}/${version}`
  const chromeIndex = tokens.findIndex((token) => token.startsWith('Chrome/'))
  if (chromeIndex === -1) {
    const electronIndex = tokens.findIndex((token) => token.startsWith('Electron/'))
    tokens.splice(electronIndex, 0, appToken)
  } else {
    tokens.splice(chromeIndex, 0, appToken)
  }
  return tokens.join(' ')
}

/** The parts of Electron's `app` that `applyUserAgent` uses. */
export interface UserAgentApp {
  userAgentFallback: string
  getVersion(): string
  getName(): string
}

/** Set the user agent of Shifted on the app. Call it before any window opens. */
export function applyUserAgent(app: UserAgentApp): string {
  const userAgent = makeUserAgent(app.userAgentFallback, app.getVersion(), [app.getName()])
  app.userAgentFallback = userAgent
  return userAgent
}
