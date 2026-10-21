import type { AccountState } from '../../shared/api'
import styles from './App.module.css'
import { useShiftedState } from './use-shifted-state'
import { useViewBounds } from './use-view-bounds'

/** What the content area shows when no Google app of the selected account shows. */
function ContentMessage({ account }: { account: AccountState | undefined }): React.JSX.Element {
  if (!account) {
    return <p className={styles.message}>No accounts yet</p>
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
            className={styles.button}
            onClick={() => window.shifted.signInAgain(account.id)}
          >
            Sign in again
          </button>
        </div>
      )
    case 'gmail':
      // The Gmail view of the account covers the content area.
      return <></>
  }
}

function App(): React.JSX.Element {
  const state = useShiftedState()
  const contentAreaRef = useViewBounds<HTMLElement>()
  const account = state?.accounts.find((candidate) => candidate.id === state.selectedAccountId)

  // Prompt 02 replaces this temporary bar with the sidebar.
  return (
    <div className={styles.window}>
      <header className={styles.bar}>
        {state && !account && (
          <button
            type="button"
            className={styles.button}
            onClick={() => window.shifted.addAccount()}
          >
            Add account
          </button>
        )}
        {account && (
          <>
            <span className={styles.accountName}>
              <span className={styles.swatch} style={{ backgroundColor: account.color }} />
              {account.email || 'New account'}
            </span>
            <button
              type="button"
              className={styles.button}
              onClick={() => window.shifted.removeAccount(account.id)}
            >
              Remove account
            </button>
          </>
        )}
      </header>
      <main ref={contentAreaRef} className={styles.contentArea}>
        {state && <ContentMessage account={account} />}
      </main>
    </div>
  )
}

export default App
