import type { Issue, Placement, Rack, ShelfChild } from './types'
import { getItem } from '../catalog'
import {
  SHELF_CHILD_GAP_MM,
  childSize,
  shelfIssues,
  shelfUsableWidth,
  updatePlacement,
  type ChangeResult,
} from './placement'

export interface ShelfSlot {
  childId: string
  itemId: string
  /** Left edge, measured from the left edge of the usable shelf width. */
  xMm: number
  widthMm: number
  heightMm: number
  depthMm: number
}

export interface ShelfLayout {
  fits: boolean
  usableMm: number
  usedMm: number
  slots: ShelfSlot[]
  errors: Issue[]
  warnings: Issue[]
}

/** Where each loose device stands on a shelf: side by side, centred as a group. */
export function shelfLayout(shelf: Placement, rack: Rack): ShelfLayout {
  const item = getItem(shelf.itemId)
  if (!item?.isShelf) {
    return { fits: false, usableMm: 0, usedMm: 0, slots: [], errors: [], warnings: [] }
  }
  const usableMm = shelfUsableWidth(item, rack)
  const { errors, warnings, usedMm } = shelfIssues(shelf, rack)
  const slots: ShelfSlot[] = []
  const sizes = (shelf.children ?? []).flatMap((c) => {
    const ci = getItem(c.itemId)
    return ci ? [{ c, s: childSize(ci, c.orientation) }] : []
  })
  // Spread evenly: the same gap at both edges and between devices, but never less than the minimum between two.
  const sumW = sizes.reduce((t, x) => t + x.s.widthMm, 0)
  const n = sizes.length
  const between = n > 1 ? Math.max(SHELF_CHILD_GAP_MM, (usableMm - sumW) / (n + 1)) : 0
  let x = Math.max(0, (usableMm - sumW - between * (n - 1)) / 2)
  for (const { c, s } of sizes) {
    slots.push({ childId: c.id, itemId: c.itemId, xMm: x, ...s })
    x += s.widthMm + between
  }
  return { fits: errors.length === 0, usableMm, usedMm, slots, errors, warnings }
}

let counter = 0
const newId = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`

export function addToShelf(
  rack: Rack,
  placements: Placement[],
  shelfId: string,
  itemId: string,
  opts: { orientation?: ShelfChild['orientation']; childId?: string } = {},
): ChangeResult {
  const shelf = placements.find((p) => p.id === shelfId)
  const shelfItem = shelf && getItem(shelf.itemId)
  if (!shelf || !shelfItem?.isShelf) {
    return {
      ok: false,
      errors: [
        {
          code: 'not-a-shelf',
          message: 'Loose devices can only be dropped on a shelf.',
          placementId: shelfId,
        },
      ],
      warnings: [],
      placements,
    }
  }
  const child: ShelfChild = { id: opts.childId ?? newId(), itemId, orientation: opts.orientation ?? 'flat' }
  return updatePlacement(rack, placements, { ...shelf, children: [...(shelf.children ?? []), child] })
}

export function removeFromShelf(placements: Placement[], shelfId: string, childId: string): Placement[] {
  return placements.map((p) =>
    p.id === shelfId ? { ...p, children: (p.children ?? []).filter((c) => c.id !== childId) } : p,
  )
}

export function setChildOrientation(
  rack: Rack,
  placements: Placement[],
  shelfId: string,
  childId: string,
  orientation: ShelfChild['orientation'],
): ChangeResult {
  const shelf = placements.find((p) => p.id === shelfId)
  if (!shelf) return { ok: false, errors: [], warnings: [], placements }
  return updatePlacement(rack, placements, {
    ...shelf,
    children: (shelf.children ?? []).map((c) => (c.id === childId ? { ...c, orientation } : c)),
  })
}
