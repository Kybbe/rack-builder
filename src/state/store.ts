import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Cable,
  CableRouting,
  Configurable,
  Issue,
  Layout,
  Placement,
  Rack,
  ShelfChild,
  Side,
  UnitSystem,
} from '../domain/types'
import {
  addPlacement,
  checkPlacement,
  firstFreeU,
  movePlacement,
  removePlacement,
  updatePlacement,
  validateLayout,
  type CheckResult,
} from '../domain/placement'
import { addToShelf, removeFromShelf, setChildOrientation } from '../domain/shelf'
import type { DragSource, DropTarget } from '../domain/geometry'
import type { Wanted } from '../domain/planner'
import { WALL, connectCable, portsOf, pruneCables, updateCable, type CablePatch } from '../domain/cables'
import type { Fastening } from '../domain/printAdvisor'
import { CATALOG, getItem, RACK_PRODUCTS } from '../catalog'

export type ViewPreset = 'iso' | 'front' | 'rear' | 'side' | 'top'
export type Look = 'cad' | 'real'
export type Theme = 'dark' | 'light'
export type Tab = 'build' | 'cables' | 'plan' | 'print'
export type PlugResult = { ok: true } | { ok: false; error: string }

const HARD: Issue['code'][] = [
  'out-of-bounds',
  'overlap',
  'wrong-standard',
  'needs-shelf',
  'shelf-full',
  'not-a-shelf',
]

export const DEFAULT_RACK: Rack = { standard: '10', heightU: 8, depthMm: 260, style: 'open', casters: false }

