import { describe, expect, it } from 'vitest'
import { pressAction, tapHandlers } from './touch'

describe('pressing a device in the rack', () => {
  it('a mouse press selects and grabs it at once, as before', () => {
    expect(pressAction({ pointerType: 'mouse', selected: false })).toBe('grab')
    expect(pressAction({ pointerType: 'mouse', selected: true })).toBe('grab')
    expect(pressAction({ pointerType: 'pen', selected: false })).toBe('grab')
  })
  it('a finger on a device that is not selected leaves the gesture to the camera', () => {
    expect(pressAction({ pointerType: 'touch', selected: false })).toBe('orbit')
  })
  it('a finger on the selected device grabs it so it can be dragged', () => {
    expect(pressAction({ pointerType: 'touch', selected: true })).toBe('grab')
  })
})

describe('choosing something in the 3D view', () => {
  const ev = (pointerType: string, button = 0) => ({ pointerType, button, stopPropagation: () => {} })

  it('reacts to a mouse press straight away', () => {
    let n = 0
    const h = tapHandlers(() => n++)
    h.onPointerDown(ev('mouse'))
    expect(n).toBe(1)
    h.onClick(ev('mouse'))
    expect(n).toBe(1)
  })
  it('waits for a finger to lift, so starting to orbit on top of it chooses nothing', () => {
    let n = 0
    const h = tapHandlers(() => n++)
    h.onPointerDown(ev('touch'))
    expect(n).toBe(0)
    h.onClick(ev('touch'))
    expect(n).toBe(1)
  })
  it('still knows it was a finger when the click does not say so, as in Safari', () => {
    let n = 0
    const h = tapHandlers(() => n++)
    h.onPointerDown(ev('touch'))
    h.onClick({ button: 0, stopPropagation: () => {} })
    expect(n).toBe(1)
  })
  it('ignores the right mouse button', () => {
    let n = 0
    tapHandlers(() => n++).onPointerDown(ev('mouse', 2))
    expect(n).toBe(0)
  })
})
