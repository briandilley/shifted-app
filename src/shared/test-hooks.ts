/**
 * Test hooks that the main process and the preload script of the Google pages share.
 * They work only in test mode (`SHIFTED_TEST_SERVER` is set).
 */

/**
 * In test mode, the Google pages get this command line argument
 * (`webPreferences.additionalArguments`). Only then does their preload script listen to
 * `TEST_CRASH_CHANNEL`.
 */
export const TEST_HOOKS_ARGUMENT = '--shifted-test-hooks'

/** The main process sends this to a Google page to make it crash with `process.crash()`. */
export const TEST_CRASH_CHANNEL = 'shifted:test-crash'
