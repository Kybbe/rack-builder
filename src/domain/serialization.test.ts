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

describe('saving and loading the cables of a rack', () => {
  const wired: Layout = {
    rack: { standard: '19', heightU: 12, depthMm: 600, style: 'open', casters: false },
    placements: [
      { id: 'udm', itemId: 'ubiquiti-udm-pro', u: 12, side: 'front' },
      { id: 'sw', itemId: 'ubiquiti-usw-pro-24', u: 11, side: 'front' },
      { id: 'pdu', itemId: 'pdu-8-19', u: 1, side: 'rear' },
    ],
    cables: [
      { id: 'c1', from: 'udm:f2.0', to: 'sw:f1.0' },
      { id: 'c2', from: 'pdu:f0.0', to: 'udm:pwr', lengthMm: 1500 },
      { id: 'c3', from: 'pdu:pwr', to: 'wall' },
    ],
  }
  const edited = (change: (raw: { cables: Record<string, unknown>[] }) => void) => {
    const raw = JSON.parse(serializeLayout(wired))
    change(raw)
    return parseLayout(JSON.stringify(raw))
  }

  it('an exported rack comes back with every cable and the lengths that were picked', () => {
    const r = parseLayout(serializeLayout(wired))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.layout).toEqual(wired)
    const link = fromShareHash(toShareHash(wired))
    expect(link.ok && link.layout.cables).toEqual(wired.cables)
  })

  it('still opens a file saved before cables existed', () => {
    const old = JSON.parse(serializeLayout(layout))
    old.version = 1
    const r = parseLayout(JSON.stringify(old))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.layout.cables ?? []).toEqual([])
  })

  it('rejects a cable to a port that is not in the rack', () => {
    const r = edited((raw) => (raw.cables[0]!.to = 'nas:f0.0'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/cable/i)
  })

  it('rejects two cables in one port', () => {
    expect(edited((raw) => raw.cables.push({ id: 'c4', from: 'udm:f2.0', to: 'sw:f1.1' })).ok).toBe(false)
  })

  it('rejects a network cable plugged into a power outlet', () => {
    expect(edited((raw) => (raw.cables[0]!.to = 'pdu:f0.1')).ok).toBe(false)
  })

  it('rejects damaged cable entries', () => {
    expect(edited((raw) => (raw.cables[1]!.lengthMm = -5)).ok).toBe(false)
    expect(edited((raw) => (raw.cables[1]!.lengthMm = 'long')).ok).toBe(false)
    expect(edited((raw) => delete raw.cables[0]!.from).ok).toBe(false)
    expect(edited((raw) => (raw.cables[1]!.id = 'c1')).ok).toBe(false)
    expect(edited((raw) => ((raw as unknown as { cables: unknown }).cables = 'none')).ok).toBe(false)
  })
})

describe('saving colours, hole positions and cable settings', () => {
  const styled: Layout = {
    rack: { standard: '19', heightU: 12, depthMm: 600, style: 'open', casters: false, color: '#c8c8c8' },
    placements: [
      { id: 'udm', itemId: 'ubiquiti-udm-pro', u: 11, side: 'front', hole: 1, color: '#224466' },
      { id: 'sw', itemId: 'ubiquiti-usw-pro-24', u: 9, side: 'front' },
    ],
    cables: [
      {
        id: 'c1',
        from: 'udm:f2.0',
        to: 'sw:f1.0',
        have: true,
        color: '#22aa55',
        diameterMm: 6,
        route: 'post',
      },
    ],
  }
  const edited = (
    change: (raw: {
      rack: Record<string, unknown>
      placements: Record<string, unknown>[]
      cables: Record<string, unknown>[]
    }) => void,
  ) => {
    const raw = JSON.parse(serializeLayout(styled))
    change(raw)
    return parseLayout(JSON.stringify(raw))
  }

  it('comes back exactly as saved', () => {
    const r = parseLayout(serializeLayout(styled))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.layout).toEqual(styled)
  })

  it('rejects values that cannot be right', () => {
    expect(edited((raw) => (raw.placements[0]!.hole = 3)).ok).toBe(false)
    expect(edited((raw) => (raw.placements[0]!.color = 'javascript:alert(1)')).ok).toBe(false)
    expect(edited((raw) => (raw.rack.color = 'red')).ok).toBe(false)
    expect(edited((raw) => (raw.cables[0]!.color = '#12')).ok).toBe(false)
    expect(edited((raw) => (raw.cables[0]!.diameterMm = 400)).ok).toBe(false)
    expect(edited((raw) => (raw.cables[0]!.route = 'scenic')).ok).toBe(false)
    expect(edited((raw) => (raw.cables[0]!.have = 'yes')).ok).toBe(false)
  })

  it('rejects a hole position that makes two devices collide', () => {
    expect(edited((raw) => (raw.placements[1]!.u = 12)).ok).toBe(false)
  })
})
