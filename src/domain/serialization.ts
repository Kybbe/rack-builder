import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Cable, Configurable, Layout, Placement, Rack, ShelfChild } from './types'
import { getItem } from '../catalog'
import { validateLayout } from './placement'
import { connectCable } from './cables'

/** 2 added cables. A version 1 file is a version 2 file without any. */
export const SCHEMA_VERSION = 2

export type ParseResult = { ok: true; layout: Layout } | { ok: false; error: string }

export function serializeLayout(layout: Layout): string {
  return JSON.stringify({ app: 'rack-builder', version: SCHEMA_VERSION, ...layout }, null, 2)
}

const fail = (error: string): ParseResult => ({ ok: false, error })
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

function parseConfig(v: unknown): Configurable | null {
  if (!isObj(v) || !isInt(v.count, 1, 200)) return null
  if (v.kind === 'fanPanel' && isNum(v.fanSizeMm, 20, 200) && (v.direction === 'in' || v.direction === 'out'))
    return { kind: 'fanPanel', fanSizeMm: v.fanSizeMm, count: v.count, direction: v.direction }
  if (v.kind === 'fanTray' && isNum(v.fanSizeMm, 20, 200) && (v.direction === 'up' || v.direction === 'down'))
    return { kind: 'fanTray', fanSizeMm: v.fanSizeMm, count: v.count, direction: v.direction }
  if (
    v.kind === 'driveBay' &&
    (v.driveSize === '2.5' || v.driveSize === '3.5') &&
    (v.orientation === 'vertical' || v.orientation === 'horizontal')
  )
    return { kind: 'driveBay', driveSize: v.driveSize, orientation: v.orientation, count: v.count }
  return null
}

