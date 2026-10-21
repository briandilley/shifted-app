/**
 * "Contrast" in `docs/spec/DESIGN.md`: all text has a contrast of at least 4.5 to 1
 * against its background, in both modes. This test computes the contrast of `--text` and
 * `--text-secondary` of `theme.css` on `--surface`, on `--base`, and on all 16 backdrops of
 * the account colors (8 colors in light mode and 8 in dark mode).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_COLOR_TABLE, type ColorMode } from '../../src/shared/account-colors'

const THEME_CSS = readFileSync(join(__dirname, '../../src/renderer/theme.css'), 'utf8')

/** The smallest contrast that `DESIGN.md` allows for text. */
const MIN_CONTRAST = 4.5

/** The color tokens of one mode of `theme.css`. */
function tokens(mode: ColorMode): Map<string, string> {
  const dark = THEME_CSS.indexOf('@media (prefers-color-scheme: dark)')
  const block = mode === 'light' ? THEME_CSS.slice(0, dark) : THEME_CSS.slice(dark)
  const values = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    values.set(match[1] ?? '', (match[2] ?? '').trim())
  }
  return values
}

function token(mode: ColorMode, name: string): string {
  const value = tokens(mode).get(name)
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not #RRGGBB.`)
  return value
}

/** The relative luminance of a color `#RRGGBB`, as WCAG 2 defines it. */
function luminance(color: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

/** The contrast ratio of two colors, from 1 to 21. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

describe('contrast', () => {
  it('computes the contrast of WCAG 2', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2)
  })

  for (const mode of ['light', 'dark'] as const) {
    const backgrounds: [string, string][] = [
      ['--surface', token(mode, '--surface')],
      ['--base', token(mode, '--base')],
      ...ACCOUNT_COLOR_TABLE.map((entry): [string, string] => [
        `the ${entry.name} backdrop`,
        entry.backdrop[mode]
      ])
    ]
    for (const text of ['--text', '--text-secondary']) {
      it(`${text} has a contrast of at least 4.5 to 1 on every background in ${mode} mode`, () => {
        const foreground = token(mode, text)
        const tooLow = backgrounds
          .map(([name, background]) => ({ name, ratio: contrast(foreground, background) }))
          .filter(({ ratio }) => ratio < MIN_CONTRAST)
        expect(tooLow).toEqual([])
      })
    }
  }

  it('checks all 16 backdrops', () => {
    const backdrops = ACCOUNT_COLOR_TABLE.flatMap((entry) => [
      entry.backdrop.light,
      entry.backdrop.dark
    ])
    expect(new Set(backdrops).size).toBe(16)
  })
})
