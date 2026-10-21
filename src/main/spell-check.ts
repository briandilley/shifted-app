/**
 * The spell check languages of the sessions. See "Shifted's own screens" in
 * `docs/spec/PRODUCT.md`: Shifted marks spelling mistakes in Gmail and Calendar, in the
 * languages of the operating system.
 *
 * On macOS, the operating system checks spelling and finds the language itself. On
 * Windows and Linux, Chromium uses Hunspell dictionaries, and Shifted sets the languages of
 * each session from `app.getPreferredSystemLanguages()`.
 *
 * This module needs no Electron at run time, so that unit tests can use it.
 */
import type { Session } from 'electron'

/**
 * The spell check languages for the preferred languages of the operating system: each
 * preferred language that Chromium has a dictionary for, in the order of preference.
 *
 * A language matches a dictionary with the same tag ("en-US"), else the dictionary of the
 * language alone ("de" for "de-AT"), else the dictionary of the main region of the
 * language ("fr-FR" for "fr"), else the first dictionary of the language ("en-AU" for
 * "en"). Case does not count.
 *
 * @param preferred The languages of the operating system, for example `["de-AT", "en-US"]`.
 * @param available The languages that Chromium has dictionaries for
 *   (`session.availableSpellCheckerLanguages`).
 */
export function spellCheckLanguages(
  preferred: readonly string[],
  available: readonly string[]
): string[] {
  const byLowerCase = new Map(available.map((language) => [language.toLowerCase(), language]))
  const result: string[] = []
  for (const tag of preferred) {
    const lower = tag.toLowerCase().replace(/_/g, '-')
    const base = lower.split('-')[0] ?? ''
    if (!base) continue
    const match =
      byLowerCase.get(lower) ??
      byLowerCase.get(base) ??
      byLowerCase.get(`${base}-${base}`) ??
      available.find((language) => language.toLowerCase().startsWith(`${base}-`))
    if (match && !result.includes(match)) result.push(match)
  }
  return result
}

/**
 * Set the spell check languages of a session on Windows and Linux. On macOS, it does
 * nothing, because the operating system checks spelling.
 *
 * @param preferred `app.getPreferredSystemLanguages()`.
 * @param dictionaryUrl Where Chromium downloads the dictionaries, or `undefined` for
 *   Chromium's own place (a Google server). The end-to-end tests use the fake server.
 */
export function applySpellCheckLanguages(
  session: Session,
  preferred: readonly string[],
  dictionaryUrl: string | undefined,
  platform: NodeJS.Platform = process.platform
): void {
  if (platform === 'darwin') return
  if (dictionaryUrl) session.setSpellCheckerDictionaryDownloadURL(dictionaryUrl)
  const languages = spellCheckLanguages(preferred, session.availableSpellCheckerLanguages)
  if (languages.length > 0) session.setSpellCheckerLanguages(languages)
}
