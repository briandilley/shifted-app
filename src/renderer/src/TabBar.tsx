import { GOOGLE_APPS, type AccountState } from '../../shared/api'
import { GOOGLE_APP_NAMES } from './account-display'
import styles from './TabBar.module.css'

/** The tab bar: one tab for each Google app of the selected account. */
function TabBar({ account }: { account: AccountState | undefined }): React.JSX.Element {
  return (
    <div className={styles.tabBar}>
      {account && (
        <div className={styles.tabs} role="tablist" aria-label="Google apps">
          {GOOGLE_APPS.map((googleApp) => {
            const selected = account.lastGoogleApp === googleApp
            return (
              <button
                key={googleApp}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={selected}
                onClick={() => window.shifted.selectGoogleApp(googleApp)}
              >
                {GOOGLE_APP_NAMES[googleApp]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default TabBar
