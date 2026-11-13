import type { CatalogItem, Configurable, Issue, Placement, Rack, RackStandard, Side } from './types'
import { RACK_STANDARDS, U_MM } from './units'
import { getItem } from '../catalog'

/** Space lost above a shelf's own plate before a device's height starts to count. */
const SHELF_PLATE_MM = 2
const FAN_PITCH_GAP_MM = 8

/** A placement with every size worked out from its item, its settings and what sits on it. */
export interface Resolved {
  item: CatalogItem
  heightU: number
  depthMm: number
  weightKg: number
  powerW: number
  /** For configurable parts: how many fans or drives this rack width can take. */
  maxCount?: number
}

const DRIVE = {
  '3.5': { w: 101.6, h: 26.1, l: 147, kg: 0.65, watts: 8 },
  '2.5': { w: 69.85, h: 15, l: 100.5, kg: 0.12, watts: 3 },
} as const

export function effectiveStandard(item: CatalogItem, rack: Rack): RackStandard {
  return item.standard === 'both' ? rack.standard : item.standard
}

function resolveConfig(item: CatalogItem, cfg: Configurable, rack: Rack): Resolved {
  const opening = RACK_STANDARDS[effectiveStandard(item, rack)].openingMm
  if (cfg.kind === 'fanPanel') {
    const maxCount = Math.max(1, Math.floor(opening / (cfg.fanSizeMm + FAN_PITCH_GAP_MM)))
    const n = Math.min(cfg.count, maxCount)
    return {
      item,
      heightU: Math.max(1, Math.ceil(cfg.fanSizeMm / U_MM)),
      depthMm: 30,
      weightKg: 0.4 + n * 0.15,
      powerW: n * 3,
      maxCount,
    }
  }
  if (cfg.kind === 'fanTray') {
    const perRow = Math.max(1, Math.floor(opening / (cfg.fanSizeMm + FAN_PITCH_GAP_MM)))
    const rows = Math.max(
      1,
      Math.min(2, Math.floor(Math.min(rack.depthMm, 300) / (cfg.fanSizeMm + FAN_PITCH_GAP_MM))),
    )
    const maxCount = perRow * rows
    const n = Math.min(cfg.count, maxCount)
    const usedRows = Math.ceil(n / perRow)
    return {
      item,
      heightU: 1,
      depthMm: usedRows * (cfg.fanSizeMm + FAN_PITCH_GAP_MM) + 20,
      weightKg: 0.8 + n * 0.15,
      powerW: n * 3,
      maxCount,
    }
  }
  // drive bay
  const d = DRIVE[cfg.driveSize]
  const caddy = cfg.driveSize === '3.5' ? 6.4 : 2.5
  const usable = opening - 10
  let heightU: number
  let maxCount: number
  if (cfg.orientation === 'vertical') {
    const perTier = Math.floor(usable / (d.h + caddy / 2 + 1))
    const tierU = Math.ceil((d.w + 8) / U_MM)
    const tiers = Math.max(1, Math.ceil(cfg.count / perTier))
    heightU = tiers * tierU
    maxCount = perTier * 4
  } else {
    const cols = Math.floor(usable / (d.w + caddy))
    const rowsIn = (u: number) => Math.floor((u * U_MM) / (d.h + 2.9))
    heightU = 1
    while (cols * rowsIn(heightU) < cfg.count && heightU < 8) heightU++
    maxCount = cols * rowsIn(8)
  }
  const n = Math.min(cfg.count, maxCount)
  return {
    item,
    heightU,
    depthMm: d.l + 60,
    weightKg: 1.5 * heightU + n * d.kg,
    powerW: Math.round(n * d.watts),
    maxCount,
  }
}

/** Height in mm of a loose device as it stands on a shelf. */
export function childSize(item: CatalogItem, orientation: 'flat' | 'upright') {
  return orientation === 'flat'
    ? { widthMm: item.widthMm, heightMm: item.heightMm, depthMm: item.depthMm }
    : { widthMm: item.heightMm, heightMm: item.widthMm, depthMm: item.depthMm }
}

