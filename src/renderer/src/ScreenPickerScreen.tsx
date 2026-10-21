import { useEffect, useState } from 'react'
import type { ScreenPickerInfo } from '../../shared/api'
import styles from './ScreenPickerScreen.module.css'

/**
 * The screen picker: the screens and windows that a page of an account can share. Click
 * one to share it. Cancel or Escape shares nothing.
 */
function ScreenPickerScreen(): React.JSX.Element {
  const [info, setInfo] = useState<ScreenPickerInfo | null>(null)

  useEffect(() => {
    let active = true
    window.shifted
      .getScreenSources()
      .then((next) => {
        if (active) setInfo(next)
      })
      .catch((error: unknown) => {
        console.error('Shifted could not list the screens:', error)
      })
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') window.shifted.chooseScreenSource(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      active = false
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const groups = [
    { kind: 'screen' as const, title: 'Screens' },
    { kind: 'window' as const, title: 'Windows' }
  ]

  return (
    <div className={styles.window}>
      <header className={styles.header}>
        <h1 className={styles.title}>Share your screen</h1>
        {info && (
          <p className={styles.note}>
            A page of {info.accountName} asks to share. Choose a screen or a window.
          </p>
        )}
      </header>
      <main className={styles.content}>
        {info?.sources.length === 0 && <p className={styles.note}>Nothing to share.</p>}
        {groups.map(({ kind, title }) => {
          const sources = info?.sources.filter((source) => source.kind === kind) ?? []
          if (sources.length === 0) return null
          return (
            <section key={kind} aria-label={title}>
              <h2 className={styles.groupTitle}>{title}</h2>
              <ul className={styles.sources}>
                {sources.map((source) => (
                  <li key={source.id}>
                    <button
                      type="button"
                      className={styles.source}
                      onClick={() => window.shifted.chooseScreenSource(source.id)}
                    >
                      {source.thumbnail ? (
                        <img className={styles.thumbnail} src={source.thumbnail} alt="" />
                      ) : (
                        <span className={styles.thumbnail} />
                      )}
                      <span className={styles.name}>{source.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </main>
      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.button}
          onClick={() => window.shifted.chooseScreenSource(null)}
        >
          Cancel
        </button>
      </footer>
    </div>
  )
}

export default ScreenPickerScreen
