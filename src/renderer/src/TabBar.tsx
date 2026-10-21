import { useRef } from 'react'
import { GOOGLE_APPS, type AccountState, type GoogleApp } from '../../shared/api'
import { GOOGLE_APP_NAMES, MAIN } from '../strings'
import styles from './TabBar.module.css'

/**
 * The tab bar: one folder tab for each Google app of the selected account, on the top
 * edge of the content area. The active tab joins the content area.
 *
 * It follows the tabs pattern of ARIA: the tab list is one stop of the Tab key, and the
 * Left and Right arrow keys (and Home and End) select the other tab.
 */
function TabBar({ account }: { account: AccountState | undefined }): React.JSX.Element | null {
  const tabs = useRef(new Map<GoogleApp, HTMLButtonElement>())
  if (!account) return null

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, googleApp: GoogleApp): void => {
    const index = GOOGLE_APPS.indexOf(googleApp)
    const last = GOOGLE_APPS.length - 1
    let next: number
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else return
    event.preventDefault()
    const target = GOOGLE_APPS[next]
    if (!target) return
    tabs.current.get(target)?.focus()
    window.shifted.selectGoogleApp(target)
  }

  return (
    <div className={styles.tabs} role="tablist" aria-label={MAIN.googleAppsLabel}>
      {GOOGLE_APPS.map((googleApp) => {
        const selected = account.lastGoogleApp === googleApp
        return (
          <button
            key={googleApp}
            ref={(element) => {
              if (element) tabs.current.set(googleApp, element)
              else tabs.current.delete(googleApp)
            }}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => window.shifted.selectGoogleApp(googleApp)}
            onKeyDown={(event) => onKeyDown(event, googleApp)}
          >
            {GOOGLE_APP_NAMES[googleApp]}
          </button>
        )
      })}
    </div>
  )
}

export default TabBar