export function resolvePlacement(p: Placement, rack?: Rack): Resolved | undefined {
  const item = getItem(p.itemId)
  if (!item) return undefined
  const r: Rack = rack ?? {
    standard: item.standard === 'both' ? '19' : item.standard,
    heightU: 48,
    depthMm: 1000,
    style: 'open',
    casters: false,
  }
  const cfg = p.config ?? item.configurable
  if (item.configurable && cfg && cfg.kind === item.configurable.kind) return resolveConfig(item, cfg, r)

  let heightU = item.heightU ?? Math.max(1, Math.ceil(item.heightMm / U_MM))
  let weightKg = item.weightKg
  let powerW = item.powerW
  if (item.isShelf && p.children?.length) {
    let tallest = 0
    for (const c of p.children) {
      const ci = getItem(c.itemId)
      if (!ci) continue
      tallest = Math.max(tallest, childSize(ci, c.orientation).heightMm)
      weightKg += ci.weightKg
      powerW += ci.powerW
    }
    heightU = Math.max(heightU, Math.ceil((tallest + SHELF_PLATE_MM) / U_MM))
  }
  return { item, heightU, depthMm: item.depthMm, weightKg, powerW }
}

/** Units a placement takes up, both ends included. Works without a rack because the height of a device
 *  only depends on the rack for configurable parts, and those do not change height with the rack width. */
export function occupiedRange(p: Placement, rack?: Rack): { from: number; to: number } {
  const h = resolvePlacement(p, rack)?.heightU ?? 1
  return { from: p.u, to: p.u + h - 1 }
}

export interface CheckResult {
  ok: boolean
  errors: Issue[]
  warnings: Issue[]
}

export function checkPlacement(
  rack: Rack,
  others: Placement[],
  candidate: Placement,
  opts: { ignoreId?: string } = {},
): CheckResult {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const pid = candidate.id
  const res = resolvePlacement(candidate, rack)
  if (!res) {
    errors.push({
      code: 'unknown-item',
      message: `"${candidate.itemId}" is not in the catalog.`,
      placementId: pid,
    })
    return { ok: false, errors, warnings }
  }
  const { item } = res
  if (item.mount === 'shelf') {
    errors.push({
      code: 'needs-shelf',
      message: `${item.name} has no rack ears. Put a shelf in the rack and drop it on that.`,
      placementId: pid,
    })
    return { ok: false, errors, warnings }
  }
  if (item.standard === '19' && rack.standard === '10') {
    errors.push({
      code: 'wrong-standard',
      message: `${item.name} is 19" equipment and does not fit a 10" rack.`,
      placementId: pid,
    })
  }
  if (item.standard === '10' && rack.standard === '19') {
    warnings.push({
      code: 'needs-adapter',
      message: `${item.name} is 10" equipment: it needs 10" to 19" adapter ears in this rack.`,
      placementId: pid,
    })
  }
  const from = candidate.u
  const to = candidate.u + res.heightU - 1
  if (!Number.isInteger(from) || from < 1 || to > rack.heightU) {
    errors.push({
      code: 'out-of-bounds',
      message: `${item.name} (${res.heightU}U) does not fit at U${from}: the rack has U1 to U${rack.heightU}.`,
      placementId: pid,
    })
  }
  if (res.depthMm > rack.depthMm) {
    warnings.push({
      code: 'too-deep',
      message: `${item.name} is ${Math.round(res.depthMm)} mm deep, the rack only ${Math.round(rack.depthMm)} mm.`,
      placementId: pid,
    })
  }
  for (const o of others) {
    if (o.id === opts.ignoreId || o.id === candidate.id) continue
    const or = resolvePlacement(o, rack)
    if (!or) continue
    const oFrom = o.u
    const oTo = o.u + or.heightU - 1
    if (to < oFrom || from > oTo) continue
    const sameSide = o.side === candidate.side
    // Front and rear devices in the same unit only collide when together they are deeper than the rack.
    if (sameSide || or.depthMm + res.depthMm > rack.depthMm) {
      errors.push({
        code: 'overlap',
        message: sameSide
          ? `U${Math.max(from, oFrom)} is already taken by ${or.item.name}.`
          : `${item.name} would run into ${or.item.name} mounted on the other side of the rack.`,
        placementId: pid,
      })
      break
    }
  }
  if (item.isShelf && candidate.children?.length) {
    const sl = shelfIssues(candidate, rack)
    errors.push(...sl.errors)
    warnings.push(...sl.warnings)
  }
  return { ok: errors.length === 0, errors, warnings }
}

const CHILD_GAP_MM = 5

