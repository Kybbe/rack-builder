/** How presses in the 3D view differ between a mouse and a finger. */

/**
 * A finger has one gesture for everything, so on touch a device is only grabbed once it is selected;
 * otherwise the press belongs to the camera and the rack can be orbited by touching anywhere.
 */
export function pressAction(p: { pointerType: string; selected: boolean }): 'grab' | 'orbit' {
  return p.pointerType === 'touch' && !p.selected ? 'orbit' : 'grab'
}

/**
 * What the latest press was made with. A click does not say: in Safari it is a plain mouse event with no
 * pointer type, so the press before it has to be remembered.
 */
let lastPress = 'mouse'
export const notePress = (pointerType: string) => {
  lastPress = pointerType
}
export const lastPressWasTouch = () => lastPress === 'touch'
if (typeof window !== 'undefined')
  window.addEventListener('pointerdown', (e) => notePress(e.pointerType), true)

interface PressEvent {
  pointerType: string
  button: number
  stopPropagation: () => void
}

/**
 * Handlers that choose something: on press for a mouse (it feels immediate), on tap for a finger
 * (a press may be the start of orbiting, and must not select what happens to be under it).
 */
export function tapHandlers<E extends PressEvent>(choose: (e: E) => void) {
  return {
    onPointerDown: (e: E) => {
      notePress(e.pointerType)
      if (e.button !== 0 || e.pointerType === 'touch') return
      e.stopPropagation()
      choose(e)
    },
    onClick: (e: Omit<E, 'pointerType'>) => {
      if (!lastPressWasTouch()) return
      e.stopPropagation()
      choose(e as E)
    },
  }
}
