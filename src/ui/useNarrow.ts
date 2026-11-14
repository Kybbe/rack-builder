import { useEffect, useState } from 'react'

/** Below this width the side panel becomes a bottom sheet. Keep in step with the media query in styles.css. */
export const NARROW = '(max-width: 900px)'

export function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(NARROW).matches)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const m = matchMedia(NARROW)
    const on = () => setNarrow(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

/** The same answer outside a component. */
export const narrowNow = () => typeof matchMedia !== 'undefined' && matchMedia(NARROW).matches

/** True when the main pointer is a finger: targets get bigger, and there is no hover. */
export function isCoarse() {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
}
