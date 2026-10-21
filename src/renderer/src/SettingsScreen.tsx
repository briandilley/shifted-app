import { useEffect, useRef, useState } from 'react'
import {
  ACCOUNT_COLORS,
  accountSettingsPage,
  isSameColor,
  MAX_NICKNAME_LENGTH,
  parseSettingsRequest,
  settingsPageAccountId,
  type AccountState,
  type SettingsFocus,
  type SettingsRequest
} from '../../shared/api'
import { accountName, accountTitle, colorName } from './account-display'
import Avatar from './Avatar'
import styles from './SettingsScreen.module.css'
import { useShiftedState } from './use-shifted-state'

/** The page that the URL hash asks for when the window opens. */
function initialRequest(): SettingsRequest {
  return parseSettingsRequest(window.location.hash) ?? { page: 'general' }
}

interface AccountPageProps {
  account: AccountState
  focus: SettingsFocus | undefined
  /** Changes each time Shifted asks for this page, so that the focus moves again. */
  requestId: number
}

/** The page of one account: nickname, color, Sign out, and Remove. */
function AccountPage({ account, focus, requestId }: AccountPageProps): React.JSX.Element {
  // The field keeps what you type. Shifted saves the trimmed nickname at once.
  const [nickname, setNickname] = useState(account.nickname)
  const nicknameRef = useRef<HTMLInputElement>(null)
  const colorsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focus === 'nickname') {
      nicknameRef.current?.focus()
      nicknameRef.current?.select()
    } else if (focus === 'color') {
      colorsRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
    }
  }, [focus, requestId])

  const nicknameId = `nickname-${account.id}`
  return (
    <section className={styles.page} aria-labelledby="page-title">
      <header className={styles.accountHeader}>
        <Avatar account={account} size={48} />
        <div className={styles.accountNames}>
          <h1 id="page-title" className={styles.title}>
            {accountTitle(account)}
          </h1>
          {account.nickname && <p className={styles.address}>{accountName(account)}</p>}
        </div>
      </header>

      <div className={styles.field}>
        <label htmlFor={nicknameId} className={styles.label}>
          Nickname
        </label>
        <input
          ref={nicknameRef}
          id={nicknameId}
          className={styles.input}
          type="text"
          value={nickname}
          maxLength={MAX_NICKNAME_LENGTH}
          placeholder={accountName(account)}
          spellCheck={false}
          onChange={(event) => {
            setNickname(event.target.value)
            window.shifted.setNickname(account.id, event.target.value)
          }}
        />
      </div>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Color</legend>
        <div ref={colorsRef} className={styles.colors}>
          {ACCOUNT_COLORS.map((color) => (
            <label key={color} className={styles.swatch} title={colorName(color)}>
              <input
                type="radio"
                name={`color-${account.id}`}
                className={styles.swatchInput}
                value={color}
                aria-label={colorName(color)}
                checked={isSameColor(account.color, color)}
                onChange={() => window.shifted.setColor(account.id, color)}
              />
              <span className={styles.swatchColor} style={{ backgroundColor: color }} />
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          disabled={account.status !== 'signed-in'}
          onClick={() => window.shifted.signOut(account.id)}
        >
          Sign out
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.danger}`}
          onClick={() => window.shifted.removeAccount(account.id)}
        >
          Remove
        </button>
      </div>
    </section>
  )
}

/** A page that later prompts fill. */
function EmptyPage({ title }: { title: string }): React.JSX.Element {
  return (
    <section className={styles.page} aria-labelledby="page-title">
      <h1 id="page-title" className={styles.title}>
        {title}
      </h1>
    </section>
  )
}

/** The configuration window: a list of pages on the left, and the page on the right. */
function SettingsScreen(): React.JSX.Element {
  const state = useShiftedState()
  const [request, setRequest] = useState(() => ({ ...initialRequest(), id: 0 }))

  useEffect(
    () =>
      window.shifted.onShowSettingsPage((next) => {
        const valid = parseSettingsRequest(next)
        if (valid) setRequest((current) => ({ ...valid, id: current.id + 1 }))
      }),
    []
  )

  const accounts = state?.accounts ?? []
  const pageAccountId = settingsPageAccountId(request.page)
  const pageAccount = accounts.find((account) => account.id === pageAccountId)
  // A removed account has no page. Show General in its place.
  const page = pageAccountId && state && !pageAccount ? 'general' : request.page

  const show = (next: SettingsRequest['page']): void => {
    setRequest((current) => ({ page: next, id: current.id + 1 }))
  }

  const entry = (
    target: SettingsRequest['page'],
    content: React.ReactNode,
    label?: string
  ): React.JSX.Element => (
    <li>
      <button
        type="button"
        className={styles.entry}
        aria-current={page === target ? 'page' : undefined}
        aria-label={label}
        onClick={() => show(target)}
      >
        {content}
      </button>
    </li>
  )

  return (
    <div className={styles.window}>
      <nav className={styles.list} aria-label="Settings pages">
        <ul className={styles.entries}>
          {entry('general', 'General')}
          {entry('notifications', 'Notifications')}
        </ul>
        {accounts.length > 0 && <hr className={styles.separator} />}
        <ul className={styles.entries} aria-label="Accounts">
          {accounts.map((account) =>
            entry(
              accountSettingsPage(account.id),
              <>
                <Avatar account={account} size={24} />
                <span className={styles.entryName}>{accountTitle(account)}</span>
              </>,
              accountTitle(account)
            )
          )}
        </ul>
      </nav>
      <main className={styles.content}>
        {state &&
          (pageAccount ? (
            <AccountPage
              key={pageAccount.id}
              account={pageAccount}
              focus={request.focus}
              requestId={request.id}
            />
          ) : page === 'notifications' ? (
            <EmptyPage title="Notifications" />
          ) : (
            <EmptyPage title="General" />
          ))}
      </main>
    </div>
  )
}

export default SettingsScreen
