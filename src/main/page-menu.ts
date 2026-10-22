/**
 * Show the context menu of a page on a right-click. `page-menu-items.ts` decides the
 * items.
 *
 * Electron shows no context menu of its own, so without this a right-click in Gmail does
 * nothing. A page that shows its own context menu, for example the message list of
 * Gmail, stops the right-click itself. Then Electron sends no `context-menu` event, and
 * Shifted shows nothing.
 */
import { BrowserWindow, clipboard, Menu, type WebContents } from 'electron'
import { openInDefaultBrowser } from './external'
import { pageMenuTemplate, type PageMenuActions, type PageMenuSource } from './page-menu-items'

/** Show the context menu of a page on each right-click in it. */
export function applyPageMenu(contents: WebContents, source: PageMenuSource): void {
  contents.on('context-menu', (_event, params) => {
    const page = (): WebContents | null => (contents.isDestroyed() ? null : contents)
    const actions: PageMenuActions = {
      edit: (command) => page()?.[command](),
      replaceMisspelling: (word) => page()?.replaceMisspelling(word),
      addToDictionary: (word) => {
        page()?.session.addWordToSpellCheckerDictionary(word)
      },
      copyText: (text) => clipboard.writeText(text),
      copyImage: () => page()?.copyImageAt(params.x, params.y),
      saveImage: (url) => page()?.downloadURL(url),
      openInDefaultBrowser,
      lookUp: () => page()?.showDefinitionForSelection()
    }
    const template = pageMenuTemplate(params, source, actions)
    if (template.length === 0) return
    const window = BrowserWindow.fromWebContents(contents)
    Menu.buildFromTemplate(template).popup({
      ...(window ? { window } : {}),
      ...(params.frame ? { frame: params.frame } : {})
    })
  })
}
