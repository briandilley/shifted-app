import type { AccountState } from '../../shared/api'
import styles from './App.module.css'
import Sidebar from './Sidebar'
import TabBar from './TabBar'
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
    case 'signed-in':
      // The view of the Google app covers the content area.
      return <></>
  }
}

/** The main window: the sidebar, the tab bar, and the content area. */
function App(): React.JSX.Element {
  const state = useShiftedState()
  const contentAreaRef = useViewBounds<HTMLElement>()
  const account = state?.accounts.find((candidate) => candidate.id === state.selectedAccountId)

  return (
    <div className={styles.window}>
      <Sidebar
        accounts={state?.accounts ?? []}
        selectedAccountId={state?.selectedAccountId ?? null}
      />
      <div className={styles.right}>
        <TabBar account={account} />
        <main ref={contentAreaRef} className={styles.contentArea}>
          {state && <ContentMessage account={account} />}
        </main>
      </div>
    </div>
  )
}

export default App
