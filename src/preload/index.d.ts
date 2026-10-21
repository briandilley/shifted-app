export {}

declare global {
  interface Window {
    /** The functions that the preload script gives to the screens of Shifted. */
    shifted: Readonly<Record<string, never>>
  }
}
