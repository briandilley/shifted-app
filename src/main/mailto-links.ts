/**
 * `mailto:` links from other apps: the saved `mailto:` default, the account picker, or
 * "Add an account first". Then a new message in Gmail of the chosen account. See
 * "mailto: links" in `docs/spec/PRODUCT.md`.
 *
 * A `mailto:` link inside Gmail or Calendar of an account does not come here. The link
 * rules open it in the same account (see `link-handlers.ts`).
 */
import type { BrowserWindow } from 'electron'
import type { AccountPicker } from './account-picker'
import type { Accounts } from './accounts'
import { gmailComposeUrl } from './google-urls'
import { chooseMailtoAction, isMailtoUrl, mailtoHeading } from './mailto'

export class MailtoLinks {
  constructor(
    private readonly accounts: Accounts,
    private readonly picker: AccountPicker,
    /** Open the main window if it is closed, and bring it to the front. */
    private readonly showMainWindow: () => BrowserWindow | null
  ) {}

  /** Handle a `mailto:` link from another app. Other text is ignored. */
  open(url: string): void {
    if (!isMailtoUrl(url)) return
    const { defaultAccountId, lastAccountId } = this.accounts.mailtoChoice()
    const accountIds = this.accounts.state().accounts.map((account) => account.id)
    const action = chooseMailtoAction(accountIds, defaultAccountId, lastAccountId)
    switch (action.kind) {
      case 'no-accounts':
        this.picker.cancel()
        this.accounts.showAddAccountFirst()
        this.showMainWindow()
        return
      case 'account':
        this.picker.cancel()
        this.accounts.saveMailtoChoice(action.accountId, false)
        this.compose(action.accountId, url)
        return
      case 'picker': {
        const parent = this.showMainWindow()
        const info = { heading: mailtoHeading(url), selectedAccountId: action.selectedAccountId }
        this.picker.show(parent, info, (choice) => {
          if (!choice) return
          this.accounts.saveMailtoChoice(choice.accountId, choice.always)
          this.compose(choice.accountId, url)
        })
        return
      }
    }
  }

  /**
   * Select the account and show its Gmail tab with a new message for the whole link.
   * Gmail loads if it is not loaded. If the account is not signed in, the content area
   * shows the signed-out panel, and no new message opens.
   */
  compose(accountId: string, url: string): void {
    const account = this.accounts.account(accountId)
    if (!account) return
    this.showMainWindow()
    if (account.status === 'signed-in') {
      this.accounts.showInGoogleApp(accountId, 'gmail', gmailComposeUrl(url))
    } else {
      this.accounts.selectAccount(accountId)
    }
  }
}
