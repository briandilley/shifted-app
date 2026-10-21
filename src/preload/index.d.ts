import type { ShiftedApi } from '../shared/api'

declare global {
  interface Window {
    /** The functions that the preload script gives to the screens of Shifted. */
    shifted: ShiftedApi
  }
}
