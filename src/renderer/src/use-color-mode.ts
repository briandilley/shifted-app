import { useSyncExternalStore } from 'react'
import { accountBackdrop, type ColorMode } from '../../shared/account-colors'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function currentMode(): ColorMode {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** The light or dark mode of the operating system. It changes at once with the system. */
export function useColorMode(): ColorMode {
  return useSyncExternalStore(subscribe, currentMode)
}

/**
 * The backdrop of a window: the tint of the account color from the table of `DESIGN.md`,
 * or `--base` with no account.
 */
export function useBackdrop(color: string | null | undefined): string {
  return accountBackdrop(color, useColorMode())
}
