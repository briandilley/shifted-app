import { useEffect, useState, type CSSProperties } from 'react'
import type { ImportPreview, ImportPreviewAccount, ImportReadResult } from '../../shared/api'
import { textColorOn } from './account-display'
import controls from './controls.module.css'
import styles from './ImportScreen.module.css'

/** What the import window shows: the file and the text box, or what will change. */
type Step = { kind: 'input'; error: string | null } | { kind: 'preview'; preview: ImportPreview }

/** The date of the export, for example "21 October 2026", or `null`. */
function exportDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
}

/** One account of the preview: a circle in the account color, the name, and the address. */
function PreviewAccountName({ account }: { account: ImportPreviewAccount }): React.JSX.Element {
  const letter = (Array.from((account.email || account.nickname).trim())[0] ?? '').toUpperCase()
  return (
    <span className={styles.account}>
      <span
        className={styles.avatar}
        style={
          {
            '--account-color': account.color,
            color: textColorOn(account.color)
          } as CSSProperties
        }
        aria-hidden="true"
      >
        {letter}
      </span>
      <span className={styles.names}>
        <span className={styles.name}>{account.nickname || account.email || 'New account'}</span>
        {account.nickname && account.email && (
          <span className={styles.address}>{account.email}</span>
        )}
      </span>
    </span>
  )
}

/** What the import will change, before the person confirms. */
function PreviewList({ preview }: { preview: ImportPreview }): React.JSX.Element {
  const date = exportDate(preview.exportedAt)
  const empty =
    preview.addedAccounts.length === 0 &&
    preview.changedAccounts.length === 0 &&
    preview.generalChanges.length === 0
  return (
    <div className={styles.preview} data-import-preview>
      {date && <p className={styles.note}>Exported on {date}.</p>}
      {empty && <p>This configuration changes nothing on this computer.</p>}
      {preview.addedAccounts.length > 0 && (
        <section aria-labelledby="added-accounts">
          <h2 id="added-accounts" className={styles.sectionTitle}>
            New accounts
          </h2>
          <ul className={styles.list}>
            {preview.addedAccounts.map((account, index) => (
              <li key={`${account.email}-${index}`}>
                <PreviewAccountName account={account} />
              </li>
            ))}
          </ul>
          <p className={styles.note}>
            Sign-ins never move. After the import, each new account shows a Sign in button.
          </p>
        </section>
      )}
      {preview.changedAccounts.length > 0 && (
        <section aria-labelledby="changed-accounts">
          <h2 id="changed-accounts" className={styles.sectionTitle}>
            Changed accounts
          </h2>
          <ul className={styles.list}>
            {preview.changedAccounts.map((account) => (
              <li key={account.email}>
                <PreviewAccountName account={account} />
                <ul className={styles.changes}>
                  {account.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
      {preview.generalChanges.length > 0 && (
        <section aria-labelledby="general-changes">
          <h2 id="general-changes" className={styles.sectionTitle}>
            General
          </h2>
          <ul className={styles.changes}>
            {preview.generalChanges.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </section>
      )}
      {preview.unchangedAccounts > 0 && (
        <p className={styles.note}>
          {preview.unchangedAccounts === 1
            ? '1 account on this computer stays as it is.'
            : `${preview.unchangedAccounts} accounts on this computer stay as they are.`}
        </p>
      )}
    </div>
  )
}

/**
 * The import window: choose the exported file, or paste the message of "Email it to
 * myself". Then it shows what will change, and the import starts only after a click on
 * Import. Escape closes the window and changes nothing.
 */
function ImportScreen(): React.JSX.Element {
  const [text, setText] = useState('')
  const [step, setStep] = useState<Step>({ kind: 'input', error: null })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        window.shifted.cancelImport()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const read = (start: () => Promise<ImportReadResult>): void => {
    setBusy(true)
    start()
      .then((result) => {
        if (result.kind === 'preview') setStep({ kind: 'preview', preview: result.preview })
        else if (result.kind === 'error') setStep({ kind: 'input', error: result.message })
      })
      .catch((error: unknown) => {
        console.error('Shifted could not read the configuration:', error)
      })
      .finally(() => setBusy(false))
  }

  if (step.kind === 'preview') {
    const empty =
      step.preview.addedAccounts.length === 0 &&
      step.preview.changedAccounts.length === 0 &&
      step.preview.generalChanges.length === 0
    return (
      <div className={styles.window}>
        <header className={styles.header}>
          <h1 className={styles.title}>Import configuration</h1>
          <p className={styles.note}>Check what will change. Nothing changes until you import.</p>
        </header>
        <div className={styles.card}>
          <PreviewList preview={step.preview} />
        </div>
        <footer className={styles.footer}>
          <button
            type="button"
            className={controls.secondaryButton}
            onClick={() => setStep({ kind: 'input', error: null })}
          >
            Back
          </button>
          <button
            type="button"
            className={controls.primaryButton}
            disabled={empty}
            onClick={() => window.shifted.confirmImport()}
          >
            Import
          </button>
        </footer>
      </div>
    )
  }

  return (
    <div className={styles.window}>
      <header className={styles.header}>
        <h1 className={styles.title}>Import configuration</h1>
        <p className={styles.note}>
          Choose the file that you exported, or paste the whole message that you emailed to
          yourself.
        </p>
      </header>
      <div className={styles.card}>
        <div className={styles.input}>
          <div>
            <button
              type="button"
              className={controls.secondaryButton}
              disabled={busy}
              onClick={() => read(() => window.shifted.chooseImportFile())}
            >
              Choose file…
            </button>
          </div>
          <label htmlFor="import-text" className={styles.sectionTitle}>
            Or paste the message
          </label>
          <textarea
            id="import-text"
            className={styles.textBox}
            value={text}
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
          />
          {step.error && (
            <p className={styles.error} role="alert">
              {step.error}
            </p>
          )}
        </div>
      </div>
      <footer className={styles.footer}>
        <button
          type="button"
          className={controls.secondaryButton}
          onClick={() => window.shifted.cancelImport()}
        >
          Cancel
        </button>
        <button
          type="button"
          className={controls.primaryButton}
          disabled={busy || text.trim() === ''}
          onClick={() => read(() => window.shifted.readImportText(text))}
        >
          Continue
        </button>
      </footer>
    </div>
  )
}

export default ImportScreen
