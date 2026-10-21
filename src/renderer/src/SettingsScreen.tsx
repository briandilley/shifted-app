import { useEffect, useRef, useState } from 'react'
import {
  ACCOUNT_COLORS,
  ASKED_PERMISSION_NAMES,
  ASKED_PERMISSIONS,
  accountSettingsPage,
  isSameColor,
  isTimeOfDay,
  isUnreadCountSource,
  MAX_NICKNAME_LENGTH,
  NOTIFICATION_KIND_NAMES,
  NOTIFICATION_KINDS,
  parseSettingsRequest,
  settingsPageAccountId,
  UNREAD_COUNT_SOURCE_NAMES,
  UNREAD_COUNT_SOURCES,
  WEEKDAYS,
  type AccountState,
  type GeneralConfig,
  type QuietHours,
  type SettingsFocus,
  type SettingsRequest,
  type ShiftedState,
  type Snooze
} from '../../shared/api'
import { accountName, accountTitle, colorName } from './account-display'
import Avatar from './Avatar'
import controls from './controls.module.css'
import styles from './SettingsScreen.module.css'
import { useBackdrop } from './use-color-mode'
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
  const notificationsRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (focus === 'nickname') {
      nicknameRef.current?.focus()
      nicknameRef.current?.select()
    } else if (focus === 'color') {
      colorsRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
    } else if (focus === 'notifications') {
      notificationsRef.current?.scrollIntoView({ block: 'start' })
      notificationsRef.current?.querySelector<HTMLInputElement>('input')?.focus()
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
          className={controls.textField}
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

      <UnreadCountSourceField account={account} />

      <NotificationSwitchesField account={account} sectionRef={notificationsRef} />

      <QuietHoursField account={account} />

      <PagePermissionsField account={account} />

      <div className={styles.actions}>
        <button
          type="button"
          className={controls.secondaryButton}
          disabled={account.status !== 'signed-in'}
          onClick={() => window.shifted.signOut(account.id)}
        >
          Sign out
        </button>
        <button
          type="button"
          className={controls.secondaryButton}
          onClick={() => window.shifted.removeAccount(account.id)}
        >
          Remove
        </button>
      </div>
    </section>
  )
}

/** What "Automatic" does now, below the "Unread count source" field. */
function automaticNote(account: AccountState): string {
  const feed = UNREAD_COUNT_SOURCE_NAMES[account.unreadFeed]
  return account.automaticFeedLearned
    ? `Shifted found that Gmail counts ${feed === 'Primary' ? 'the Primary tab' : 'the whole inbox'}, and reads that count.`
    : 'Shifted compares the number next to Inbox in Gmail with its feeds the next time Gmail loads. Until then, it counts the Primary tab.'
}

/** "Unread count source": where the unread count of the account comes from. */
function UnreadCountSourceField({ account }: { account: AccountState }): React.JSX.Element {
  const id = `unread-source-${account.id}`
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        Unread count source
      </label>
      <select
        id={id}
        className={controls.select}
        value={account.unreadCountSource}
        onChange={(event) => {
          const source = event.target.value
          if (isUnreadCountSource(source)) window.shifted.setUnreadCountSource(account.id, source)
        }}
      >
        {UNREAD_COUNT_SOURCES.map((source) => (
          <option key={source} value={source}>
            {UNREAD_COUNT_SOURCE_NAMES[source]}
          </option>
        ))}
      </select>
      <p className={styles.note}>
        {account.unreadCountSource === 'automatic'
          ? automaticNote(account)
          : 'The badge counts the unread messages of this feed. Choose Automatic to match the number next to Inbox in Gmail.'}
      </p>
    </div>
  )
}

interface NotificationSwitchesFieldProps {
  account: AccountState
  sectionRef: React.RefObject<HTMLElement | null>
}

/**
 * The three notification switches of an account: new mail, Calendar, and Chat. Only this
 * page changes them, so the switches keep their own state and save each change at once.
 */
function NotificationSwitchesField({
  account,
  sectionRef
}: NotificationSwitchesFieldProps): React.JSX.Element {
  const [switches, setSwitches] = useState(account.notifications)
  const headingId = `notifications-${account.id}`
  return (
    <section ref={sectionRef} className={styles.field} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.label}>
        Notifications
      </h2>
      {NOTIFICATION_KINDS.map((kind) => (
        <label key={kind} className={styles.switch}>
          <input
            type="checkbox"
            role="switch"
            className={controls.toggle}
            checked={switches[kind]}
            onChange={(event) => {
              const on = event.target.checked
              setSwitches((current) => ({ ...current, [kind]: on }))
              window.shifted.setNotificationSwitch(account.id, kind, on)
            }}
          />
          {NOTIFICATION_KIND_NAMES[kind]}
        </label>
      ))}
    </section>
  )
}

/**
 * The quiet hours of an account: on or off, a daily range, and the days that are quiet
 * all day.
 */
