import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
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
import { CATALOG, getItem, RACK_PRODUCTS } from '../catalog'

export type ViewPreset = 'iso' | 'front' | 'rear' | 'side' | 'top'
export type Look = 'cad' | 'real'
export type Theme = 'dark' | 'light'
export type Tab = 'build' | 'plan' | 'print'

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
  // not saved
  paletteOpen: boolean
  selectedId: string | null
  view: { preset: ViewPreset; nonce: number }
  drag: DragSource | null
  ghost: DropTarget | null
  past: Layout[]

  setRack: (patch: Partial<Rack>) => CheckResult
  applyRackProduct: (productId: string) => CheckResult
  add: (itemId: string, u: number, side: Side, config?: Configurable) => CheckResult & { id?: string }
  addAuto: (itemId: string) => CheckResult & { id?: string }
  move: (id: string, u: number, side: Side) => CheckResult
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
        | 'paletteOpen'
      >
    >,
  ) => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Apply a change to the equipment list and remember the old state for undo. */
      const commit = (r: CheckResult & { placements: Placement[] }): CheckResult => {
        if (r.ok && r.placements !== get().placements) {
          const { rack, placements, past } = get()
          set({ placements: r.placements, past: [...past.slice(-49), { rack, placements }] })
        }
        return { ok: r.ok, errors: r.errors, warnings: r.warnings }
      }
      const snapshot = () => {
        const { rack, placements, past } = get()
        return [...past.slice(-49), { rack, placements }]
      }

      return {
        rack: DEFAULT_RACK,
        placements: [],
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
        paletteOpen: false,
        selectedId: null,
        view: { preset: 'iso', nonce: 0 },
        drag: null,
        ghost: null,
        past: [],

        setRack: (patch) => {
          const next: Rack = { ...get().rack, ...patch }
          // A hand-edited rack is no longer the bought product, unless the product itself was just chosen.
          if (!('productId' in patch) && (patch.standard || patch.heightU || patch.depthMm || patch.style))
            delete next.productId
          if (next.style === 'wall') next.casters = false
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
          return get().setRack({
            standard: p.standard,
            heightU: p.heightU,
            depthMm: p.depthMm,
            style: p.style,
            casters: p.casters ?? false,
            productId: p.id,
          })
        },

        add: (itemId, u, side, config) => {
          const item = getItem(itemId)
          const id = newId()
          const r = commit(
            addPlacement(get().rack, get().placements, {
              id,
              itemId,
              u,
              side,
              ...(config || item?.configurable ? { config: config ?? item!.configurable } : {}),
            }),
          )
          if (r.ok) set({ selectedId: id })
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
                set({ selectedId: p.id })
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

        move: (id, u, side) => commit(movePlacement(get().rack, get().placements, id, u, side)),

        remove: (id) => {
          const { placements, selectedId } = get()
          if (!placements.some((p) => p.id === id)) return
          set({
            placements: removePlacement(placements, id),
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
          if (r.ok) set({ selectedId: copy.id })
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
          if (r.ok) set({ selectedId: candidate.id })
          return r
        },

        setSideWidth: (px) => set({ sideWidth: Math.round(Math.min(720, Math.max(260, px))) }),

        removeChild: (shelfId, childId) =>
          set({ placements: removeFromShelf(get().placements, shelfId, childId), past: snapshot() }),

        setChildOrientation: (shelfId, childId, o) =>
          commit(setChildOrientation(get().rack, get().placements, shelfId, childId, o)),

        drop: (target, src) => {
          if (!target.ok) return { ok: false, errors: target.issues, warnings: [] }
          if (target.kind === 'shelf' && target.shelfId) {
            const r = get().addChild(target.shelfId, src.itemId)
            if (r.ok) set({ selectedId: target.shelfId })
            return r
          }
          if (src.moveId) return get().move(src.moveId, target.u, target.side)
          return get().add(src.itemId, target.u, target.side, src.config)
        },

        load: (layout) =>
          set({ rack: layout.rack, placements: layout.placements, past: snapshot(), selectedId: null }),

        clear: () => set({ placements: [], past: snapshot(), selectedId: null }),

        undo: () => {
          const { past } = get()
          const last = past[past.length - 1]
          if (!last) return false
          set({ rack: last.rack, placements: last.placements, past: past.slice(0, -1), selectedId: null })
          return true
        },

        select: (selectedId) => set({ selectedId }),
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
      }),
    },
  ),
)
