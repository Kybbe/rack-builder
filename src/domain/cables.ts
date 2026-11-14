import type { Cable, CableRouting, CatalogItem, FrontFeature, Placement, Rack, Side } from './types'
import { RACK_STANDARDS, U_MM } from './units'
import { bottomMm, childSize, effectiveStandard, resolvePlacement } from './placement'
import { rackGeometry } from './geometry'
import { shelfLayout } from './shelf'
import { featureRects } from './features'
import { getItem } from '../catalog'

export type PortKind = 'rj45' | 'sfp' | 'outlet' | 'inlet'
export type CableKind = 'ethernet' | 'sfp' | 'power'
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** A socket on a device, placed in the rack. Same coordinates as the drawn rack: mm, floor centre. */
export interface Port {
  /** `placementId:key`, or `shelfId/childId:key` for a device on a shelf. Stays the same when the device moves. */
  id: string
  ownerId: string
  childId?: string
  device: string
  label: string
  kind: PortKind
  pos: Vec3
  /** The face of the rack this socket points out of. */
  facing: Side
}

/** The far end of a power cable that leaves the rack. Any number of cables can go there. */
export const WALL = 'wall'
/** Counted on top of the run inside the rack for a cable to the wall socket. */
export const WALL_RUN_MM = 1000
/** How far a cable sticks out of a socket before it can bend. */
const STANDOFF_MM = 25
const SLACK = 1.1
const PLUGS_MM = 80

/** Lengths these cables are commonly sold in, in mm. */
export const STOCK_LENGTHS: Record<CableKind, number[]> = {
  ethernet: [150, 250, 500, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000],
  sfp: [500, 1000, 1500, 2000, 3000, 5000, 7000],
  power: [500, 1000, 1500, 2000, 2500, 3000, 5000],
}

export const CABLE_NAME: Record<CableKind, string> = {
  ethernet: 'Patch cable',
  sfp: 'DAC cable',
  power: 'Power cable',
}

export function suggestLength(kind: CableKind, requiredMm: number): number | undefined {
  return STOCK_LENGTHS[kind].find((l) => l >= requiredMm)
}

/**
 * The back of a device. Few catalog entries describe it, so the ones that are wired at the back get a usual set:
 * four LAN ports on a server, two on a NAS, one on a mini PC.
 */
function rearFeatures(item: CatalogItem): FrontFeature[] {
  if (item.rear) return item.rear
  if (item.configurable || item.powerW <= 0) return []
  if (item.category === 'servers') return [{ type: 'ports', count: 4, x: 0.5, w: 0.22 }]
  if (item.category === 'storage') return [{ type: 'ports', count: 2, x: 0.5, w: 0.12 }]
  if (item.category === 'minipc') return [{ type: 'ports', count: 1, x: 0.45, w: 0.12 }]
  return []
}

interface Spot {
  key: string
  kind: PortKind
  label: string
  x: number
  y: number
  back: boolean
}

/** Every socket of one device, on its own front (or back) face: x and y from the centre of the face. */
function spots(item: CatalogItem, faceW: number, faceH: number, powered: boolean): Spot[] {
  const out: Spot[] = []
  const n = { rj45: 0, sfp: 0, outlet: 0 }
  // Only network gear has its network ports on the front. On a PC or server the front sockets are USB and video.
  const front = item.category === 'networking' || item.category === 'power' ? item.features : []
  for (const [side, features] of [
    ['f', front],
    ['r', rearFeatures(item)],
  ] as const) {
    const index = new Map<number, number>()
    for (const r of featureRects(features, faceW, faceH)) {
      if (r.kind !== 'ports' && r.kind !== 'keystones' && r.kind !== 'outlets') continue
      const i = index.get(r.f) ?? 0
      index.set(r.f, i + 1)
      const kind: PortKind = r.kind === 'outlets' ? 'outlet' : r.tone === 'sfp' ? 'sfp' : 'rj45'
      const no = ++n[kind]
      const name =
        kind === 'outlet' ? 'Outlet' : kind === 'sfp' ? 'SFP' : side === 'r' && !item.rear ? 'LAN' : 'Port'
      out.push({
        key: `${side}${r.f}.${i}`,
        kind,
        label: `${name} ${no}`,
        x: r.x,
        y: r.y,
        back: side === 'r',
      })
    }
  }
  if (powered) out.push({ key: 'pwr', kind: 'inlet', label: 'Power in', x: faceW / 2 - 28, y: 0, back: true })
  return out
}