/** Reads a saved rack. Anything doubtful is refused: a half-understood file must not replace a good rack. */
export function parseLayout(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('This is not a rack file: it is not valid JSON.')
  }
  if (!isObj(raw)) return fail('This is not a rack file.')
  if (typeof raw.version !== 'number') return fail('This is not a rack file: it has no version.')
  if (raw.version > SCHEMA_VERSION)
    return fail(`This file is version ${raw.version}, newer than this app understands (${SCHEMA_VERSION}).`)
  const r = raw.rack
  if (!isObj(r)) return fail('The file has no rack in it.')
  if (r.standard !== '10' && r.standard !== '19') return fail('The rack width must be 10" or 19".')
  if (!isInt(r.heightU, 1, 60)) return fail('The rack height must be between 1U and 60U.')
  if (!isNum(r.depthMm, 80, 1500)) return fail('The rack depth must be between 80 and 1500 mm.')
  if (r.style !== 'open' && r.style !== 'enclosed' && r.style !== 'wall') return fail('Unknown rack type.')
  const rack: Rack = {
    standard: r.standard,
    heightU: r.heightU,
    depthMm: r.depthMm,
    style: r.style,
    casters: r.casters === true,
  }
  if (typeof r.productId === 'string') rack.productId = r.productId
  if (r.color !== undefined) {
    if (!isColor(r.color)) return fail('The rack colour is not a colour.')
    rack.color = r.color
  }

  if (!Array.isArray(raw.placements)) return fail('The file has no equipment list.')
  const placements: Placement[] = []
  const ids = new Set<string>()
  for (const v of raw.placements) {
    if (!isObj(v) || typeof v.id !== 'string' || typeof v.itemId !== 'string')
      return fail('A device entry is damaged.')
    if (ids.has(v.id)) return fail('Two devices in the file have the same id.')
    ids.add(v.id)
    if (!getItem(v.itemId)) return fail(`The file uses "${v.itemId}", which this version does not know.`)
    if (!isInt(v.u, 1, 60)) return fail(`"${v.itemId}" has no valid rack position.`)
    if (v.side !== 'front' && v.side !== 'rear') return fail(`"${v.itemId}" has no valid side.`)
    const p: Placement = { id: v.id, itemId: v.itemId, u: v.u, side: v.side }
    if (v.hole !== undefined) {
      if (v.hole !== 1 && v.hole !== 2) return fail(`"${v.itemId}" has no valid mounting hole.`)
      p.hole = v.hole
    }
    if (v.color !== undefined) {
      if (!isColor(v.color)) return fail(`"${v.itemId}" has a colour that is not a colour.`)
      p.color = v.color
    }
    if (v.config !== undefined) {
      const c = parseConfig(v.config)
      if (!c) return fail(`"${v.itemId}" has settings this version does not understand.`)
      p.config = c
    }
    if (v.children !== undefined) {
      if (!Array.isArray(v.children)) return fail(`"${v.itemId}" has a damaged shelf list.`)
      const kids: ShelfChild[] = []
      for (const c of v.children) {
        if (!isObj(c) || typeof c.id !== 'string' || typeof c.itemId !== 'string')
          return fail('A device on a shelf is damaged.')
        if (!getItem(c.itemId)) return fail(`The file uses "${c.itemId}", which this version does not know.`)
        if (c.orientation !== 'flat' && c.orientation !== 'upright')
          return fail('A device on a shelf is damaged.')
        kids.push({ id: c.id, itemId: c.itemId, orientation: c.orientation })
      }
      p.children = kids
    }
    if (v.cadOnly === true) p.cadOnly = true
    placements.push(p)
  }
  const hard = validateLayout(rack, placements).filter(
    (i) => i.code !== 'too-deep' && i.code !== 'needs-adapter' && i.code !== 'child-too-deep',
  )
  if (hard.length) return fail(`The rack in this file does not fit together: ${hard[0]!.message}`)
  const layout: Layout = { rack, placements }
  if (raw.cables !== undefined) {
    if (!Array.isArray(raw.cables)) return fail('The cable list in the file is damaged.')
    // Plug them in one by one with the same rules as in the app, so a file cannot hold an impossible cable.
    let cables: Cable[] = []
    const cableIds = new Set<string>()
    for (const v of raw.cables) {
      if (!isObj(v) || typeof v.id !== 'string' || typeof v.from !== 'string' || typeof v.to !== 'string')
        return fail('A cable entry is damaged.')
      if (cableIds.has(v.id)) return fail('Two cables in the file have the same id.')
      cableIds.add(v.id)
      if (v.lengthMm !== undefined && !isNum(v.lengthMm, 50, 100_000))
        return fail('A cable in the file has an impossible length.')
      if (v.have !== undefined && typeof v.have !== 'boolean') return fail('A cable entry is damaged.')
      if (v.color !== undefined && !isColor(v.color))
        return fail('A cable has a colour that is not a colour.')
      if (v.diameterMm !== undefined && !isNum(v.diameterMm, 1, 30))
        return fail('A cable in the file has an impossible thickness.')
      if (v.route !== undefined && v.route !== 'direct' && v.route !== 'post')
        return fail('A cable in the file is routed in a way this version does not know.')
      const r = connectCable(rack, placements, cables, v.from, v.to, {
        id: v.id,
        ...(v.lengthMm !== undefined ? { lengthMm: v.lengthMm } : {}),
        ...(v.have !== undefined ? { have: v.have } : {}),
        ...(v.color !== undefined ? { color: v.color } : {}),
        ...(v.diameterMm !== undefined ? { diameterMm: v.diameterMm } : {}),
        ...(v.route !== undefined ? { route: v.route } : {}),
      })
      if (!r.ok) return fail(`A cable in this file cannot be plugged in: ${r.error}`)
      cables = r.cables
    }
    if (cables.length) layout.cables = cables
  }
  return { ok: true, layout }
}

export function toShareHash(layout: Layout): string {
  return compressToEncodedURIComponent(JSON.stringify({ version: SCHEMA_VERSION, ...layout }))
}

export function fromShareHash(hash: string): ParseResult {
  if (!hash) return fail('The link is empty.')
  let text: string | null
  try {
    text = decompressFromEncodedURIComponent(hash)
  } catch {
    text = null
  }
  if (!text) return fail('The link is damaged.')
  return parseLayout(text)
}
