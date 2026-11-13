import { describe, expect, it } from 'vitest'
import type { Layout } from './types'
import { fromShareHash, parseLayout, serializeLayout, toShareHash } from './serialization'

const layout: Layout = {
  rack: {
    standard: '10',
    heightU: 8,
    depthMm: 260,
    style: 'open',
    casters: true,
    productId: 'deskpi-rackmate-t1',
  },
  placements: [
    { id: 'a', itemId: 'patch-panel-12-10', u: 8, side: 'front' },
    {
      id: 'b',
      itemId: 'shelf-1u-10',
      u: 5,
      side: 'front',
      children: [{ id: 'c1', itemId: 'lenovo-m720q', orientation: 'flat' }],
    },
    {
      id: 'c',
      itemId: 'fan-panel',
      u: 1,
      side: 'rear',
      config: { kind: 'fanPanel', fanSizeMm: 80, count: 2, direction: 'out' },
    },
  ],
}

describe('saving and loading a rack', () => {
  it('an exported rack imports back exactly the same', () => {
    const r = parseLayout(serializeLayout(layout))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.layout).toEqual(layout)
  })

  it('a share link carries the whole rack', () => {
    const r = fromShareHash(toShareHash(layout))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.layout).toEqual(layout)
  })

  it('rejects text that is not JSON', () => {
    expect(parseLayout('not json {').ok).toBe(false)
  })

  it('rejects JSON that is not a rack', () => {
    expect(parseLayout('{"hello": "world"}').ok).toBe(false)
    expect(parseLayout('[]').ok).toBe(false)
    expect(parseLayout('null').ok).toBe(false)
  })

  it('rejects a file from a newer version instead of guessing', () => {
    const newer = JSON.stringify({ ...JSON.parse(serializeLayout(layout)), version: 99 })
    const r = parseLayout(newer)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/version/i)
  })

  it('rejects a rack with impossible numbers', () => {
    const bad = JSON.parse(serializeLayout(layout))
    bad.rack.heightU = -3
    expect(parseLayout(JSON.stringify(bad)).ok).toBe(false)
    bad.rack.heightU = 8
    bad.rack.standard = '21'
    expect(parseLayout(JSON.stringify(bad)).ok).toBe(false)
  })

  it('rejects a rack that holds equipment this version does not know', () => {
    const bad = JSON.parse(serializeLayout(layout))
    bad.placements[0].itemId = 'flux-capacitor'
    const r = parseLayout(JSON.stringify(bad))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('flux-capacitor')
  })

  it('rejects a rack whose devices overlap', () => {
    const bad = JSON.parse(serializeLayout(layout))
    bad.placements.push({ id: 'z', itemId: 'patch-panel-12-10', u: 8, side: 'front' })
    expect(parseLayout(JSON.stringify(bad)).ok).toBe(false)
  })

  it('rejects a broken share link', () => {
    expect(fromShareHash('').ok).toBe(false)
    expect(fromShareHash('%%%garbage').ok).toBe(false)
  })
})
