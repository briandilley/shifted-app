import { useEffect, useRef, useState } from 'react'
import {
  ACCOUNT_COLORS,
  ASKED_PERMISSIONS,
  accountSettingsPage,
  BACKGROUND_LOADING_VALUES,
  isBackgroundLoading,
  isSameColor,
  isTimeOfDay,
  isUnreadCountSource,
  MAX_NICKNAME_LENGTH,
  NOTIFICATION_KINDS,
  parseSettingsRequest,
  settingsPageAccountId,
  UNREAD_COUNT_SOURCES,
  type AccountState,
  type GeneralConfig,
  type QuietHours,
  type SettingsFocus,
  type SettingsRequest,
  type ShiftedState,
  type Snooze
} from '../../shared/api'
import {
  ASKED_PERMISSION_NAMES,
  BACKGROUND_LOADING_NAMES,
  BACKGROUND_LOADING_NOTES,
  colorName,
  NOTIFICATION_KIND_NAMES,
  SETTINGS,
  UNREAD_COUNT_SOURCE_NAMES,
  WEEKDAYS
} from '../strings'
import { accountName, accountTitle } from './account-display'
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
          {SETTINGS.nickname}
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
        <legend className={styles.label}>{SETTINGS.color}</legend>
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
          {SETTINGS.signOut}
        </button>
        <button
          type="button"
          className={controls.secondaryButton}
          onClick={() => window.shifted.removeAccount(account.id)}
        >
          {SETTINGS.remove}
        </button>
      </div>
    </section>
  )
}

/** What "Automatic" does now, below the "Unread count source" field. */
function automaticNote(account: AccountState): string {
  return account.automaticFeedLearned
    ? SETTINGS.automaticFound(account.unreadFeed === 'primary')
    : SETTINGS.automaticLearning
}

/** "Unread count source": where the unread count of the account comes from. */
function UnreadCountSourceField({ account }: { account: AccountState }): React.JSX.Element {
  const id = `unread-source-${account.id}`
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {SETTINGS.unreadCountSource}
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
          : SETTINGS.unreadOverrideNote}
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
        {SETTINGS.notifications}
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
        {SETTINGS.quietHours}
      </h2>
      <label className={styles.switch}>
        <input
          type="checkbox"
          role="switch"
          className={controls.toggle}
          checked={quietHours.enabled}
          onChange={(event) => save({ enabled: event.target.checked })}
        />
        {SETTINGS.quietHours}
      </label>
      <fieldset className={styles.quietHours} disabled={!quietHours.enabled}>
        <div className={styles.timeRange}>
          <label htmlFor={startId}>{SETTINGS.quietFrom}</label>
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
          <label htmlFor={endId}>{SETTINGS.quietTo}</label>
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
        <div className={styles.weekdays} role="group" aria-label={SETTINGS.quietAllDayOn}>
          <span className={styles.weekdaysLabel}>{SETTINGS.quietAllDayOn}</span>
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
      <p className={styles.note}>{SETTINGS.quietHoursNote}</p>
    </section>
  )
}

/** The text of the snooze state, for example "Snoozed until 14:30". */
function snoozeText(snooze: Snooze | null): string {
  if (!snooze) return SETTINGS.snoozeOff
  if (snooze.until === null) return SETTINGS.snoozedUntilTurnedOff
  const end = new Date(snooze.until)
  const time = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const sameDay = end.toDateString() === new Date().toDateString()
  const day = sameDay ? '' : `${end.toLocaleDateString([], { weekday: 'long' })} `
  return SETTINGS.snoozedUntil(`${day}${time}`)
}

