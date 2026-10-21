import { GOOGLE_APPS, type AccountState } from '../../shared/api'
import { GOOGLE_APP_NAMES } from './account-display'
import styles from './TabBar.module.css'

/**
 * The tab bar: one folder tab for each Google app of the selected account, on the top
 * edge of the content area. The active tab joins the content area.
 */
function TabBar({ account }: { account: AccountState | undefined }): React.JSX.Element | null {
  if (!account) return null
  return (
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
  )
}

export default TabBar
