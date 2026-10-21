/**
 * The account colors and the backdrops of the "Card stack" design. See "Account colors
 * and backdrops" in `docs/spec/DESIGN.md`.
 *
 * The backdrop of a window is the base color mixed with the account color. `DESIGN.md`
 * gives the mixed values in a table, and Shifted uses these values as they are. It never
 * mixes colors at run time.
 *
 * This file holds no code that needs Node.js, Electron, or a browser, so the main process,
 * the screens, and the unit tests can all use it.
 */

/** Light or dark mode of the operating system. */
export type ColorMode = 'light' | 'dark'

/** One account color, with its backdrop in light mode and in dark mode. */
export interface AccountColor {
  /** The name on screen, for example "Blue". */
  name: string
  /** The account color, for example `#1A73E8`. */
  color: string
  /** The backdrop of the window when this account is selected, in each mode. */
  backdrop: Readonly<Record<ColorMode, string>>
}

/** The 8 account colors, in the order that new accounts get them. */
export const ACCOUNT_COLOR_TABLE: readonly AccountColor[] = [
  { name: 'Blue', color: '#1A73E8', backdrop: { light: '#D0DEF3', dark: '#162134' } },
  { name: 'Red', color: '#D93025', backdrop: { light: '#ECD7D9', dark: '#2C1D20' } },
  { name: 'Green', color: '#188038', backdrop: { light: '#D0DFDA', dark: '#162321' } },
  { name: 'Yellow', color: '#F9AB00', backdrop: { light: '#ECE5DD', dark: '#2D2823' } },
  { name: 'Purple', color: '#A142F4', backdrop: { light: '#DFD9F5', dark: '#231D36' } },
  { name: 'Cyan', color: '#12B5CB', backdrop: { light: '#D4E6EE', dark: '#192831' } },
  { name: 'Orange', color: '#E8710A', backdrop: { light: '#EBDEDA', dark: '#2C2221' } },
  { name: 'Gray', color: '#5F6368', backdrop: { light: '#D6DAE0', dark: '#1C1F26' } }
]

/** The fixed set of 8 account colors. Each new account gets the next color. */
export const ACCOUNT_COLORS: readonly string[] = ACCOUNT_COLOR_TABLE.map((entry) => entry.color)

/**
 * The color tokens that the main process needs for the window frame. They equal the
 * tokens of the same name in `src/renderer/theme.css`. A unit test checks both against
 * `DESIGN.md`.
 */
export const THEME_TOKENS: Readonly<
  Record<ColorMode, { readonly base: string; readonly text: string }>
> = {
  light: { base: '#E9EDF3', text: '#1A1F2B' },
  dark: { base: '#12151C', text: '#E6E9F0' }
}

/** True when two colors are the same, without regard to upper or lower case. */
export function isSameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** The entry of the table for a color, or `undefined` if the color is not in the set. */
export function findAccountColorEntry(value: unknown): AccountColor | undefined {
  if (typeof value !== 'string') return undefined
  return ACCOUNT_COLOR_TABLE.find((entry) => isSameColor(entry.color, value))
}

/** The color of the set that equals the value, or `undefined` if it is not in the set. */
export function findAccountColor(value: unknown): string | undefined {
  return findAccountColorEntry(value)?.color
}

/** The name of an account color, for example "Blue". A color outside the set keeps its value. */
export function accountColorName(color: string): string {
  return findAccountColorEntry(color)?.name ?? color
}

/**
 * The backdrop of a window, from the table of `DESIGN.md`.
 *
 * @param color The color of the account, or `null` when the window shows no account.
 *   With no account, and for a color outside the set, the backdrop is `--base`.
 */
export function accountBackdrop(color: string | null | undefined, mode: ColorMode): string {
  const entry = color ? findAccountColorEntry(color) : undefined
  return entry ? entry.backdrop[mode] : THEME_TOKENS[mode].base
}
