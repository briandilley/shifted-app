import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_COLOR_TABLE,
  ACCOUNT_COLORS,
  accountBackdrop,
  accountColorName,
  THEME_TOKENS,
  type ColorMode
} from '../../src/shared/account-colors'

const ROOT = join(__dirname, '../..')
const DESIGN = readFileSync(join(ROOT, 'docs/spec/DESIGN.md'), 'utf8')
const THEME_CSS = readFileSync(join(ROOT, 'src/renderer/theme.css'), 'utf8')

/** The rows of the first Markdown table after a heading of `DESIGN.md`, without the header. */
function designTable(heading: string): string[][] {
  const start = DESIGN.indexOf(`\n## ${heading}\n`)
  if (start < 0) throw new Error(`DESIGN.md has no section "${heading}".`)
  const lines = DESIGN.slice(start).split('\n').slice(2)
  const first = lines.findIndex((line) => line.startsWith('|'))
  const rows: string[][] = []
  for (const line of lines.slice(first)) {
    if (!line.startsWith('|')) break
    rows.push(
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim().replace(/^`|`$/g, ''))
    )
  }
  // The first row is the header, and the second row is the line under it.
  return rows.slice(2)
}

/** The same CSS value written the same way: lower case, one form of each number. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .replace(/(?<=^|[\s(,])(\d*\.\d+|\d+)/g, (number) => String(parseFloat(number)))
    .trim()
}

/** The custom properties of one CSS block. */
function customProperties(block: string): Map<string, string> {
  const properties = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    properties.set(match[1] ?? '', normalize(match[2] ?? ''))
  }
  return properties
}

/** The light set and the dark set of `theme.css`. */
function themeSets(): Record<ColorMode, Map<string, string>> {
  const dark = THEME_CSS.indexOf('@media (prefers-color-scheme: dark)')
  if (dark < 0) throw new Error('theme.css has no dark set.')
  return {
    light: customProperties(THEME_CSS.slice(0, dark)),
    dark: customProperties(THEME_CSS.slice(dark))
  }
}

describe('the account colors and backdrops', () => {
  const rows = designTable('Account colors and backdrops')

  it('are the 8 colors of the table in DESIGN.md, in its order', () => {
    expect(rows).toHaveLength(8)
    expect(ACCOUNT_COLOR_TABLE.map((entry) => [entry.name, entry.color])).toEqual(
      rows.map(([name, color]) => [name, color])
    )
    expect(ACCOUNT_COLORS).toEqual(rows.map(([, color]) => color))
  })

  it('give each account color and mode the backdrop of the table in DESIGN.md', () => {
    for (const [name, color, light, dark] of rows) {
      expect(accountBackdrop(color, 'light'), `${name}, light mode`).toBe(light)
      expect(accountBackdrop(color, 'dark'), `${name}, dark mode`).toBe(dark)
      // A color in lower case is the same color.
      expect(accountBackdrop(color?.toLowerCase(), 'dark'), `${name}, lower case`).toBe(dark)
      expect(accountColorName(color ?? '')).toBe(name)
    }
  })

  it('give --base with no account and for a color outside the set', () => {
    const tokens = new Map(
      designTable('Color tokens').map(([token, light, dark]) => [token, { light, dark }])
    )
    for (const mode of ['light', 'dark'] as const) {
      expect(accountBackdrop(null, mode)).toBe(tokens.get('--base')?.[mode])
      expect(accountBackdrop('#123456', mode)).toBe(tokens.get('--base')?.[mode])
    }
  })
})

describe('the color tokens', () => {
  const rows = designTable('Color tokens')

  it('in theme.css are the light set and the dark set of DESIGN.md', () => {
    const sets = themeSets()
    expect(rows.length).toBeGreaterThan(0)
    for (const [token, light, dark] of rows) {
      expect(sets.light.get(token ?? ''), `${token}, light mode`).toBe(normalize(light ?? ''))
      expect(sets.dark.get(token ?? ''), `${token}, dark mode`).toBe(normalize(dark ?? ''))
    }
    expect([...sets.light.keys()].sort()).toEqual(rows.map(([token]) => token).sort())
    expect([...sets.dark.keys()].sort()).toEqual(rows.map(([token]) => token).sort())
  })

  it('that the main process uses for the window frame equal DESIGN.md', () => {
    const tokens = new Map(rows.map(([token, light, dark]) => [token, { light, dark }]))
    for (const mode of ['light', 'dark'] as const) {
      expect(THEME_TOKENS[mode].base).toBe(tokens.get('--base')?.[mode])
      expect(THEME_TOKENS[mode].text).toBe(tokens.get('--text')?.[mode])
    }
  })
})
