import type { CSSProperties } from 'react'
import type { AccountState } from '../../shared/api'
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
        {addAccountFirst ? 'Add an account first' : 'No accounts yet'}
      </p>
    )
  }
  switch (account.status) {
    case 'signing-in':
      return <p className={styles.message}>Signing in…</p>
    case 'signed-out':
      return (
        <div className={styles.panel}>
          <p className={styles.message}>This account is signed out.</p>
          <button
            type="button"
            className={controls.primaryButton}
            onClick={() => window.shifted.signInAgain(account.id)}
          >
            Sign in again
          </button>
        </div>
      )
    case 'signed-in':
      // The view of the Google app covers the content area.
      return <></>
  }
}

/** The address of the selected account at the right end of the top row. */
function SelectedAccount({ account }: { account: AccountState }): React.JSX.Element {
  return (
    <p className={styles.selectedAccount} data-selected-account>
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
      />
      <main ref={contentAreaRef} className={styles.contentArea}>
        {state && <ContentPanel account={account} addAccountFirst={state.addAccountFirst} />}
      </main>
    </div>
  )
}

export default App
