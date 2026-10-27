import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { FindResult } from '../../shared/api'
import { FIND } from '../strings'
import styles from './FindScreen.module.css'

export default function FindScreen(): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [result, setResult] = useState<FindResult | null>(null)

  useEffect(() => {
    const focus = (): void => {
      input.current?.focus()
      input.current?.select()
    }
    focus()
    const stopFocus = window.shifted.onFocusFind(focus)
    const stopResults = window.shifted.onFindResult(setResult)
    return () => {
      stopFocus()
      stopResults()
    }
  }, [])

  const move = (direction: 'next' | 'previous'): void => {
    if (text) window.shifted.findInPage(text, direction)
  }
  const status = !text
    ? ''
    : result?.text !== text
      ? FIND.searching
      : result.matches === 0
        ? FIND.noMatches
        : FIND.count(result.activeMatchOrdinal, result.matches)

  return (
    <div
      className={styles.bar}
      role="search"
      aria-label={FIND.label}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          window.shifted.closeFind()
        }
      }}
    >
      <input
        ref={input}
        aria-label={FIND.label}
        placeholder={FIND.label}
        value={text}
        maxLength={4096}
        onChange={(event) => {
          const value = event.target.value
          setText(value)
          setResult(null)
          window.shifted.findInPage(value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            move(event.shiftKey ? 'previous' : 'next')
          }
        }}
      />
      <span className={styles.status} role="status" aria-live="polite">
        {status}
      </span>
      <button
        aria-label={FIND.previous}
        title={FIND.previous}
        disabled={!text}
        onClick={() => move('previous')}
      >
        <ChevronUp size={16} strokeWidth={1.75} />
      </button>
      <button
        aria-label={FIND.next}
        title={FIND.next}
        disabled={!text}
        onClick={() => move('next')}
      >
        <ChevronDown size={16} strokeWidth={1.75} />
      </button>
      <button aria-label={FIND.close} title={FIND.close} onClick={() => window.shifted.closeFind()}>
        <X size={16} strokeWidth={1.75} />
      </button>
    </div>
  )
}
