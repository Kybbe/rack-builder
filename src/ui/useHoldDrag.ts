import { useEffect, useRef } from 'react'

/** How long a finger must rest on a card before it is picked up, and how far it may wander meanwhile. */
export const HOLD_MS = 350
const SLOP_PX = 8

/**
 * Press and hold to pick something up with a finger. A swipe has to keep scrolling the list, so the drag only
 * starts once the finger has rested; after that the list is kept still for the rest of the gesture.
 */
export function useHoldDrag<T extends HTMLElement>(start: () => void, enabled: boolean) {
  const ref = useRef<T>(null)
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout>; held: boolean } | null>(
    null,
  )
  const startRef = useRef(start)
  startRef.current = start

  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Scrolling can only be refused from a listener that is not passive, which React's own are.
    const still = (e: TouchEvent) => {
      if (press.current?.held) e.preventDefault()
    }
    el.addEventListener('touchmove', still, { passive: false })
    return () => {
      el.removeEventListener('touchmove', still)
      cancel()
    }
  }, [])

  return {
    ref,
    onPointerDown: (e: React.PointerEvent) => {
      if (!enabled || e.pointerType !== 'touch') return
      cancel()
      const p = {
        x: e.clientX,
        y: e.clientY,
        held: false,
        timer: setTimeout(() => {
          p.held = true
          navigator.vibrate?.(8)
          startRef.current()
        }, HOLD_MS),
      }
      press.current = p
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current
      if (p && !p.held && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP_PX) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    // Android answers a long press with a context menu.
    onContextMenu: (e: React.MouseEvent) => {
      if (press.current) e.preventDefault()
    },
  }
}
