/**
 * A production build of Shifted opens no remote debugging port. See "Security" in
 * `docs/spec/BUILD.md`.
 *
 * Chromium opens the port for the command line switch `--remote-debugging-port` (and
 * `--remote-debugging-pipe`) after the main script runs. Shifted removes these switches
 * at the start of a packaged build. The fuse `EnableNodeCliInspectArguments` (see
 * `electron-builder.yml`) already stops `--inspect` of Node.js.
 *
 * Development builds and the end-to-end tests keep the switches: Playwright drives
 * Shifted through them.
 */

/** The command line switches that open a remote debugging port or pipe. */
export const REMOTE_DEBUGGING_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-debugging-address'
] as const

/** The parts of `app.commandLine` that this module uses. */
export interface CommandLine {
  hasSwitch(name: string): boolean
  removeSwitch(name: string): void
}

/**
 * Remove the remote debugging switches from the command line.
 *
 * @returns The switches that were there.
 */
export function removeRemoteDebuggingSwitches(commandLine: CommandLine): string[] {
  const removed: string[] = []
  for (const name of REMOTE_DEBUGGING_SWITCHES) {
    if (!commandLine.hasSwitch(name)) continue
    commandLine.removeSwitch(name)
    removed.push(name)
  }
  return removed
}