function QuietHoursField({ account }: { account: AccountState }): React.JSX.Element {
  // Only this page changes the quiet hours, so the fields keep their own state, and each
  // change saves the whole value at once.
  const [quietHours, setQuietHours] = useState(account.quietHours)
  // The time fields keep what you type. Shifted saves a time when it is complete.
  const [start, setStart] = useState(quietHours.start)
  const [end, setEnd] = useState(quietHours.end)

  const save = (change: Partial<QuietHours>): void => {
    const next = { ...quietHours, ...change }
    setQuietHours(next)
    window.shifted.setQuietHours(account.id, next)
  }
  const toggleDay = (day: number, on: boolean): void => {
    const days = on ? [...quietHours.days, day] : quietHours.days.filter((d) => d !== day)
    save({ days: days.sort((a, b) => a - b) })
  }

  const headingId = `quiet-hours-${account.id}`
  const startId = `quiet-start-${account.id}`
  const endId = `quiet-end-${account.id}`
  return (
    <section className={styles.field} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.label}>
        Quiet hours
      </h2>
      <label className={styles.switch}>
        <input
          type="checkbox"
          role="switch"
          className={controls.toggle}
          checked={quietHours.enabled}
          onChange={(event) => save({ enabled: event.target.checked })}
        />
        Quiet hours
      </label>
      <fieldset className={styles.quietHours} disabled={!quietHours.enabled}>
        <div className={styles.timeRange}>
          <label htmlFor={startId}>Quiet every day from</label>
          <input
            id={startId}
            className={controls.textField}
            type="time"
            value={start}
            required
            onChange={(event) => {
              setStart(event.target.value)
              if (isTimeOfDay(event.target.value)) save({ start: event.target.value })
            }}
          />
          <label htmlFor={endId}>to</label>
          <input
            id={endId}
            className={controls.textField}
            type="time"
            value={end}
            required
            onChange={(event) => {
              setEnd(event.target.value)
              if (isTimeOfDay(event.target.value)) save({ end: event.target.value })
            }}
          />
        </div>
        <div className={styles.weekdays} role="group" aria-label="Quiet all day on">
          <span className={styles.weekdaysLabel}>Quiet all day on</span>
          {WEEKDAYS.map(({ day, name, short }) => (
            <label key={day} className={styles.weekday} title={name}>
              <input
                type="checkbox"
                aria-label={name}
                checked={quietHours.days.includes(day)}
                onChange={(event) => toggleDay(day, event.target.checked)}
              />
              {short}
            </label>
          ))}
        </div>
      </fieldset>
      <p className={styles.note}>
        While quiet hours are on, this account shows no notifications in the time range and on the
        days that you choose. The range can cross midnight, for example 22:00 to 07:00. A
        notification that quiet hours stop does not show later. The unread badge keeps updating.
      </p>
    </section>
  )
}

/** The text of the snooze state, for example "Snoozed until 14:30". */
function snoozeText(snooze: Snooze | null): string {
  if (!snooze) return 'Notifications are on. Snooze is off.'
  if (snooze.until === null) return 'Snoozed until you turn it off.'
  const end = new Date(snooze.until)
  const time = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const sameDay = end.toDateString() === new Date().toDateString()
  const day = sameDay ? '' : `${end.toLocaleDateString([], { weekday: 'long' })} `
  return `Snoozed until ${day}${time}.`
}

/** The Notifications page: the snooze state, and a note about Gmail's own notifications. */
function NotificationsPage({ snooze }: { snooze: Snooze | null }): React.JSX.Element {
  return (
    <section className={styles.page} aria-labelledby="page-title">
      <h1 id="page-title" className={styles.title}>
        Notifications
      </h1>
      <div className={styles.field}>
        <span className={styles.label}>Snooze</span>
        <p className={styles.snoozeState} data-snooze-state>
          {snoozeText(snooze)}
        </p>
        <div>
          <button
            type="button"
            className={controls.secondaryButton}
            disabled={snooze === null}
            onClick={() => window.shifted.stopSnooze()}
          >
            Stop snooze
          </button>
        </div>
        <p className={styles.note}>
          Snooze stops the notifications of all accounts. To snooze, press{' '}
          {window.shifted.platform === 'darwin'
            ? 'Cmd+Shift+S, or use Snooze in the Shifted menu.'
            : 'Ctrl+Shift+S, or use Snooze in the File menu.'}
        </p>
      </div>
      <div className={styles.field}>
        <span className={styles.label}>Gmail&apos;s own notifications</span>
        <p className={styles.note}>
          Keep Gmail&apos;s own desktop notifications for new mail off. Shifted already shows them.
        </p>
      </div>
    </section>
  )
}

