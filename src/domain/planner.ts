import type {
  Configurable,
  Issue,
  Layout,
  Placement,
  Rack,
  RackProduct,
  RackStandard,
  ShelfChild,
} from './types'
import { STANDARD_HEIGHTS, RACK_STANDARDS } from './units'
import { getItem, RACK_PRODUCTS } from '../catalog'
import { SHELF_CHILD_GAP_MM, resolvePlacement } from './placement'

export interface Wanted {
  itemId: string
  qty: number
  config?: Configurable
}

export interface PlanOptions {
  standard: RackStandard
  /** Spare room on top of what the list needs, in percent. */
  headroomPct: number
  /** Lay the list out in this bought rack instead of the suggested size. */
  forRack?: RackProduct
}

export interface RackSuggestion {
  product: RackProduct
  /** false when the deepest device on the list is deeper than this rack. */
  depthOk: boolean
  spareU: number
}

export interface Plan {
  usedU: number
  requiredU: number
  /** null when the list is empty or too big for any standard rack. */
  suggestedHeightU: number | null
  minDepthMm: number
  deepestMm: number
  weightKg: number
  powerW: number
  shelvesAdded: number
  racks: RackSuggestion[]
  layout: Layout | null
  issues: Issue[]
}

/** Room behind the deepest device for plugs and cable bends. */
const CABLE_CLEARANCE_MM = 75
const SHELF_ID: Record<RackStandard, string> = { '19': 'shelf-1u-19', '10': 'shelf-1u-10' }
/** Top of the rack first. */
const TOP_ORDER = ['networking', 'screens', 'accessories', 'cooling', 'minipc', 'power']
const BOTTOM_ORDER = ['power', 'servers', 'storage']

export function planRack(wanted: Wanted[], opts: PlanOptions): Plan {
  const issues: Issue[] = []
  const std = opts.standard
  const scratch: Rack = { standard: std, heightU: 48, depthMm: 1200, style: 'open', casters: false }
  let n = 0
  const id = () => `plan-${n++}`

  const rail: Placement[] = []
  const loose: { itemId: string; widthMm: number }[] = []
  for (const w of wanted) {
    const qty = Math.floor(w.qty)
    if (!(qty > 0)) continue
    const item = getItem(w.itemId)
    if (!item) {
      issues.push({ code: 'unknown-item', message: `"${w.itemId}" is not in the catalog.` })
      continue
    }
    if (item.mount === 'rail' && item.standard === '19' && std === '10') {
      issues.push({
        code: 'wrong-standard',
        message: `${item.name} is 19" equipment and does not fit a 10" rack.`,
      })
      continue
    }
    if (item.mount === 'rail' && item.standard === '10' && std === '19') {
      issues.push({ code: 'needs-adapter', message: `${item.name} needs 10" to 19" adapter ears.` })
    }
    for (let i = 0; i < qty; i++) {
      if (item.mount === 'shelf') loose.push({ itemId: item.id, widthMm: item.widthMm })
      else
        rail.push({ id: id(), itemId: item.id, u: 1, side: 'front', config: w.config ?? item.configurable })
    }
  }

  // Loose devices: widest first, each on the first shelf that still has room.
  const usable = RACK_STANDARDS[std].shelfUsableMm
  const shelves: { used: number; children: ShelfChild[] }[] = []
  for (const d of [...loose].sort((a, b) => b.widthMm - a.widthMm)) {
    if (d.widthMm > usable) {
      issues.push({
        code: 'shelf-full',
        message: `${getItem(d.itemId)!.name} is wider than a ${std}" shelf.`,
      })
      continue
    }
    let s = shelves.find((x) => x.used + SHELF_CHILD_GAP_MM + d.widthMm <= usable)
    if (!s) {
      s = { used: -SHELF_CHILD_GAP_MM, children: [] }
      shelves.push(s)
    }
    s.used += SHELF_CHILD_GAP_MM + d.widthMm
    s.children.push({ id: id(), itemId: d.itemId, orientation: 'flat' })
  }
  const shelfPlacements: Placement[] = shelves.map((s) => ({
    id: id(),
    itemId: SHELF_ID[std],
    u: 1,
    side: 'front',
    children: s.children,
  }))

  const all = [...rail, ...shelfPlacements].map((p) => ({ p, r: resolvePlacement(p, scratch)! }))
  const usedU = all.reduce((s, x) => s + x.r.heightU, 0)
  const deepestMm = all.reduce((m, x) => Math.max(m, x.r.depthMm), 0)
  const weightKg = all.reduce((s, x) => s + x.r.weightKg, 0)
  const powerW = all.reduce((s, x) => s + x.r.powerW, 0)
  const requiredU = Math.ceil(usedU * (1 + Math.max(0, opts.headroomPct) / 100))
  const suggestedHeightU = usedU === 0 ? null : (STANDARD_HEIGHTS[std].find((h) => h >= requiredU) ?? null)
  const minDepthMm = usedU === 0 ? 0 : deepestMm + CABLE_CLEARANCE_MM

  const racks: RackSuggestion[] =
    usedU === 0
      ? []
      : RACK_PRODUCTS.filter((r) => !r.printed && r.standard === std && r.heightU >= requiredU)
          .sort((a, b) => a.heightU - b.heightU || a.depthMm - b.depthMm)
          .slice(0, 8)
          .map((product) => ({
            product,
            depthOk: product.depthMm >= deepestMm,
            spareU: product.heightU - usedU,
          }))

  let layout: Layout | null = null
  const fr = opts.forRack
  if (fr ? usedU > 0 && fr.standard === std && fr.heightU >= usedU : suggestedHeightU !== null) {
    const rack: Rack = fr
      ? {
          standard: std,
          heightU: fr.heightU,
          depthMm: fr.depthMm,
          style: fr.style,
          casters: fr.casters ?? false,
          productId: fr.id,
        }
      : {
          standard: std,
          heightU: suggestedHeightU!,
          depthMm: Math.max(std === '19' ? 600 : 200, Math.ceil(minDepthMm / 50) * 50),
          style: 'open',
          casters: false,
        }
    // Heavy things (servers, storage, UPS) from the bottom up, everything else from the top down.
    const isBottom = (x: (typeof all)[number]) =>
      x.r.item.category === 'servers' ||
      x.r.item.category === 'storage' ||
      (x.r.item.category === 'power' && x.r.weightKg >= 10)
    const rank = (order: string[], c: string) => (order.indexOf(c) === -1 ? order.length : order.indexOf(c))
    const bottom = all
      .filter(isBottom)
      .sort((a, b) => rank(BOTTOM_ORDER, a.r.item.category) - rank(BOTTOM_ORDER, b.r.item.category))
    const top = all
      .filter((x) => !isBottom(x))
      .sort((a, b) => rank(TOP_ORDER, a.r.item.category) - rank(TOP_ORDER, b.r.item.category))
    const placements: Placement[] = []
    let u = 1
    for (const x of bottom) {
      placements.push({ ...x.p, u })
      u += x.r.heightU
    }
    let t = rack.heightU
    for (const x of top) {
      t -= x.r.heightU
      placements.push({ ...x.p, u: t + 1 })
    }
    layout = { rack, placements }
  }

  return {
    usedU,
    requiredU,
    suggestedHeightU,
    minDepthMm,
    deepestMm,
    weightKg,
    powerW,
    shelvesAdded: shelfPlacements.length,
    racks,
    layout,
    issues,
  }
}
