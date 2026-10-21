import { useEffect, useState } from 'react'
import type { ShiftedState } from '../../shared/api'

/** The state of Shifted, or `null` until the main process sends it. */
export function useShiftedState(): ShiftedState | null {
  const [state, setState] = useState<ShiftedState | null>(null)

  useEffect(() => {
    let active = true
    const stop = window.shifted.onStateChanged((next) => {
      if (active) setState(next)
    })
    window.shifted
      .getState()
      .then((initial) => {
        if (active) setState(initial)
      })
      .catch((error: unknown) => {
        console.error('Shifted could not read its state:', error)
      })
    return () => {
      active = false
      stop()
    }
  }, [])

  return state
}
