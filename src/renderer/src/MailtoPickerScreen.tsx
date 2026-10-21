import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AccountState, AccountStatus, MailtoPickerInfo } from '../../shared/api'
import { accountLabel, accountName, accountTitle } from './account-display'
import Avatar from './Avatar'
import controls from './controls.module.css'
import styles from './MailtoPickerScreen.module.css'
import { useShiftedState } from './use-shifted-state'

/** The status that an account that is not signed in shows in the list. */
const STATUS_NAMES: Readonly<Record<AccountStatus, string>> = {
  'signed-in': '',
  'signing-in': 'Signing in',
  'signed-out': 'Signed out',
  'not-signed-in': 'Not signed in'
}

/**
 * The account picker: which account writes the new message of a `mailto:` link from
 * another app. Click an account to choose it. Enter chooses the selected account, the
 * arrow keys move the selection, and Escape closes the picker.
 */
function MailtoPickerScreen(): React.JSX.Element {
  const state = useShiftedState()
  const [info, setInfo] = useState<MailtoPickerInfo | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [always, setAlways] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    let active = true
    const show = (next: MailtoPickerInfo): void => {
      if (!active) return
      setInfo(next)
      setSelectedId(next.selectedAccountId)
    }
    const stop = window.shifted.onMailtoPickerChanged(show)
    window.shifted
      .getMailtoPicker()
      .then(show)
      .catch((error: unknown) => {
        console.error('Shifted could not read the account picker:', error)
      })
    return () => {
      active = false
      stop()
    }
  }, [])

  const accounts = state?.accounts ?? []
  const selected = accounts.find((account) => account.id === selectedId) ?? accounts[0]

  // The selected account has the keyboard focus, so that Enter and the arrow keys work.
  const ready = state !== null && info !== null
  const focusId = selected?.id
  useEffect(() => {
    if (!ready || !focusId) return
    listRef.current?.querySelector<HTMLButtonElement>(`[data-account-id="${focusId}"]`)?.focus()
  }, [ready, focusId, info])

  const choose = (account: AccountState | undefined): void => {
    if (account) window.shifted.chooseMailtoAccount(account.id, always)
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      window.shifted.cancelMailtoPicker()
      return
    }
    if (event.key === 'Enter') {
      // A focused button does its own work: an account chooses itself, Cancel cancels.
      if (event.target instanceof HTMLButtonElement) return
      event.preventDefault()
      choose(selected)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (accounts.length === 0) return
      const index = selected ? accounts.indexOf(selected) : -1
      const step = event.key === 'ArrowDown' ? 1 : -1
      const next = accounts[(index + step + accounts.length) % accounts.length]
      if (next) setSelectedId(next.id)
    }
  }

  return (
    <div className={styles.window} onKeyDown={onKeyDown}>
      <header className={styles.header}>
        <h1 className={styles.title} title={info?.heading}>
          {info?.heading ?? ''}
        </h1>
        <p className={styles.note}>Choose the account that writes the message.</p>
      </header>
      <div className={styles.card}>
        <ul ref={listRef} className={styles.accounts} role="listbox" aria-label="Accounts">
          {accounts.map((account) => (
            <li key={account.id} role="presentation">
              <button
                type="button"
                role="option"
                className={styles.account}
                data-account-id={account.id}
                aria-selected={account === selected}
                aria-label={accountLabel(account)}
                tabIndex={account === selected ? 0 : -1}
                style={{ '--account-color': account.color } as CSSProperties}
                onFocus={() => setSelectedId(account.id)}
                onClick={() => choose(account)}
              >
                <Avatar account={account} size={36} />
                <span className={styles.names}>
                  <span className={styles.name}>{accountTitle(account)}</span>
                  {account.nickname && (
                    <span className={styles.address}>{accountName(account)}</span>
                  )}
                </span>
                {account.status !== 'signed-in' && (
                  <span className={styles.status}>{STATUS_NAMES[account.status]}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <footer className={styles.footer}>
        <label className={styles.always}>
          <input
            type="checkbox"
            checked={always}
            onChange={(event) => setAlways(event.target.checked)}
          />
          Always use this account
        </label>
        <button
          type="button"
          className={controls.secondaryButton}
          onClick={() => window.shifted.cancelMailtoPicker()}
        >
          Cancel
        </button>
      </footer>
    </div>
  )
}

export default MailtoPickerScreen