/** The Notifications page: the snooze state, and a note about Gmail's own notifications. */
function NotificationsPage({ snooze }: { snooze: Snooze | null }): React.JSX.Element {
  return (
    <section className={styles.page} aria-labelledby="page-title">
      <h1 id="page-title" className={styles.title}>
        {SETTINGS.notifications}
      </h1>
      <div className={styles.field}>
        <span className={styles.label}>{SETTINGS.snooze}</span>
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
            {SETTINGS.stopSnooze}
          </button>
        </div>
        <p className={styles.note}>{SETTINGS.snoozeNote(window.shifted.platform === 'darwin')}</p>
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{SETTINGS.gmailNotifications}</span>
        <p className={styles.note}>{SETTINGS.gmailNotificationsNote}</p>
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
        {SETTINGS.pagePermissions}
      </h2>
      {saved.length === 0 ? (
        <p className={styles.note}>{SETTINGS.noPagePermissions}</p>
      ) : (
        <ul className={styles.permissions}>
          {saved.map((permission) => (
            <li key={permission}>
              {SETTINGS.permissionAnswer(
                ASKED_PERMISSION_NAMES[permission],
                account.pagePermissions[permission] === 'allow'
              )}
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
          {SETTINGS.resetPagePermissions}
        </button>
      </div>
    </section>
  )
}

/** The text next to the "Make Shifted the default email app" button. */
function defaultEmailAppText(isDefault: boolean | null): string {
  if (isDefault === null) return ''
  return isDefault ? SETTINGS.isDefaultEmailApp : SETTINGS.isNotDefaultEmailApp
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
      <span className={styles.label}>{SETTINGS.defaultEmailApp}</span>
      <div className={styles.row}>
        <button
          type="button"
          className={controls.secondaryButton}
          disabled={busy}
          onClick={makeDefault}
        >
          {SETTINGS.makeDefaultEmailApp}
        </button>
        <span className={styles.note} data-default-email-app role="status">
          {defaultEmailAppText(isDefault)}
        </span>
      </div>
      <p className={styles.note}>
        {window.shifted.platform === 'win32'
          ? SETTINGS.defaultEmailAppNoteWindows
          : SETTINGS.defaultEmailAppNote}
      </p>
    </div>
  )
}

/** The "Always use this account" choice of the account picker, and the button that clears it. */
function MailtoDefaultField({ state }: { state: ShiftedState }): React.JSX.Element {
  const account = state.accounts.find((candidate) => candidate.id === state.mailtoDefaultAccountId)
  return (
    <div className={styles.field}>
      <span className={styles.label}>{SETTINGS.accountPicker}</span>
      <p className={styles.note} data-mailto-default>
        {account ? SETTINGS.alwaysUses(accountTitle(account)) : SETTINGS.asksEachTime}
      </p>
      <div>
        <button
          type="button"
          className={controls.secondaryButton}
          disabled={!account}
          onClick={() => window.shifted.clearMailtoDefault()}
        >
          {SETTINGS.clearAlwaysUse}
        </button>
      </div>
    </div>
  )
}

/** "Open at login" and "Background loading". */
function StartupFields({ general }: { general: GeneralConfig }): React.JSX.Element {
  return (
    <>
      <div className={styles.field}>
        <span className={styles.label}>{SETTINGS.startup}</span>
        <label className={styles.switch}>
          <input
            type="checkbox"
            role="switch"
            className={controls.toggle}
            checked={general.openAtLogin}
            onChange={(event) => window.shifted.setOpenAtLogin(event.target.checked)}
          />
          {SETTINGS.openAtLogin}
        </label>
        <p className={styles.note}>{SETTINGS.openAtLoginNote}</p>
      </div>
      <div className={styles.field}>
        <label htmlFor="background-loading" className={styles.label}>
          {SETTINGS.backgroundLoading}
        </label>
        <select
          id="background-loading"
          className={controls.select}
          value={general.backgroundLoading}
          onChange={(event) => {
            const value = event.target.value
            if (isBackgroundLoading(value)) window.shifted.setBackgroundLoading(value)
          }}
        >
          {BACKGROUND_LOADING_VALUES.map((value) => (
            <option key={value} value={value}>
              {BACKGROUND_LOADING_NAMES[value]}
            </option>
          ))}
        </select>
        <p className={styles.note}>
          {BACKGROUND_LOADING_NOTES[general.backgroundLoading]} {SETTINGS.backgroundLoadingNoteEnd}
        </p>
      </div>
    </>
  )
}

/**
 * "Export configuration…", "Email it to myself", and "Import configuration…". See "Move to
 * another computer" in docs/spec/PRODUCT.md.
 */
function MoveToAnotherComputerField({ state }: { state: ShiftedState }): React.JSX.Element {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const selected = state.accounts.find((account) => account.id === state.selectedAccountId)
  const canEmail =
    selected !== undefined && selected.email !== '' && selected.status === 'signed-in'

  const exportToFile = (): void => {
    setBusy(true)
    setStatus('')
    window.shifted
      .exportConfiguration()
      .then((result) => {
        if (result.kind === 'saved') setStatus(SETTINGS.saved(result.fileName))
        else if (result.kind === 'error') setStatus(result.message)
      })
      .catch((error: unknown) => {
        console.error('Shifted could not export the configuration:', error)
      })
      .finally(() => setBusy(false))
  }

  return (
    <div className={styles.field}>
      <span className={styles.label}>{SETTINGS.moveToAnotherComputer}</span>
      <div className={styles.row}>
        <button
          type="button"
          className={controls.secondaryButton}
          disabled={busy}
          onClick={exportToFile}
        >
          {SETTINGS.exportConfiguration}
        </button>
        <button
          type="button"
          className={controls.secondaryButton}
          disabled={!canEmail}
          onClick={() => window.shifted.emailConfiguration()}
        >
          {SETTINGS.emailItToMyself}
        </button>
        <button
          type="button"
          className={controls.secondaryButton}
          onClick={() => window.shifted.openImportWindow()}
        >
          {SETTINGS.importConfiguration}
        </button>
      </div>
      <p className={styles.note} role="status" data-export-status>
        {status}
      </p>
      <p className={styles.note}>
        {SETTINGS.moveNote}{' '}
        {canEmail ? SETTINGS.emailNote(selected.email) : SETTINGS.emailNeedsAccount}
      </p>
    </div>
  )
}

/** The General page. */
function GeneralPage({ state }: { state: ShiftedState }): React.JSX.Element {
  const general: GeneralConfig = state.general
  return (
    <section className={styles.page} aria-labelledby="page-title">
      <h1 id="page-title" className={styles.title}>
        {SETTINGS.general}
      </h1>
      <StartupFields general={general} />
      <div className={styles.field}>
        <span className={styles.label}>{SETTINGS.downloads}</span>
        <label className={styles.switch}>
          <input
            type="checkbox"
            role="switch"
            className={controls.toggle}
            checked={general.askWhereToSave}
            onChange={(event) => window.shifted.setAskWhereToSave(event.target.checked)}
          />
          {SETTINGS.askWhereToSave}
        </label>
        <p className={styles.note}>{SETTINGS.downloadsNote}</p>
      </div>
      <DefaultEmailAppField />
      <MailtoDefaultField state={state} />
      <MoveToAnotherComputerField state={state} />
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
      <nav className={styles.list} aria-label={SETTINGS.pagesLabel}>
        <ul className={styles.entries}>
          {entry('general', SETTINGS.general)}
          {entry('notifications', SETTINGS.notifications)}
        </ul>
        {accounts.length > 0 && <hr className={styles.separator} />}
        <ul className={styles.entries} aria-label={SETTINGS.accountsLabel}>
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