export function portsOf(rack: Rack, placements: Placement[]): Port[] {
  const g = rackGeometry(rack)
  const out: Port[] = []
  for (const p of placements) {
    const res = resolvePlacement(p, rack)
    if (!res) continue
    const item = res.item
    const front = p.side === 'front'
    const other: Side = front ? 'rear' : 'front'
    const y0 = g.u1Y + bottomMm(p)
    /** From the placement's own frame (x right, y up from its bottom edge, z out of its face) into the rack. */
    const place = (x: number, y: number, z: number): Vec3 =>
      front ? { x, y: y0 + y, z: g.frontZ + z } : { x: -x, y: y0 + y, z: g.rearZ - z }

    if (item.isShelf) {
      const layout = shelfLayout(p, rack)
      for (const s of layout.slots) {
        const ci = getItem(s.itemId)
        const child = p.children?.find((c) => c.id === s.childId)
        if (!ci || !child) continue
        const upright = child.orientation === 'upright'
        const size = childSize(ci, child.orientation)
        const cx = -layout.usableMm / 2 + s.xMm + s.widthMm / 2
        for (const sp of spots(ci, ci.widthMm * 0.92, ci.heightMm, ci.powerW > 0)) {
          // An upright device is the flat one turned a quarter turn around the axis through its face.
          const [x, y] = upright ? [-sp.y, sp.x] : [sp.x, sp.y]
          out.push({
            id: `${p.id}/${child.id}:${sp.key}`,
            ownerId: p.id,
            childId: child.id,
            device: ci.name,
            label: sp.label,
            kind: sp.kind,
            pos: place(cx + (sp.back ? -x : x), 2.5 + size.heightMm / 2 + y, sp.back ? -6 - ci.depthMm : -6),
            facing: sp.back ? other : p.side,
          })
        }
      }
      continue
    }

    const faceW = RACK_STANDARDS[effectiveStandard(item, rack)].openingMm - 14
    const h = res.heightU * U_MM
    const powered = item.powerW > 0 || (!!item.configurable && res.powerW > 0)
    for (const sp of spots(item, faceW, (item.heightU ?? 1) * U_MM, powered)) {
      out.push({
        id: `${p.id}:${sp.key}`,
        ownerId: p.id,
        device: item.name,
        label: sp.label,
        kind: sp.kind,
        pos: sp.back ? place(-sp.x, h / 2 + sp.y, -res.depthMm) : place(sp.x, h / 2 + sp.y, 2.5),
        facing: sp.back ? other : p.side,
      })
    }
  }
  return out
}

/** Where cables to the wall socket leave the rack: bottom rear corner. */
function wallPoint(rack: Rack): Port {
  const g = rackGeometry(rack)
  return {
    id: WALL,
    ownerId: WALL,
    device: 'Wall socket',
    label: 'Wall socket',
    kind: 'outlet',
    pos: { x: -g.outerW / 2, y: g.baseY + 30, z: g.rearZ - STANDOFF_MM },
    facing: 'rear',
  }
}

const cableKind = (a: Port): CableKind =>
  a.kind === 'rj45' ? 'ethernet' : a.kind === 'sfp' ? 'sfp' : 'power'

/**
 * The run of a cable as corner points. On one face it goes sideways then up or down in front of the equipment;
 * between the front and the back it goes around the nearer side of the rack.
 */
export function route(rack: Rack, a: Port, b: Port, routing: CableRouting = 'direct'): Vec3[] {
  const g = rackGeometry(rack)
  const out = (p: Port) => p.pos.z + (p.facing === 'front' ? STANDOFF_MM : -STANDOFF_MM)
  let pts: Vec3[]
  if (a.facing === b.facing) {
    const z = a.facing === 'front' ? Math.max(out(a), out(b)) : Math.min(out(a), out(b))
    // Along a post only pays off over a distance: neighbouring units are patched straight across.
    if (routing === 'post' && Math.abs(a.pos.y - b.pos.y) > U_MM * 1.5) {
      const post = g.panelW / 2 - g.railW / 2
      const cost = (px: number) => Math.abs(a.pos.x - px) + Math.abs(b.pos.x - px)
      const px = cost(-post) < cost(post) ? -post : post
      pts = [
        a.pos,
        { x: a.pos.x, y: a.pos.y, z },
        { x: px, y: a.pos.y, z },
        { x: px, y: b.pos.y, z },
        { x: b.pos.x, y: b.pos.y, z },
        b.pos,
      ]
    } else {
      pts = [
        a.pos,
        { x: a.pos.x, y: a.pos.y, z },
        { x: b.pos.x, y: a.pos.y, z },
        { x: b.pos.x, y: b.pos.y, z },
        b.pos,
      ]
    }
  } else {
    const edge = g.outerW / 2 + 12
    const cost = (sx: number) => Math.abs(a.pos.x - sx) + Math.abs(b.pos.x - sx)
    const sx = cost(-edge) < cost(edge) ? -edge : edge
    pts = [
      a.pos,
      { x: a.pos.x, y: a.pos.y, z: out(a) },
      { x: sx, y: a.pos.y, z: out(a) },
      { x: sx, y: a.pos.y, z: out(b) },
      { x: sx, y: b.pos.y, z: out(b) },
      { x: b.pos.x, y: b.pos.y, z: out(b) },
      b.pos,
    ]
  }
  return pts.filter((p, i) => {
    const q = pts[i - 1]
    return !q || Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + Math.abs(p.z - q.z) > 1e-6
  })
}

