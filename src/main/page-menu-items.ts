/**
 * The items of the context menu of a page: what a right-click in Gmail, Calendar, a child
 * window, the sign-in window, or a screen of Shifted shows. `page-menu.ts` shows the menu.
 *
 * The menu has the items that fit the place of the click: spelling suggestions, a link,
 * an image, and the edit commands. A place with none of these gets no menu.
 *
 * This module needs no Electron at run time, so that unit tests can use it.
 */
import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'
import { routeNavigation, type LinkSource } from './link-rules'

/** Where the menu shows: a page of an account, the sign-in window, or a screen of Shifted. */
export type PageMenuSource = LinkSource | 'shifted-screen'

/** The edit commands of the menu. Each one is a method of the web contents. */
export type EditCommand =
  'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'pasteAndMatchStyle' | 'selectAll'

/** The values of Electron's `context-menu` event that the menu uses. */
export type PageMenuParams = Pick<
  ContextMenuParams,
  | 'linkURL'
  | 'srcURL'
  | 'mediaType'
  | 'selectionText'
  | 'isEditable'
  | 'editFlags'
  | 'misspelledWord'
  | 'dictionarySuggestions'
>

export interface PageMenuActions {
  /** Run an edit command in the page. */
  edit(command: EditCommand): void
  /** Replace the misspelled word under the pointer with a suggestion. */
  replaceMisspelling(word: string): void
  /** Add a word to the spell check dictionary, so that it is no longer marked. */
  addToDictionary(word: string): void
  /** Put text on the clipboard. */
  copyText(text: string): void
  /** Put the image under the pointer on the clipboard. */
  copyImage(): void
  /** Download an image, as a download of the page (see `downloads.ts`). */
  saveImage(url: string): void
  /** Open a URL in the default browser. */
  openInDefaultBrowser(url: string): void
  /** Show the macOS dictionary for the selected text. */
  lookUp(): void
}

/** The longest selected text that the "Look up" item shows. */
const LOOK_UP_TEXT_LENGTH = 30

/** The most spelling suggestions that the menu shows. */
const SPELLING_SUGGESTIONS = 5

/** The address of a `mailto:` link, for example `friend@example.com`, or `null`. */
export function mailtoAddress(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'mailto:') return null
  try {
    return decodeURIComponent(parsed.pathname)
  } catch {
    return parsed.pathname
  }
}

/** The selected text for the "Look up" item: one line, at most 30 characters. */
function lookUpText(text: string): string {
  const line = text.trim().replace(/\s+/g, ' ')
  return line.length > LOOK_UP_TEXT_LENGTH ? `${line.slice(0, LOOK_UP_TEXT_LENGTH)}…` : line
}

/** The spelling suggestions for the misspelled word under the pointer. */
function spellingItems(
  params: PageMenuParams,
  actions: PageMenuActions
): MenuItemConstructorOptions[] {
  const word = params.misspelledWord
  if (!params.isEditable || !word) return []
  const suggestions = params.dictionarySuggestions.slice(0, SPELLING_SUGGESTIONS)
  const replace: MenuItemConstructorOptions[] =
    suggestions.length > 0
      ? suggestions.map((suggestion) => ({
          label: suggestion,
          click: () => actions.replaceMisspelling(suggestion)
        }))
      : [{ label: 'No spelling suggestions', enabled: false }]
  return [...replace, { label: 'Add to dictionary', click: () => actions.addToDictionary(word) }]
}

/**
 * The items of a link. "Open link in browser" shows only when the link rules send the
 * link to the default browser, so the menu keeps the rules of "Links" in
 * `docs/spec/PRODUCT.md`. A Gmail link, a Calendar link, and a link in the sign-in window
 * get only "Copy link address". A click on the link does the rest. The screens of Shifted
 * have no link items.
 */
function linkItems(
  params: PageMenuParams,
  source: PageMenuSource,
  actions: PageMenuActions
): MenuItemConstructorOptions[] {
  const url = params.linkURL
  if (!url || source === 'shifted-screen') return []
  const address = mailtoAddress(url)
  if (address !== null) {
    return [{ label: 'Copy email address', click: () => actions.copyText(address) }]
  }
  const result = routeNavigation(url, { source, kind: 'new-window' })
  // A link with a scheme that Shifted blocks, for example `javascript:`, gets no items.
  if (result === 'block') return []
  const copy: MenuItemConstructorOptions = {
    label: 'Copy link address',
    click: () => actions.copyText(url)
  }
  if (result !== 'default-browser') return [copy]
  return [{ label: 'Open link in browser', click: () => actions.openInDefaultBrowser(url) }, copy]
}

/** The items of an image. The sign-in window and the screens of Shifted have none. */
function imageItems(
  params: PageMenuParams,
  source: PageMenuSource,
  actions: PageMenuActions
): MenuItemConstructorOptions[] {
  const url = params.srcURL
  if (params.mediaType !== 'image' || !url) return []
  if (source === 'sign-in' || source === 'shifted-screen') return []
  return [
    { label: 'Copy image', click: () => actions.copyImage() },
    { label: 'Copy image address', click: () => actions.copyText(url) },
    { label: 'Save image', click: () => actions.saveImage(url) }
  ]
}

/** An edit command as a menu item. It is on only when the page allows the command. */
function editItem(
  label: string,
  command: EditCommand,
  enabled: boolean,
  actions: PageMenuActions
): MenuItemConstructorOptions {
  return { label, enabled, click: () => actions.edit(command) }
}

/**
 * The groups of the edit commands. A text field gets all of them. Selected text outside a
 * text field gets Copy. On macOS, selected text also gets "Look up".
 */
function editGroups(
  params: PageMenuParams,
  actions: PageMenuActions,
  platform: NodeJS.Platform
): MenuItemConstructorOptions[][] {
  const flags = params.editFlags
  const selection = params.selectionText.trim()
  const lookUp: MenuItemConstructorOptions[] =
    platform === 'darwin' && selection
      ? [{ label: `Look up “${lookUpText(selection)}”`, click: () => actions.lookUp() }]
      : []
  if (params.isEditable) {
    return [
      [
        editItem('Undo', 'undo', flags.canUndo, actions),
        editItem('Redo', 'redo', flags.canRedo, actions)
      ],
      [
        editItem('Cut', 'cut', flags.canCut, actions),
        editItem('Copy', 'copy', flags.canCopy, actions),
        editItem('Paste', 'paste', flags.canPaste, actions),
        editItem('Paste and match style', 'pasteAndMatchStyle', flags.canPaste, actions),
        editItem('Select all', 'selectAll', flags.canSelectAll, actions)
      ],
      lookUp
    ]
  }
  if (!selection) return []
  return [[editItem('Copy', 'copy', flags.canCopy, actions)], lookUp]
}

/**
 * The items of the context menu for a right-click with these values, with a separator
 * between the groups. An empty list means that Shifted shows no menu.
 */
export function pageMenuTemplate(
  params: PageMenuParams,
  source: PageMenuSource,
  actions: PageMenuActions,
  platform: NodeJS.Platform = process.platform
): MenuItemConstructorOptions[] {
  const groups = [
    spellingItems(params, actions),
    linkItems(params, source, actions),
    imageItems(params, source, actions),
    ...editGroups(params, actions, platform)
  ].filter((group) => group.length > 0)
  return groups.flatMap((group, index): MenuItemConstructorOptions[] =>
    index === 0 ? group : [{ type: 'separator' }, ...group]
  )
}
