import type { Configurable, Issue, Placement, Rack, Side } from './types'
import { RACK_STANDARDS, U_MM } from './units'
import { HOLE_SHIFT_MM, bottomMm, checkPlacement, resolvePlacement } from './placement'
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
  /** Started by pressing and holding a card with a finger, so it is followed with pointer events. */
  held?: boolean
}

export interface DropTarget {
  kind: 'rail' | 'shelf'
  u: number
  heightU: number
  side: Side
  ok: boolean
  issues: Issue[]
  shelfId?: string
  /** Holes above the unit grid, when hole snapping is on. */
  hole?: 1 | 2
}

/** Where a dragged thing would land if dropped at height yMm on the given face of the rack. */
export function dropTarget(
  rack: Rack,
  placements: Placement[],
  src: DragSource,
  yMm: number,
  side: Side,
  opts: { holes?: boolean } = {},
): DropTarget | null {
  const item = getItem(src.itemId)
  if (!item) return null
  const unitsUp = (yMm - rackGeometry(rack).u1Y) / U_MM

  if (item.mount === 'shelf') {
    const cursorU = Math.floor(unitsUp) + 1
    const at = unitsUp * U_MM
    const span = (p: Placement) => {
      const b = bottomMm(p)
      return { from: b, to: b + (resolvePlacement(p, rack)?.heightU ?? 1) * U_MM }
    }
    const shelf = placements.find((p) => {
      if (p.side !== side || !getItem(p.itemId)?.isShelf) return false
      const r = span(p)
      if (at >= r.from && at < r.to) return true
      // The unit right above a shelf is where its devices stand, so it counts too while nothing is mounted there.
      return (
        at >= r.to &&
        at < r.to + U_MM &&
        !placements.some((o) => {
          if (o.id === p.id || o.side !== side) return false
          const or = span(o)
          return at >= or.from && at < or.to
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
      ...(shelf.hole ? { hole: shelf.hole } : {}),
    }
  }

  const existing = src.moveId ? placements.find((p) => p.id === src.moveId) : undefined
  const candidate: Placement = existing
    ? { ...existing, side }
    : { id: '__ghost', itemId: item.id, u: 1, side, config: src.config ?? item.configurable }
  const h = resolvePlacement(candidate, rack)?.heightU ?? 1
  const maxU = Math.max(1, rack.heightU - h + 1)
  let u = Math.min(Math.max(Math.round(unitsUp - h / 2) + 1, 1), maxU)
  let hole: 0 | 1 | 2 = 0
  if (opts.holes) {
    // Nearest mounting hole to where the bottom edge would be, kept inside the rack.
    const wanted = (unitsUp - h / 2) * U_MM
    let best = Infinity
    for (let cu = 1; cu <= maxU; cu++) {
      for (const ch of [0, 1, 2] as const) {
        if (cu === maxU && ch > 0) continue
        const d = Math.abs((cu - 1) * U_MM + HOLE_SHIFT_MM[ch] - wanted)
        if (d < best) [best, u, hole] = [d, cu, ch]
      }
    }
  }
  const placed: Placement = { ...candidate, u }
  if (hole) placed.hole = hole
  else delete placed.hole
  const r = checkPlacement(rack, placements, placed, { ignoreId: src.moveId })
  return {
    kind: 'rail',
    u,
    heightU: h,
    side,
    ok: r.ok,
    issues: [...r.errors, ...r.warnings],
    ...(hole ? { hole } : {}),
  }
}
