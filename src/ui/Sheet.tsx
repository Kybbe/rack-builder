import { useEffect, useReducer, useRef } from 'react'
import { Drawer } from 'vaul'
import { useStore } from '../state/store'
import { getItem } from '../catalog'
import { CablePending } from './CablesPanel'
import { InspectorBody } from './Inspector'
import { Panels, TabList } from './Panels'
import { sheetView, stepSheet, type Snap } from './sheetRules'

/** Height of the sheet at each stop. Vaul takes pixels or a share of the window height. */
const POINT: Record<Snap, string | number> = { peek: '84px', half: 0.55, full: 0.92 }
const POINTS = [POINT.peek, POINT.half, POINT.full]
const snapOf = (v: string | number | null): Snap =>
  v === POINT.full ? 'full' : v === POINT.half ? 'half' : 'peek'

/**
 * The side panel on a phone: a sheet that is always there, peeking under the rack. It holds the tabs and
 * their panels, and turns into the inspector while a device or cable is selected.
 */
export function Sheet() {
  const selected = useStore((s) => !!s.selectedCableId || s.placements.some((p) => p.id === s.selectedId))
  const selectedName = useStore((s) => {
    const p = s.placements.find((x) => x.id === s.selectedId)
    return p ? getItem(p.itemId)?.name : s.selectedCableId ? 'Cable' : undefined
  })
  const pendingCable = useStore((s) => !!s.pendingPort)
  // Only a drag out of the list needs the sheet out of the way; moving a device already in the rack does not.
  const dragging = useStore((s) => !!s.drag && !s.drag.moveId)
  const tab = useStore((s) => s.tab)
  const [state, dispatch] = useReducer(stepSheet, { snap: 'peek' })
  const view = sheetView({ selected, pendingCable })
  const busy = dragging || (pendingCable && !selected)

  // Only a change is an event; the first render (and StrictMode's repeat of it) is not.
  const was = useRef({ selected, busy, tab })
  useEffect(() => {
    const w = was.current
    was.current = { selected, busy, tab }
    if (w.busy !== busy && busy) dispatch({ type: 'busy' })
    if (w.selected !== selected) dispatch({ type: selected ? 'select' : 'deselect' })
    if (w.busy !== busy && !busy) dispatch({ type: 'idle' })
    if (w.tab !== tab) dispatch({ type: 'tab' })
  }, [selected, busy, tab])

  // The 3D view shrinks to the part the sheet leaves free, so the rack stays whole while the list is open.
  useEffect(() => {
    document.documentElement.dataset.sheet = state.snap
    return () => void delete document.documentElement.dataset.sheet
  }, [state.snap])

  const back = () => {
    useStore.getState().select(null)
    useStore.getState().selectCable(null)
  }

  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      handleOnly
      noBodyStyles
      snapPoints={POINTS}
      activeSnapPoint={POINT[state.snap]}
      setActiveSnapPoint={(v) => dispatch({ type: 'user', snap: snapOf(v) })}
    >
      <Drawer.Portal>
        <Drawer.Content
          className="sheet"
          data-snap={state.snap}
          data-view={view}
          aria-describedby={undefined}
          // The sheet is part of the page, not a dialog that takes focus away from it.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Drawer.Handle className="sheet__handle" />
          <Drawer.Title className="sr-only">Equipment and settings</Drawer.Title>
          <div className="sheet__head">
            {view === 'inspector' ? (
              <button type="button" className="sheet__back" onClick={back}>
                <span aria-hidden>‹</span> Back to the list
                <span className="sheet__what">{selectedName}</span>
              </button>
            ) : view === 'cable-prompt' ? (
              <CablePending />
            ) : (
              // Tapping the tab that is already chosen still means "show me this".
              <div className="sheet__tabs" onClick={() => dispatch({ type: 'tab' })}>
                <TabList />
              </div>
            )}
          </div>
          {/* While a card is being dragged out, its list stays in the page (only out of sight), so the
              gesture that started on it is not cut off. */}
          <div className="sheet__body" inert={state.snap === 'peek' && !dragging}>
            {view === 'inspector' ? <InspectorBody /> : <Panels />}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
