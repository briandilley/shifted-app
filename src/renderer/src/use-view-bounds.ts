import { useEffect, useRef, type RefObject } from 'react'

/**
 * Tell Shifted where the Google page of this window shows: at the bounds of the element
 * that gets the returned ref. Shifted puts the `WebContentsView` of the Google page there.
 */
export function useViewBounds<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const report = (): void => {
      const rect = element.getBoundingClientRect()
      window.shifted.setViewBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [])

  return ref
}
