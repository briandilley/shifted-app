import { useEffect, useState } from 'react'
import type { ImportPreview, ImportReadResult } from '../../shared/api'
import controls from './controls.module.css'
import styles from './ImportScreen.module.css'

/** What the import window shows: the file and the text box, or the list of changes. */
type Step = { kind: 'input'; error: string | null } | { kind: 'preview'; preview: ImportPreview }

/** The date of the export, for example "October 21, 2026", or `null`. */
function exportDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
}

/** The list of changes that the import makes, before the person confirms. */
function ChangeList({ preview }: { preview: ImportPreview }): React.JSX.Element {
  const date = exportDate(preview.exportedAt)
  return (
    <div className={styles.preview} data-import-preview>
      {date && <p className={styles.note}>Exported on {date}.</p>}
      {preview.changes.length === 0 ? (
        <p>This configuration changes nothing on this computer.</p>
      ) : (
        <ul className={styles.changes} aria-label="Changes">
          {preview.changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      )}
      <p className={styles.note}>
        Accounts on this computer keep their sign-ins. Each new account shows a Sign in button after
        the import.
      </p>
    </div>
  )
}

/**
 * The import window: choose the exported file, or paste the message of "Email it to
 * myself". Then it shows the list of changes, and the import starts only after a click
 * on Import. Cancel and Escape close the window and change nothing.
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

  const cancel = (
    <button
      type="button"
      className={controls.secondaryButton}
      onClick={() => window.shifted.cancelImport()}
    >
      Cancel
    </button>
  )

  if (step.kind === 'preview') {
    return (
      <div className={styles.window}>
        <header className={styles.header}>
          <h1 className={styles.title}>Import configuration</h1>
          <p className={styles.note}>Check what will change. Nothing changes until you import.</p>
        </header>
        <div className={styles.card}>
          <ChangeList preview={step.preview} />
        </div>
        <footer className={styles.footer}>
          {cancel}
          <button
            type="button"
            className={controls.primaryButton}
            disabled={step.preview.changes.length === 0}
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
        {cancel}
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
