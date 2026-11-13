import { describe, expect, it } from 'vitest'
import type { Placement, Rack, ShelfChild } from './types'
import { addToShelf, shelfLayout } from './shelf'
import { checkPlacement, occupiedRange } from './placement'

const rack19: Rack = { standard: '19', heightU: 12, depthMm: 600, style: 'open', casters: false }
const rack10: Rack = { standard: '10', heightU: 8, depthMm: 300, style: 'open', casters: false }
const kids = (itemId: string, n: number, orientation: ShelfChild['orientation'] = 'flat'): ShelfChild[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${itemId}-${i}`, itemId, orientation }))
const shelf = (rack: Rack, children: ShelfChild[], u = 1): Placement => ({
  id: 'shelf',
  itemId: rack.standard === '19' ? 'shelf-1u-19' : 'shelf-1u-10',
  u,
  side: 'front',
  children,
})

describe('devices side by side on a shelf', () => {
  it('two Lenovo M720q Tiny fit beside each other on a 19 inch shelf', () => {
    const l = shelfLayout(shelf(rack19, kids('lenovo-m720q', 2)), rack19)
    expect(l.fits).toBe(true)
    expect(l.slots).toHaveLength(2)
    // side by side, not on top of each other
    expect(l.slots[0]!.xMm + l.slots[0]!.widthMm).toBeLessThanOrEqual(l.slots[1]!.xMm)
  })

  it('spreads the devices evenly: the same gap at both edges and between them', () => {
    const l = shelfLayout(
      shelf(rack19, [...kids('lenovo-m720q', 1), ...kids('apple-mac-mini-m4', 1)]),
      rack19,
    )
    const [a, b] = l.slots
    const left = a!.xMm
    const between = b!.xMm - (a!.xMm + a!.widthMm)
    const right = l.usableMm - (b!.xMm + b!.widthMm)
    expect(between).toBeCloseTo(left, 5)
    expect(right).toBeCloseTo(left, 5)
    expect(left).toBeGreaterThan(5)
  })

  it('a single device stands in the middle of the shelf', () => {
    const l = shelfLayout(shelf(rack19, kids('raspberry-pi-5', 1)), rack19)
    const s = l.slots[0]!
    expect(s.xMm + s.widthMm / 2).toBeCloseTo(l.usableMm / 2, 5)
  })

  it('different devices share a shelf as long as their widths add up', () => {
    const mixed = [...kids('lenovo-m720q', 1), ...kids('apple-mac-mini-m4', 1), ...kids('raspberry-pi-5', 1)]
    expect(shelfLayout(shelf(rack19, mixed), rack19).fits).toBe(true)
    expect(shelfLayout(shelf(rack10, [...kids('raspberry-pi-5', 2)]), rack10).fits).toBe(true)
    expect(
      shelfLayout(shelf(rack10, [...kids('lenovo-m720q', 1), ...kids('raspberry-pi-5', 1)]), rack10).fits,
    ).toBe(false)
  })

  it('devices that only just fit still keep a finger of room between them', () => {
    // two Raspberry Pi (85 mm) and a ZimaBoard on its side (34.9 mm) with two 5 mm gaps: 214.9 of 215 mm
    const tight = [...kids('raspberry-pi-5', 2), ...kids('zimaboard-832', 1, 'upright')]
    const l = shelfLayout(shelf(rack10, tight), rack10)
    expect(l.fits).toBe(true)
    for (let i = 1; i < l.slots.length; i++)
      expect(l.slots[i]!.xMm - (l.slots[i - 1]!.xMm + l.slots[i - 1]!.widthMm)).toBeGreaterThanOrEqual(4)
  })

  it('three M720q lying flat do not fit on a 19 inch shelf', () => {
    expect(shelfLayout(shelf(rack19, kids('lenovo-m720q', 3)), rack19).fits).toBe(false)
  })

  it('a 10 inch shelf takes one M720q lying flat, not two', () => {
    expect(shelfLayout(shelf(rack10, kids('lenovo-m720q', 1)), rack10).fits).toBe(true)
    expect(shelfLayout(shelf(rack10, kids('lenovo-m720q', 2)), rack10).fits).toBe(false)
  })

  it('standing them on their side fits more across, but the shelf then takes more units', () => {
    const upright = shelf(rack10, kids('lenovo-m720q', 4, 'upright'))
    expect(shelfLayout(upright, rack10).fits).toBe(true)
    expect(occupiedRange(upright).to - occupiedRange(upright).from + 1).toBeGreaterThan(1)
    const flat = shelf(rack10, kids('lenovo-m720q', 1))
    expect(occupiedRange(flat)).toEqual({ from: 1, to: 1 })
  })

  it('an empty shelf is 1U', () => {
    expect(occupiedRange(shelf(rack19, []))).toEqual({ from: 1, to: 1 })
  })

  it('a tall device on a shelf blocks the unit above it', () => {
    const withMac = shelf(rack19, kids('apple-mac-mini-m4', 1), 1)
    expect(occupiedRange(withMac)).toEqual({ from: 1, to: 2 })
    const above: Placement = { id: 'sw', itemId: 'ubiquiti-udm-pro', u: 2, side: 'front' }
    expect(checkPlacement(rack19, [withMac], above).ok).toBe(false)
  })

  it('adding to a full shelf is refused and the shelf keeps what it had', () => {
    const before = [shelf(rack10, kids('lenovo-m720q', 1))]
    const r = addToShelf(rack10, before, 'shelf', 'lenovo-m720q')
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('shelf-full')
    expect(r.placements).toBe(before)
  })

  it('adding a device that makes the shelf taller is refused when something sits right above', () => {
    const before: Placement[] = [
      shelf(rack19, [], 1),
      { id: 'sw', itemId: 'ubiquiti-udm-pro', u: 2, side: 'front' },
    ]
    const r = addToShelf(rack19, before, 'shelf', 'apple-mac-mini-m4')
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('overlap')
  })

  it('only shelves take loose devices', () => {
    const before: Placement[] = [{ id: 'sw', itemId: 'ubiquiti-udm-pro', u: 2, side: 'front' }]
    expect(addToShelf(rack19, before, 'sw', 'lenovo-m720q').errors.map((e) => e.code)).toContain(
      'not-a-shelf',
    )
  })

  it('rack-mount gear cannot be put on a shelf as a loose device', () => {
    const before = [shelf(rack19, [])]
    expect(addToShelf(rack19, before, 'shelf', 'ubiquiti-udm-pro').ok).toBe(false)
  })

  it('warns when a device is deeper than the shelf under it', () => {
    const l = shelfLayout(shelf(rack10, kids('minisforum-ms-01', 1)), rack10)
    expect(l.warnings.map((w) => w.code)).toContain('child-too-deep')
  })
})