const lengthOf = (pts: Vec3[]) =>
  pts.reduce((t, p, i) => {
    const q = pts[i - 1]
    return q ? t + Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) : t
  }, 0)

export type ConnectResult = { ok: true; cables: Cable[]; cable: Cable } | { ok: false; error: string }

let seq = 0
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`

/** Why these two ends cannot be joined, or nothing when they can. Does not look at what is already plugged in. */
function mismatch(a: Port, b: Port): string | undefined {
  if (a.id === b.id) return 'A cable needs two ends: that is the same port.'
  if (a.id === WALL || b.id === WALL) {
    const other = a.id === WALL ? b : a
    return other.kind === 'inlet' ? undefined : 'Only a power inlet plugs into the wall socket.'
  }
  const power = (p: Port) => p.kind === 'outlet' || p.kind === 'inlet'
  if (power(a) !== power(b)) return 'A network cable does not fit a power socket.'
  if (power(a)) {
    if (a.kind === b.kind) return 'A power cable runs from an outlet to a power inlet.'
    if (a.ownerId === b.ownerId && a.childId === b.childId) return 'A device cannot power itself.'
    return undefined
  }
  if (a.kind !== b.kind) return 'An RJ45 plug does not fit an SFP cage.'
  return undefined
}

/** The ports that could take the other end of a cable started at `fromId`: free and of a fitting kind. */
export function compatiblePorts(ports: Port[], cables: Cable[], fromId: string): Set<string> {
  const from = ports.find((p) => p.id === fromId)
  const used = new Set(cables.flatMap((c) => [c.from, c.to]))
  const out = new Set<string>()
  if (!from) return out
  for (const p of ports) if (!used.has(p.id) && !mismatch(from, p)) out.add(p.id)
  return out
}

export function connectCable(
  rack: Rack,
  placements: Placement[],
  cables: Cable[],
  from: string,
  to: string,
  opts: { id?: string } & CablePatch = {},
): ConnectResult {
  const ports = [...portsOf(rack, placements), wallPoint(rack)]
  const a = ports.find((p) => p.id === from)
  const b = ports.find((p) => p.id === to)
  if (!a || !b) return { ok: false, error: 'That port is no longer there.' }
  const bad = mismatch(a, b)
  if (bad) return { ok: false, error: bad }
  for (const p of [a, b]) {
    if (p.id !== WALL && cables.some((c) => c.from === p.id || c.to === p.id))
      return { ok: false, error: `${p.label} on ${p.device} already has a cable.` }
  }
  const { id, ...settings } = opts
  const cable = updateCable([{ id: id ?? newId(), from, to }], id ?? '', {})[0]!
  const styled = updateCable([cable], cable.id, settings)[0]!
  return { ok: true, cables: [...cables, styled], cable: styled }
}

export type CablePatch = {
  [K in 'lengthMm' | 'have' | 'color' | 'diameterMm' | 'route']?: Cable[K] | undefined
}

/** Changes the settings of one cable. A setting given as undefined goes back to its default. */
export function updateCable(cables: Cable[], id: string, patch: CablePatch): Cable[] {
  return cables.map((c) => {
    if (c.id !== id) return c
    const next: Record<string, unknown> = { ...c }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k]
      else next[k] = v
    }
    return next as unknown as Cable
  })
}

export function setCableLength(cables: Cable[], id: string, lengthMm: number | undefined): Cable[] {
  return updateCable(cables, id, { lengthMm })
}

/** Cables whose two ends still exist. Called after anything is removed from the rack. */
export function pruneCables(rack: Rack, placements: Placement[], cables: Cable[]): Cable[] {
  if (!cables.length) return cables
  const ids = new Set(portsOf(rack, placements).map((p) => p.id))
  ids.add(WALL)
  const kept = cables.filter((c) => ids.has(c.from) && ids.has(c.to))
  return kept.length === cables.length ? cables : kept
}

export interface CableRow {
  cable: Cable
  kind: CableKind
  from: Port
  to: Port | typeof WALL
  /** Length of the run itself. */
  pathMm: number
  /** The run plus slack and the plugs: the shortest cable that will do. */
  requiredMm: number
  /** Shortest stock length that reaches, when there is one. */
  suggestedMm?: number
  /** The length to buy: the user's choice, else the suggestion. */
  lengthMm?: number
  status: 'ok' | 'too-short' | 'no-stock'
  /** The user has this cable already, so it is not on the shopping list. */
  have: boolean
  points: Vec3[]
}

export interface CableReport {
  rows: CableRow[]
  shopping: { kind: CableKind; lengthMm: number; count: number }[]
  /** Power inlets nothing is plugged into. */
  unpowered: { portId: string; device: string }[]
}

/** The run, the length needed and the length to buy for one pair of ends. */
export function measure(rack: Rack, a: Port, b: Port | typeof WALL, routing: CableRouting = 'direct') {
  const end = b === WALL ? wallPoint(rack) : b
  // Draw and measure from the device towards the wall, and from the first end clicked otherwise.
  const points = route(rack, a, end, routing)
  const pathMm = lengthOf(points) + (b === WALL ? WALL_RUN_MM : 0)
  const requiredMm = pathMm * SLACK + PLUGS_MM
  const kind = cableKind(a)
  return { kind, points, pathMm, requiredMm, suggestedMm: suggestLength(kind, requiredMm) }
}

export function cableReport(
  rack: Rack,
  placements: Placement[],
  cables: Cable[],
  opts: { routing?: CableRouting } = {},
): CableReport {
  const ports = portsOf(rack, placements)
  const byId = new Map(ports.map((p) => [p.id, p]))
  const rows: CableRow[] = []
  const plugged = new Set<string>()
  for (const cable of cables) {
    // A wall cable is always described from the device's end.
    const [fromId, toId] = cable.from === WALL ? [cable.to, cable.from] : [cable.from, cable.to]
    const from = byId.get(fromId)
    const to = toId === WALL ? WALL : byId.get(toId)
    if (!from || !to) continue
    plugged.add(fromId).add(toId)
    const m = measure(rack, from, to, cable.route ?? opts.routing ?? 'direct')
    const lengthMm = cable.lengthMm ?? m.suggestedMm
    const row: CableRow = {
      cable,
      kind: m.kind,
      from,
      to,
      pathMm: m.pathMm,
      requiredMm: m.requiredMm,
      status: lengthMm === undefined ? 'no-stock' : lengthMm < m.requiredMm ? 'too-short' : 'ok',
      // A device ships with its power cable; patch and DAC cables are bought separately.
      have: cable.have ?? m.kind === 'power',
      points: m.points,
    }
    if (m.suggestedMm !== undefined) row.suggestedMm = m.suggestedMm
    if (lengthMm !== undefined) row.lengthMm = lengthMm
    rows.push(row)
  }
  const counts = new Map<string, { kind: CableKind; lengthMm: number; count: number }>()
  for (const r of rows) {
    if (r.lengthMm === undefined || r.have) continue
    const key = `${r.kind}:${r.lengthMm}`
    const e = counts.get(key) ?? { kind: r.kind, lengthMm: r.lengthMm, count: 0 }
    e.count++
    counts.set(key, e)
  }
  const order: CableKind[] = ['ethernet', 'sfp', 'power']
  const shopping = [...counts.values()].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.lengthMm - b.lengthMm,
  )
  const unpowered = ports
    .filter((p) => p.kind === 'inlet' && !plugged.has(p.id))
    .map((p) => ({ portId: p.id, device: p.device }))
  return { rows, shopping, unpowered }
}

/** Cable lengths are sold in metres (or feet), not millimetres. */
export function cableLengthText(mm: number, units: 'mm' | 'in'): string {
  return units === 'in' ? `${+(mm / 304.8).toFixed(1)} ft` : `${+(mm / 1000).toFixed(2)} m`
}
