import { useEffect, useState } from 'react'
import type { MemoryUse } from '../../shared/api'
import { GOOGLE_APP_NAMES, MEMORY } from '../strings'
import styles from './MemoryScreen.module.css'

/** How often the window reads the memory again. */
const REFRESH_MS = 2000

/**
 * The "Memory use" window of the Help menu: a small table with each account, each Google
 * app, and its memory, from `app.getAppMetrics()`. A Google app that is asleep has no
 * process and shows "Asleep".
 */
function MemoryScreen(): React.JSX.Element {
  const [use, setUse] = useState<MemoryUse | null>(null)

  useEffect(() => {
    let active = true
    const read = (): void => {
      window.shifted
        .getMemoryUse()
        .then((next) => {
          if (active) setUse(next)
        })
        .catch((error: unknown) => {
          console.error('Shifted could not read the memory use:', error)
        })
    }
    read()
    const timer = setInterval(read, REFRESH_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  return (
    <div className={styles.window}>
      <header className={styles.header}>
        <h1 className={styles.title}>{MEMORY.title}</h1>
        <p className={styles.note}>{MEMORY.note}</p>
      </header>
      <div className={styles.card}>
        {use && (
          <table className={styles.table} data-memory-table>
            <thead>
              <tr>
                <th scope="col">{MEMORY.account}</th>
                <th scope="col">{MEMORY.googleApp}</th>
                <th scope="col" className={styles.number}>
                  {MEMORY.memory}
                </th>
              </tr>
            </thead>
            <tbody>
              {use.rows.map((row, index) => (
                <tr key={`${index} ${row.googleApp}`}>
                  <td>{row.accountName}</td>
                  <td>{GOOGLE_APP_NAMES[row.googleApp]}</td>
                  <td className={`${styles.number} ${row.kilobytes === null ? styles.asleep : ''}`}>
                    {row.kilobytes === null ? MEMORY.asleep : MEMORY.megabytes(row.kilobytes)}
                  </td>
                </tr>
              ))}
              {use.rows.length === 0 && (
                <tr>
                  <td colSpan={3} className={styles.asleep}>
                    {MEMORY.noAccounts}
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={2}>{MEMORY.other}</td>
                <td className={styles.number}>{MEMORY.megabytes(use.otherKilobytes)}</td>
              </tr>
              <tr className={styles.total}>
                <td colSpan={2}>{MEMORY.total}</td>
                <td className={styles.number} data-memory-total>
                  {MEMORY.megabytes(use.totalKilobytes)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default MemoryScreen
