import type { CSSProperties } from 'react'
import type { AccountState } from '../../shared/api'
import { MAIN, PAGE_PROBLEM_TEXTS } from '../strings'
import { accountName } from './account-display'
import styles from './App.module.css'
import controls from './controls.module.css'
import Sidebar from './Sidebar'
import TabBar from './TabBar'
import { useBackdrop } from './use-color-mode'
import { useShiftedState } from './use-shifted-state'
import { useViewBounds } from './use-view-bounds'

/**
 * What the content area shows when no Google app of the selected account shows. The
 * Google view is hidden while one of these panels shows.
 */
interface ContentPanelProps {
  account: AccountState | undefined
  /** A `mailto:` link came from another app while Shifted had no accounts. */
  addAccountFirst: boolean
}

function ContentPanel({ account, addAccountFirst }: ContentPanelProps): React.JSX.Element {
  if (!account) {
    return (
      <p className={styles.message} role={addAccountFirst ? 'alert' : undefined}>
        {addAccountFirst ? MAIN.addAccountFirst : MAIN.noAccounts}
      </p>
    )
  }
  switch (account.status) {
    case 'signing-in':
      return <p className={styles.message}>{MAIN.signingIn}</p>
    case 'signed-out':
      return (
        <div className={styles.panel}>
          <p className={styles.message}>{MAIN.signedOut}</p>
          <button
            type="button"
            className={controls.primaryButton}
            onClick={() => window.shifted.signInAgain(account.id)}
          >
            {MAIN.signInAgain}
          </button>
        </div>
      )
    case 'not-signed-in':
      // An account from an import. Its session is empty, so it needs a sign-in.
      return (
        <div className={styles.panel}>
          <p className={styles.message}>
            {account.email ? MAIN.signInTo(account.email) : MAIN.signInToThisAccount}
          </p>
          <button
            type="button"
            className={controls.primaryButton}
            onClick={() => window.shifted.signInAgain(account.id)}
          >
            {MAIN.signIn}
          </button>
        </div>
      )
    case 'signed-in': {
      // The page of the Google app stopped: it crashed, or it has a certificate error.
      // Shifted hides its view, and "Reload" loads it again.
      const problem = account.pageProblems[account.lastGoogleApp]
      if (problem) {
        return (
          <div className={styles.panel} data-page-problem={problem}>
            <p className={styles.message} role="alert">
              {PAGE_PROBLEM_TEXTS[problem]}
            </p>
            <button
              type="button"
              className={controls.primaryButton}
              onClick={() => window.shifted.reloadGoogleApp()}
            >
              {MAIN.reload}
            </button>
          </div>
        )
      }
      // The page of the Google app went to Google's sign-in host. Shifted hides it while
      // it checks the feed of the account, so that Google's sign-in page never shows.
      if (account.checkingSignIn.includes(account.lastGoogleApp)) {
        return (
          <p className={styles.message} role="status" data-checking-sign-in>
            {MAIN.loading}
          </p>
        )
      }
      // The view of the Google app covers the content area.
      return <></>
    }
  }
}

/**
 * The address of the selected account at the right end of the top row. A long address
 * ends with an ellipsis, and its tooltip shows the whole address.
 */
function SelectedAccount({ account }: { account: AccountState }): React.JSX.Element {
  return (
    <p className={styles.selectedAccount} title={accountName(account)} data-selected-account>
      <span
        className={styles.dot}
        style={{ '--account-color': account.color } as CSSProperties}
        aria-hidden="true"
      />
      <span className={styles.address}>{accountName(account)}</span>
    </p>
  )
}

/**
 * The frame view of the main window. It fills the whole window and draws the backdrop,
 * the top row with the folder tabs, the sidebar with the selection tile, and the content
 * area card with its shadow. The Google view lies on top of the content area.
 */
function App(): React.JSX.Element {
  const state = useShiftedState()
  const contentAreaRef = useViewBounds<HTMLElement>()
  const account = state?.accounts.find((candidate) => candidate.id === state.selectedAccountId)
  const backdrop = useBackdrop(account?.color ?? null)

  return (
    <div
      className={styles.frame}
      style={{ backgroundColor: backdrop }}
      data-frame-view
      data-backdrop={backdrop}
    >
      <header className={styles.topRow}>
        <TabBar account={account} />
        <div className={styles.titleArea}>{account && <SelectedAccount account={account} />}</div>
      </header>
      <Sidebar
        accounts={state?.accounts ?? []}
        selectedAccountId={state?.selectedAccountId ?? null}
        showImport={state !== null && state.accounts.length === 0}
      />
      <main ref={contentAreaRef} className={styles.contentArea}>
        {state && <ContentPanel account={account} addAccountFirst={state.addAccountFirst} />}
      </main>
    </div>
  )
}

export default App
