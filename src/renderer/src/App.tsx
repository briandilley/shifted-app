import styles from './App.module.css'

function App(): React.JSX.Element {
  return (
    <main className={styles.empty}>
      <p className={styles.message}>No accounts yet</p>
    </main>
  )
}

export default App