let seq = 0
export const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`

const refused = (message: string, code: Issue['code'] = 'overlap'): CheckResult => ({
  ok: false,
  errors: [{ code, message }],
  warnings: [],
})

export interface State {
  rack: Rack
  placements: Placement[]
  cables: Cable[]
  units: UnitSystem
  look: Look
  theme: Theme
  projection: 'perspective' | 'orthographic'
  showDimensions: boolean
  showPreviews: boolean
  sideWidth: number
  sideCollapsed: boolean
  tab: Tab
  wanted: Wanted[]
  headroomPct: number
  planStandard: Rack['standard']
  printerId: string
  /** How to thread a printed rail: one choice for the whole print list. */
  fastening: Fastening
  /** Whether long cables go along the posts or straight across. */
  cableRouting: CableRouting
  /** Lets devices land on any mounting hole instead of whole units. */
  holeSnap: boolean
  // not saved
  /** A copied device, pasted with paste(). */
  clipboard: Placement | null
  paletteOpen: boolean
  selectedId: string | null
  /** The port a cable was started from, while its other end is not plugged in yet. */
  pendingPort: string | null
  selectedCableId: string | null
  view: { preset: ViewPreset; nonce: number }
  drag: DragSource | null
  ghost: DropTarget | null
  past: Layout[]

  setRack: (patch: Partial<Rack>) => CheckResult
  applyRackProduct: (productId: string) => CheckResult
  add: (
    itemId: string,
    u: number,
    side: Side,
    config?: Configurable,
    hole?: number,
  ) => CheckResult & { id?: string }
  addAuto: (itemId: string) => CheckResult & { id?: string }
  move: (id: string, u: number, side: Side, hole?: number) => CheckResult
  remove: (id: string) => void
  duplicate: (id: string) => CheckResult
  setConfig: (id: string, config: Configurable) => CheckResult
  setCadOnly: (id: string, cadOnly: boolean) => void
  addChild: (shelfId: string, itemId: string) => CheckResult
  /** Mounts a new shelf (at unit u if it is free, else in the first free units) with the device on it. */
  addOnNewShelf: (itemId: string, side: Side, u?: number) => CheckResult
  setSideWidth: (px: number) => void
  removeChild: (shelfId: string, childId: string) => void
  setChildOrientation: (shelfId: string, childId: string, o: ShelfChild['orientation']) => CheckResult
  drop: (target: DropTarget, src: DragSource) => CheckResult
  /** A click on a port while cabling: starts a cable, finishes it, or selects the cable already in that port. */
  clickPort: (portId: string) => PlugResult
  plug: (from: string, to: string) => PlugResult
  removeCable: (id: string) => void
  setCableLength: (id: string, lengthMm: number | undefined) => void
  updateCable: (id: string, patch: CablePatch) => void
  setPlacementColor: (id: string, color: string | undefined) => void
  copy: (id: string) => boolean
  paste: () => CheckResult
  /** Back to an empty default rack. Undoable. */
  reset: () => void
  selectCable: (id: string | null) => void
  cancelCable: () => void
  load: (layout: Layout) => void
  clear: () => void
  undo: () => boolean
  select: (id: string | null) => void
  setView: (preset: ViewPreset) => void
  setDrag: (drag: DragSource | null) => void
  setGhost: (ghost: DropTarget | null) => void
  want: (itemId: string, delta: number) => void
  set: (
    patch: Partial<
      Pick<
        State,
        | 'units'
        | 'look'
        | 'theme'
        | 'projection'
        | 'showDimensions'
        | 'showPreviews'
        | 'sideCollapsed'
        | 'tab'
        | 'wanted'
        | 'headroomPct'
        | 'planStandard'
        | 'printerId'
        | 'fastening'
        | 'cableRouting'
        | 'holeSnap'
        | 'paletteOpen'
      >
    >,
  ) => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const snapshot = () => {
        const { rack, placements, cables, past } = get()
        return [...past.slice(-49), { rack, placements, cables }]
      }

      /** Apply a change to the equipment list and remember the old state for undo. */
      const commit = (r: CheckResult & { placements: Placement[] }): CheckResult => {
        if (r.ok && r.placements !== get().placements) {
          const { rack, cables } = get()
          set({ placements: r.placements, cables: pruneCables(rack, r.placements, cables), past: snapshot() })
        }
        return { ok: r.ok, errors: r.errors, warnings: r.warnings }
      }

      return {
        rack: DEFAULT_RACK,
        placements: [],
        cables: [],
        units: 'mm',
        look: 'real',
        theme: 'dark',
        projection: 'perspective',
        showDimensions: true,
        showPreviews: true,
        sideWidth: 340,
        sideCollapsed: false,
        tab: 'build',
        wanted: [],
        headroomPct: 25,
        planStandard: DEFAULT_RACK.standard,
        printerId: 'bambu-p1s',
        fastening: 'inserts',
        cableRouting: 'direct',
        holeSnap: false,
        clipboard: null,
        paletteOpen: false,
        selectedId: null,
        pendingPort: null,
        selectedCableId: null,
        view: { preset: 'iso', nonce: 0 },
        drag: null,
        ghost: null,
        past: [],

        setRack: (patch) => {
          const next: Rack = { ...get().rack, ...patch }
          // A hand-edited rack is no longer the bought product, unless the product itself was just chosen.
          if (!('productId' in patch) && (patch.standard || patch.heightU || patch.depthMm || patch.style)) {
            // A modular design is still that design at another height it comes in.
            const product = RACK_PRODUCTS.find((r) => r.id === next.productId)
            const onlyHeight = !patch.standard && !patch.depthMm && !patch.style
            if (!(onlyHeight && product?.heights?.includes(next.heightU))) delete next.productId
          }
          if (next.style === 'wall') next.casters = false
          if (!next.color) delete next.color
          const blocking = validateLayout(next, get().placements).filter((i) => HARD.includes(i.code))
          if (blocking.length) {
            const n = new Set(blocking.map((b) => b.placementId)).size
            return refused(
              `${n} device${n === 1 ? '' : 's'} would not fit that rack. ${blocking[0]!.message} Move or remove ${
                n === 1 ? 'it' : 'them'
              } first.`,
            )
          }
          set({ rack: next, past: snapshot() })
          return { ok: true, errors: [], warnings: [] }
        },

        applyRackProduct: (productId) => {
          const p = RACK_PRODUCTS.find((r) => r.id === productId)
          if (!p) return refused('Unknown rack.')
          if (p.printed) set({ fastening: p.printed.fastening })
          return get().setRack({
            standard: p.standard,
            heightU: p.heightU,
            depthMm: p.depthMm,
            style: p.style,
            casters: p.casters ?? false,
            productId: p.id,
          })
        },

        add: (itemId, u, side, config, hole) => {
          const item = getItem(itemId)
          const id = newId()
          const r = commit(
            addPlacement(get().rack, get().placements, {
              id,
              itemId,
              u,
              side,
              ...(hole === 1 || hole === 2 ? { hole } : {}),
              ...(config || item?.configurable ? { config: config ?? item!.configurable } : {}),
            }),
          )
          if (r.ok) set({ selectedId: id, selectedCableId: null })
          return { ...r, id: r.ok ? id : undefined }
        },

        addAuto: (itemId) => {
          const item = getItem(itemId)
          if (!item) return refused('Unknown item.')
          const { rack, placements } = get()
          if (item.mount === 'shelf') {
            // First shelf that still has room for it.
            for (const p of placements) {
              if (!getItem(p.itemId)?.isShelf) continue
              const r = addToShelf(rack, placements, p.id, itemId)
              if (r.ok) {
                set({ selectedId: p.id, selectedCableId: null })
                return commit(r)
              }
            }
            return refused(`${item.name} needs a shelf with free room.`, 'needs-shelf')
          }
          const candidate: Placement = { id: newId(), itemId, u: 1, side: 'front', config: item.configurable }
          const u = firstFreeU(rack, placements, candidate)
          if (u === null) {
            const r = addPlacement(rack, placements, { ...candidate, u: 1 })
            return r.errors.some((e) => e.code !== 'overlap' && e.code !== 'out-of-bounds')
              ? { ok: false, errors: r.errors, warnings: r.warnings }
              : refused(`No free space for ${item.name} in this rack.`)
          }
          return get().add(itemId, u, 'front')
        },

        move: (id, u, side, hole) => commit(movePlacement(get().rack, get().placements, id, u, side, hole)),

        remove: (id) => {
          const { placements, selectedId } = get()
          if (!placements.some((p) => p.id === id)) return
          const left = removePlacement(placements, id)
          set({
            placements: left,
            cables: pruneCables(get().rack, left, get().cables),
            pendingPort: null,
            past: snapshot(),
            selectedId: selectedId === id ? null : selectedId,
          })
        },

        duplicate: (id) => {
          const { rack, placements } = get()
          const src = placements.find((p) => p.id === id)
          if (!src) return refused('Nothing to duplicate.')
          const copy: Placement = {
            ...src,
            id: newId(),
            children: src.children?.map((c) => ({ ...c, id: newId() })),
          }
          if (!copy.children) delete copy.children
          const u = firstFreeU(rack, placements, copy)
          if (u === null) return refused('No free space for a copy.')
          const r = commit(addPlacement(rack, placements, { ...copy, u }))
          if (r.ok) set({ selectedId: copy.id, selectedCableId: null })
          return r
        },

        setConfig: (id, config) => {
          const p = get().placements.find((x) => x.id === id)
          if (!p) return refused('Unknown device.')
          return commit(updatePlacement(get().rack, get().placements, { ...p, config }))
        },

        setCadOnly: (id, cadOnly) =>
          set({ placements: get().placements.map((p) => (p.id === id ? { ...p, cadOnly } : p)) }),

        addChild: (shelfId, itemId) => commit(addToShelf(get().rack, get().placements, shelfId, itemId)),

        addOnNewShelf: (itemId, side, u) => {
          const item = getItem(itemId)
          if (!item || item.mount !== 'shelf') return refused('Only loose devices go on a shelf.')
          const { rack, placements } = get()
          // The shallowest shelf of this rack width that the device does not overhang, else the deepest there is.
          const shelves = CATALOG.filter((i) => i.isShelf && i.standard === rack.standard).sort(
            (a, b) => a.depthMm - b.depthMm,
          )
          const shelf = shelves.find((x) => x.depthMm >= item.depthMm) ?? shelves.at(-1)
          if (!shelf) return refused('There is no shelf for this rack width.')
          const candidate: Placement = {
            id: newId(),
            itemId: shelf.id,
            u: u ?? 1,
            side,
            children: [{ id: newId(), itemId, orientation: 'flat' }],
          }
          const at =
            u !== undefined && checkPlacement(rack, placements, candidate).ok
              ? u
              : firstFreeU(rack, placements, candidate)
          if (at === null) return refused(`No free space for a shelf with ${item.name} on it.`)
          const r = commit(addPlacement(rack, placements, { ...candidate, u: at }))
          if (r.ok) set({ selectedId: candidate.id, selectedCableId: null })
          return r
        },

        setSideWidth: (px) => set({ sideWidth: Math.round(Math.min(720, Math.max(260, px))) }),

        removeChild: (shelfId, childId) => {
          const left = removeFromShelf(get().placements, shelfId, childId)
          set({
            placements: left,
            cables: pruneCables(get().rack, left, get().cables),
            pendingPort: null,
            past: snapshot(),
          })
        },

        setChildOrientation: (shelfId, childId, o) =>
          commit(setChildOrientation(get().rack, get().placements, shelfId, childId, o)),

        drop: (target, src) => {
          if (!target.ok) return { ok: false, errors: target.issues, warnings: [] }
          if (target.kind === 'shelf' && target.shelfId) {
            const r = get().addChild(target.shelfId, src.itemId)
            if (r.ok) set({ selectedId: target.shelfId, selectedCableId: null })
            return r
          }
          if (src.moveId) return get().move(src.moveId, target.u, target.side, target.hole)
          return get().add(src.itemId, target.u, target.side, src.config, target.hole)
        },

        clickPort: (portId) => {
          const { pendingPort, cables } = get()
          if (pendingPort === portId) {
            set({ pendingPort: null })
            return { ok: true }
          }
          if (pendingPort) return get().plug(pendingPort, portId)
          const taken = portId === WALL ? undefined : cables.find((c) => c.from === portId || c.to === portId)
          if (taken) {
            set({ selectedCableId: taken.id, selectedId: null })
            return { ok: true }
          }
          if (portId !== WALL && !portsOf(get().rack, get().placements).some((p) => p.id === portId))
            return { ok: false, error: 'That port is no longer there.' }
          set({ pendingPort: portId, selectedCableId: null })
          return { ok: true }
        },

        plug: (from, to) => {
          const { rack, placements, cables } = get()
          const r = connectCable(rack, placements, cables, from, to)
          if (!r.ok) return r
          set({
            cables: r.cables,
            past: snapshot(),
            pendingPort: null,
            selectedCableId: r.cable.id,
            selectedId: null,
          })
          return { ok: true }
        },

        removeCable: (id) => {
          const { cables, selectedCableId } = get()
          if (!cables.some((c) => c.id === id)) return
          set({
            cables: cables.filter((c) => c.id !== id),
            past: snapshot(),
            selectedCableId: selectedCableId === id ? null : selectedCableId,
          })
        },

        setCableLength: (id, lengthMm) => get().updateCable(id, { lengthMm }),

        updateCable: (id, patch) => set({ cables: updateCable(get().cables, id, patch), past: snapshot() }),

        setPlacementColor: (id, color) =>
          set({
            placements: get().placements.map((p) => {
              if (p.id !== id) return p
              const next = { ...p }
              if (color) next.color = color
              else delete next.color
              return next
            }),
            past: snapshot(),
          }),

        copy: (id) => {
          const p = get().placements.find((x) => x.id === id)
          if (p) set({ clipboard: p })
          return !!p
        },

        paste: () => {
          const { clipboard, rack, placements } = get()
          if (!clipboard) return refused('Nothing copied yet. Select a device and copy it first.')
          const copy: Placement = {
            ...clipboard,
            id: newId(),
            children: clipboard.children?.map((c) => ({ ...c, id: newId() })),
          }
          if (!copy.children) delete copy.children
          delete copy.hole
          const u = firstFreeU(rack, placements, copy)
          if (u === null)
            return refused(`No free space for another ${getItem(copy.itemId)?.name ?? 'device'}.`)
          const r = commit(addPlacement(rack, placements, { ...copy, u }))
          if (r.ok) set({ selectedId: copy.id, selectedCableId: null })
          return r
        },

        reset: () =>
          set({
            rack: { ...DEFAULT_RACK },
            placements: [],
            cables: [],
            past: snapshot(),
            selectedId: null,
            pendingPort: null,
            selectedCableId: null,
          }),

        selectCable: (selectedCableId) =>
          set(selectedCableId ? { selectedCableId, selectedId: null } : { selectedCableId }),
        cancelCable: () => set({ pendingPort: null }),

        load: (layout) =>
          set({
            rack: layout.rack,
            placements: layout.placements,
            cables: layout.cables ?? [],
            past: snapshot(),
            selectedId: null,
            pendingPort: null,
            selectedCableId: null,
          }),

        clear: () =>
          set({
            placements: [],
            cables: [],
            past: snapshot(),
            selectedId: null,
            pendingPort: null,
            selectedCableId: null,
          }),

        undo: () => {
          const { past } = get()
          const last = past[past.length - 1]
          if (!last) return false
          set({
            rack: last.rack,
            placements: last.placements,
            cables: last.cables ?? [],
            past: past.slice(0, -1),
            selectedId: null,
            pendingPort: null,
            selectedCableId: null,
          })
          return true
        },

        select: (selectedId) => set(selectedId ? { selectedId, selectedCableId: null } : { selectedId }),
        setView: (preset) => set({ view: { preset, nonce: get().view.nonce + 1 } }),
        setDrag: (drag) => set(drag ? { drag } : { drag: null, ghost: null }),
        setGhost: (ghost) => set({ ghost }),
        want: (itemId, delta) => {
          const cur = get().wanted
          const found = cur.find((w) => w.itemId === itemId)
          const qty = Math.max(0, Math.min(99, (found?.qty ?? 0) + delta))
          set({
            wanted: found
              ? cur.map((w) => (w.itemId === itemId ? { ...w, qty } : w)).filter((w) => w.qty > 0)
              : qty > 0
                ? [...cur, { itemId, qty }]
                : cur,
          })
        },
        set: (patch) => set(patch),
      }
    },
    {
      name: 'rack-builder',
      version: 1,
      partialize: (s) => ({
        rack: s.rack,
        placements: s.placements,
        cables: s.cables,
        units: s.units,
        look: s.look,
        theme: s.theme,
        projection: s.projection,
        showDimensions: s.showDimensions,
        showPreviews: s.showPreviews,
        sideWidth: s.sideWidth,
        sideCollapsed: s.sideCollapsed,
        tab: s.tab,
        wanted: s.wanted,
        headroomPct: s.headroomPct,
        planStandard: s.planStandard,
        printerId: s.printerId,
        fastening: s.fastening,
        cableRouting: s.cableRouting,
        holeSnap: s.holeSnap,
      }),
    },
  ),
)
