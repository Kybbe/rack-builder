import type { Configurable, Issue, Placement, Rack, Side } from './types'
import { RACK_STANDARDS, U_MM } from './units'
import { checkPlacement, occupiedRange, resolvePlacement } from './placement'
import { addToShelf } from './shelf'
import { getItem } from '../catalog'

/** Sizes of the drawn rack frame, in mm. Origin: floor level, centre of the rack. */
export interface RackGeometry {
  panelW: number
  openingW: number
  railW: number
  outerW: number
  capMm: number
  baseY: number
  /** Y of the bottom edge of U1. */
  u1Y: number
  totalH: number
  frontZ: number
  rearZ: number
}

export function rackGeometry(rack: Rack): RackGeometry {
  const s = RACK_STANDARDS[rack.standard]
  const railW = (s.panelWidthMm - s.openingMm) / 2
  const capMm = 20
  const baseY = rack.style === 'wall' ? 0 : rack.casters ? 58 : 12
  return {
    panelW: s.panelWidthMm,
    openingW: s.openingMm,
    railW,
    outerW: s.panelWidthMm + 26,
    capMm,
    baseY,
    u1Y: baseY + capMm,
    totalH: baseY + capMm * 2 + rack.heightU * U_MM,
    frontZ: rack.depthMm / 2,
    rearZ: -rack.depthMm / 2,
  }
}

export const yOfU = (rack: Rack, u: number) => rackGeometry(rack).u1Y + (u - 1) * U_MM

/** What is being dragged: a new item from the catalog, or a device already in the rack. */
export interface DragSource {
  itemId: string
  config?: Configurable
  moveId?: string
}

export interface DropTarget {
  kind: 'rail' | 'shelf'
  u: number
  heightU: number
  side: Side
  ok: boolean
  issues: Issue[]
  shelfId?: string
}

/** Where a dragged thing would land if dropped at height yMm on the given face of the rack. */
export function dropTarget(
  rack: Rack,
  placements: Placement[],
  src: DragSource,
  yMm: number,
  side: Side,
): DropTarget | null {
  const item = getItem(src.itemId)
  if (!item) return null
  const unitsUp = (yMm - rackGeometry(rack).u1Y) / U_MM

  if (item.mount === 'shelf') {
    const cursorU = Math.floor(unitsUp) + 1
    const shelf = placements.find((p) => {
      if (p.side !== side || !getItem(p.itemId)?.isShelf) return false
      const r = occupiedRange(p, rack)
      if (cursorU >= r.from && cursorU <= r.to) return true
      // The unit right above a shelf is where its devices stand, so it counts too while nothing is mounted there.
      return (
        cursorU === r.to + 1 &&
        !placements.some((o) => {
          if (o.id === p.id || o.side !== side) return false
          const or = occupiedRange(o, rack)
          return cursorU >= or.from && cursorU <= or.to
        })
      )
    })
    if (!shelf) {
      const u = Math.min(Math.max(cursorU, 1), rack.heightU)
      return {
        kind: 'rail',
        u,
        heightU: 1,
        side,
        ok: false,
        issues: [
          {
            code: 'needs-shelf',
            message: `${item.name} has no rack ears. Put a shelf in the rack and drop it on that.`,
          },
        ],
      }
    }
    const r = addToShelf(rack, placements, shelf.id, item.id, { childId: '__ghost' })
    const after = r.ok ? r.placements.find((p) => p.id === shelf.id)! : shelf
    return {
      kind: 'shelf',
      shelfId: shelf.id,
      u: shelf.u,
      heightU: resolvePlacement(after, rack)?.heightU ?? 1,
      side,
      ok: r.ok,
      issues: [...r.errors, ...r.warnings],
    }
  }

  const existing = src.moveId ? placements.find((p) => p.id === src.moveId) : undefined
  const candidate: Placement = existing
    ? { ...existing, side }
    : { id: '__ghost', itemId: item.id, u: 1, side, config: src.config ?? item.configurable }
  const h = resolvePlacement(candidate, rack)?.heightU ?? 1
  const maxU = Math.max(1, rack.heightU - h + 1)
  const u = Math.min(Math.max(Math.round(unitsUp - h / 2) + 1, 1), maxU)
  const r = checkPlacement(rack, placements, { ...candidate, u }, { ignoreId: src.moveId })
  return { kind: 'rail', u, heightU: h, side, ok: r.ok, issues: [...r.errors, ...r.warnings] }
}