/** The saved answers to the page permissions of an account, and the reset button. */
function PagePermissionsField({ account }: { account: AccountState }): React.JSX.Element {
  const saved = ASKED_PERMISSIONS.filter((permission) => account.pagePermissions[permission])
  return (
    <section className={styles.field} aria-labelledby={`permissions-${account.id}`}>
      <h2 id={`permissions-${account.id}`} className={styles.label}>
        Page permissions
      </h2>
      {saved.length === 0 ? (
        <p className={styles.note}>
          No saved answers. Shifted asks the first time a page asks for the camera and microphone,
          screen sharing, or the clipboard.
        </p>
      ) : (
        <ul className={styles.permissions}>
          {saved.map((permission) => (
            <li key={permission}>
              {ASKED_PERMISSION_NAMES[permission]}:{' '}
              {account.pagePermissions[permission] === 'allow' ? 'Allowed' : 'Denied'}
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          type="button"
          className={controls.secondaryButton}
          disabled={saved.length === 0}
          onClick={() => window.shifted.resetPagePermissions(account.id)}
        >
          Reset page permissions
        </button>
      </div>
    </section>
  )
}

/** The text next to the "Make Shifted the default email app" button. */
function defaultEmailAppText(isDefault: boolean | null): string {
  if (isDefault === null) return ''
  return isDefault ? 'Shifted is the default email app.' : 'Shifted is not the default email app.'
}

/** "Make Shifted the default email app", and whether it is the default now. */
function DefaultEmailAppField(): React.JSX.Element {
  const [isDefault, setIsDefault] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const check = (): void => {
      window.shifted
        .isDefaultEmailApp()
        .then((value) => {
          if (active) setIsDefault(value)
        })
        .catch((error: unknown) => {
          console.error('Shifted could not check the default email app:', error)
        })
    }
    check()
    // On Windows, the person chooses Shifted in the settings of Windows. Check again when
    // the configuration window comes back to the front.
    window.addEventListener('focus', check)
    return () => {
      active = false
      window.removeEventListener('focus', check)
    }
  }, [])

  const makeDefault = (): void => {
    setBusy(true)
    window.shifted
      .makeDefaultEmailApp()
      .then((value) => setIsDefault(value))
      .catch((error: unknown) => {
        console.error('Shifted could not become the default email app:', error)
      })
      .finally(() => setBusy(false))
  }

  return (
    <div className={styles.field}>
      <span className={styles.label}>Default email app</span>
      <div className={styles.row}>
        <button
          type="button"
          className={controls.secondaryButton}
          disabled={busy}
          onClick={makeDefault}
        >
          Make Shifted the default email app
        </button>
        <span className={styles.note} data-default-email-app role="status">
          {defaultEmailAppText(isDefault)}
        </span>
      </div>
      <p className={styles.note}>
        {window.shifted.platform === 'win32'
          ? 'Windows opens its Default apps page. Choose Shifted for email links (MAILTO) there.'
          : 'Email links from other apps then open a new message in Shifted.'}
      </p>
    </div>
  )
}

/** The "Always use this account" choice of the account picker, and the button that clears it. */
function MailtoDefaultField({ state }: { state: ShiftedState }): React.JSX.Element {
  const account = state.accounts.find((candidate) => candidate.id === state.mailtoDefaultAccountId)
  return (
    <div className={styles.field}>
      <span className={styles.label}>Account picker</span>
      <p className={styles.note} data-mailto-default>
        {account
          ? `Email links from other apps always use ${accountTitle(account)}.`
          : 'Shifted asks which account to use for each email link from another app.'}
      </p>
      <div>
        <button
          type="button"
          className={controls.secondaryButton}
          disabled={!account}
          onClick={() => window.shifted.clearMailtoDefault()}
        >
          Clear the always-use account
        </button>
      </div>
    </div>
  )
}

/** The General page. */
function GeneralPage({ state }: { state: ShiftedState }): React.JSX.Element {
  const general: GeneralConfig = state.general
  return (
    <section className={styles.page} aria-labelledby="page-title">
      <h1 id="page-title" className={styles.title}>
        General
      </h1>
      <div className={styles.field}>
        <span className={styles.label}>Downloads</span>
        <label className={styles.switch}>
          <input
            type="checkbox"
            role="switch"
            className={controls.toggle}
            checked={general.askWhereToSave}
            onChange={(event) => window.shifted.setAskWhereToSave(event.target.checked)}
          />
          Ask where to save each file
        </label>
        <p className={styles.note}>
          When this is off, Shifted saves each download in your Downloads folder.
        </p>
      </div>
      <DefaultEmailAppField />
      <MailtoDefaultField state={state} />
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

  // The backdrop is --base on General and Notifications. On the page of an account, it
  // has the tint of that account.
  const backdrop = useBackdrop(pageAccount?.color ?? null)

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
    <div className={styles.window} style={{ backgroundColor: backdrop }} data-backdrop={backdrop}>
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
            <NotificationsPage snooze={state.snooze} />
          ) : (
            <GeneralPage state={state} />
          ))}
      </main>
    </div>
  )
}

export default SettingsScreen