/** Width and depth check for what stands on a shelf. Lives here so checkPlacement can use it. */
export function shelfIssues(
  shelf: Placement,
  rack: Rack,
): { errors: Issue[]; warnings: Issue[]; usedMm: number } {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const item = getItem(shelf.itemId)
  let used = 0
  const kids = shelf.children ?? []
  if (!item) return { errors, warnings, usedMm: 0 }
  const usable = shelfUsableWidth(item, rack)
  kids.forEach((c, i) => {
    const ci = getItem(c.itemId)
    if (!ci) {
      errors.push({
        code: 'unknown-item',
        message: `"${c.itemId}" is not in the catalog.`,
        placementId: shelf.id,
      })
      return
    }
    if (ci.mount !== 'shelf') {
      errors.push({
        code: 'not-a-shelf',
        message: `${ci.name} is rack-mount equipment and goes on the rails, not on a shelf.`,
        placementId: shelf.id,
      })
      return
    }
    const s = childSize(ci, c.orientation)
    used += s.widthMm + (i > 0 ? CHILD_GAP_MM : 0)
    if (s.depthMm > item.depthMm) {
      warnings.push({
        code: 'child-too-deep',
        message: `${ci.name} is ${Math.round(s.depthMm)} mm deep and overhangs the ${Math.round(item.depthMm)} mm shelf.`,
        placementId: shelf.id,
      })
    }
  })
  if (used > usable) {
    errors.push({
      code: 'shelf-full',
      message: `These devices need ${Math.round(used)} mm side by side, the shelf has ${Math.round(usable)} mm.`,
      placementId: shelf.id,
    })
  }
  return { errors, warnings, usedMm: used }
}

export function shelfUsableWidth(shelfItem: CatalogItem, rack: Rack): number {
  return RACK_STANDARDS[effectiveStandard(shelfItem, rack)].shelfUsableMm
}

export const SHELF_CHILD_GAP_MM = CHILD_GAP_MM

export interface ChangeResult extends CheckResult {
  placements: Placement[]
}

export function addPlacement(rack: Rack, placements: Placement[], candidate: Placement): ChangeResult {
  const r = checkPlacement(rack, placements, candidate)
  return { ...r, placements: r.ok ? [...placements, candidate] : placements }
}

export function movePlacement(
  rack: Rack,
  placements: Placement[],
  id: string,
  u: number,
  side: Side,
): ChangeResult {
  const current = placements.find((p) => p.id === id)
  if (!current) return { ok: false, errors: [], warnings: [], placements }
  const moved = { ...current, u, side }
  const r = checkPlacement(rack, placements, moved, { ignoreId: id })
  return { ...r, placements: r.ok ? placements.map((p) => (p.id === id ? moved : p)) : placements }
}

/** Replace a placement (new settings, new children) if the result still fits. */
export function updatePlacement(rack: Rack, placements: Placement[], next: Placement): ChangeResult {
  const r = checkPlacement(rack, placements, next, { ignoreId: next.id })
  return { ...r, placements: r.ok ? placements.map((p) => (p.id === next.id ? next : p)) : placements }
}

export function removePlacement(placements: Placement[], id: string): Placement[] {
  return placements.filter((p) => p.id !== id)
}

/** Light gear goes as high as possible, heavy gear as low as possible. */
export function firstFreeU(rack: Rack, placements: Placement[], candidate: Placement): number | null {
  const res = resolvePlacement(candidate, rack)
  if (!res) return null
  const heavy = res.weightKg >= 10
  const top = rack.heightU - res.heightU + 1
  for (let i = 0; i < top; i++) {
    const u = heavy ? 1 + i : top - i
    if (checkPlacement(rack, placements, { ...candidate, u }).ok) return u
  }
  return null
}

/** Every problem in a whole layout, e.g. after the rack was resized or a file was imported. */
export function validateLayout(rack: Rack, placements: Placement[]): Issue[] {
  const issues: Issue[] = []
  placements.forEach((p, i) => {
    // Only compare against earlier placements so an overlapping pair is reported once.
    const r = checkPlacement(rack, placements.slice(0, i), p)
    issues.push(...r.errors, ...r.warnings)
  })
  return issues
}

/** How the drives of a drive bay are arranged on its face. Shared by the size rules and the drawing. */
export function driveGrid(
  cfg: Extract<Configurable, { kind: 'driveBay' }>,
  item: CatalogItem,
  rack: Rack,
): { cols: number; rows: number; cellW: number; cellH: number } {
  const d = DRIVE[cfg.driveSize]
  const caddy = cfg.driveSize === '3.5' ? 6.4 : 2.5
  const usable = RACK_STANDARDS[effectiveStandard(item, rack)].openingMm - 10
  const heightU = resolveConfig(item, cfg, rack).heightU
  if (cfg.orientation === 'vertical') {
    const cols = Math.floor(usable / (d.h + caddy / 2 + 1))
    const tierU = Math.ceil((d.w + 8) / U_MM)
    return { cols, rows: heightU / tierU, cellW: d.h, cellH: d.w }
  }
  const cols = Math.floor(usable / (d.w + caddy))
  return { cols, rows: Math.floor((heightU * U_MM) / (d.h + 2.9)), cellW: d.w, cellH: d.h }
}
