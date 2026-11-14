/** Rules for the bottom sheet that replaces the side panel on a phone. Pure, so they are tested without a browser. */

export type Snap = 'peek' | 'half' | 'full'
export type SheetView = 'panel' | 'inspector' | 'cable-prompt'

export interface SheetState {
  snap: Snap
  /** Height to return to when the selection is cleared. */
  beforeSelect?: Snap
  /** Height to return to when a drag or a half-made cable is over. */
  beforeBusy?: Snap
}

export type SheetEvent =
  | { type: 'select' }
  | { type: 'deselect' }
  /** Something needs the 3D view: equipment is being dragged in, or a cable waits for its other end. */
  | { type: 'busy' }
  | { type: 'idle' }
  | { type: 'tab' }
  /** The user dragged the sheet themselves. */
  | { type: 'user'; snap: Snap }

export function sheetView(s: { selected: boolean; pendingCable: boolean }): SheetView {
  if (s.selected) return 'inspector'
  return s.pendingCable ? 'cable-prompt' : 'panel'
}

export function stepSheet(s: SheetState, e: SheetEvent): SheetState {
  switch (e.type) {
    case 'select':
      // A selection made during a drag (the thing just dropped) wins over going back to the list height.
      if (s.beforeBusy !== undefined) return { snap: 'half', beforeSelect: 'peek' }
      if (s.snap !== 'peek') return s
      return { ...s, snap: 'half', beforeSelect: 'peek' }
    case 'deselect':
      if (s.beforeSelect === undefined) return s
      return { snap: s.beforeSelect }
    case 'busy':
      if (s.beforeBusy !== undefined) return s
      return { snap: 'peek', beforeBusy: s.snap }
    case 'idle':
      if (s.beforeBusy === undefined) return s
      return { snap: s.beforeBusy }
    case 'tab':
      return s.snap === 'peek' ? { snap: 'half' } : s
    case 'user':
      return { snap: e.snap }
  }
}
