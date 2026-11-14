import { describe, expect, it } from 'vitest'
import type { Placement, Rack } from './types'
import { FASTENINGS, PRINTERS, advisePrint, fitsOnBed, type Fastening } from './printAdvisor'

const rack = (heightU: number, extra: Partial<Rack> = {}): Rack => ({
  standard: '10',
  heightU,
  depthMm: 200,
  style: 'open',
  casters: false,
  ...extra,
})
const printer = (id: string) => PRINTERS.find((p) => p.id === id)!

describe('fitting a part on a printer bed', () => {
  it('a part shorter than the bed lies flat', () => {
    expect(fitsOnBed(200, 20, { x: 256, y: 256 })).toBe('flat')
  })
  it('a part a little longer than the bed fits corner to corner', () => {
    expect(fitsOnBed(300, 20, { x: 256, y: 256 })).toBe('diagonal')
  })
  it('a part longer than the diagonal does not fit', () => {
    expect(fitsOnBed(366, 20, { x: 256, y: 256 })).toBeNull()
  })
  it('a part that only fits turned 90 degrees still counts as flat', () => {
    expect(fitsOnBed(240, 20, { x: 210, y: 250 })).toBe('flat')
  })
})

describe('the printer list', () => {
  it('has the printers Jacob asked for, with their real build volumes', () => {
    const vol = (id: string) => {
      const p = PRINTERS.find((x) => x.id === id)
      return p ? [p.x, p.y, p.z] : null
    }
    expect(vol('creality-k2-pro')).toEqual([300, 300, 300])
    expect(vol('creality-k3')).toEqual([260, 260, 260])
    expect(vol('snapmaker-u1')).toEqual([270, 270, 270])
    expect(vol('prusa-core-one-indx')).toEqual([248, 205, 270])
    expect(vol('bambu-h2s')).toEqual([340, 320, 340])
    expect(vol('bambu-p2s')).toEqual([256, 256, 256])
    expect(vol('creality-ender-3-v2')).toEqual([220, 220, 250])
  })

  it('gives the H2D the area one nozzle can reach, not the total across both', () => {
    expect(PRINTERS.find((p) => p.id === 'bambu-h2d')).toMatchObject({ x: 325, y: 320 })
  })

  it('has no duplicate ids and no empty volumes', () => {
    expect(new Set(PRINTERS.map((p) => p.id)).size).toBe(PRINTERS.length)
    for (const p of PRINTERS) expect(Math.min(p.x, p.y, p.z)).toBeGreaterThan(100)
  })

  it('the tool changer on a Core One costs bed space: a rail that fits the plain one can need the diagonal', () => {
    const plain = PRINTERS.find((p) => p.id === 'prusa-core-one')!
    const indx = PRINTERS.find((p) => p.id === 'prusa-core-one-indx')!
    expect(fitsOnBed(249, 20, plain)).toBe('flat')
    expect(fitsOnBed(249, 20, indx)).toBe('diagonal')
  })
})

describe('advice for printing a 10 inch rack', () => {
  it('the rails of an 8U rack are about 366 mm long (8 × 44.45 plus the ends)', () => {
    const a = advisePrint(rack(8), [], printer('bambu-p1s'))
    expect(a.rail.lengthMm).toBeCloseTo(8 * 44.45 + 10, 1)
  })

  it('on a Bambu A1 mini (180 mm bed) an 8U rail is printed in two halves of 4U', () => {
    const a = advisePrint(rack(8), [], printer('bambu-a1-mini'))
    expect(a.rail.parts).toBe(2)
    expect(a.rail.partUs).toEqual([4, 4])
    expect(a.rail.orientation).toBe('diagonal')
  })

  it('on a 256 mm bed an 8U rail is too long even corner to corner, so it is split in two', () => {
    const a = advisePrint(rack(8), [], printer('bambu-p1s'))
    expect(a.rail.parts).toBe(2)
    expect(a.rail.orientation).toBe('flat')
  })

  it('on a 256 mm bed a 6U rail prints in one piece, corner to corner', () => {
    const a = advisePrint(rack(6), [], printer('bambu-p1s'))
    expect(a.rail.parts).toBe(1)
    expect(a.rail.orientation).toBe('diagonal')
  })

  it('on a 350 mm Voron an 8U rail prints in one piece', () => {
    const a = advisePrint(rack(8), [], printer('voron-24-350'))
    expect(a.rail.parts).toBe(1)
  })

  it('splits always land between rack units and add up to the rack height', () => {
    for (const u of [4, 6, 8, 9, 12, 16, 22]) {
      for (const pr of PRINTERS) {
        const a = advisePrint(rack(u), [], pr)
        expect(a.rail.partUs.reduce((s, x) => s + x, 0)).toBe(u)
        expect(a.rail.partUs.every((x) => Number.isInteger(x) && x >= 1)).toBe(true)
        expect(a.rail.partUs).toHaveLength(a.rail.parts)
      }
    }
  })

  it('the smallest printer that prints the rails in one piece is named', () => {
    const a = advisePrint(rack(8), [], printer('bambu-a1-mini'))
    expect(a.minBedForOnePieceMm).toBeGreaterThan(256)
    expect(a.minBedForOnePieceMm).toBeLessThan(300)
  })

  it('a 10 inch top plate does not fit a 180 mm bed and is split, but prints whole on a 360 mm bed', () => {
    expect(advisePrint(rack(8), [], printer('bambu-a1-mini')).plate.parts).toBeGreaterThan(1)
    expect(advisePrint(rack(8, { depthMm: 200 }), [], printer('prusa-xl')).plate.parts).toBe(1)
  })

  it('counts four screws and four nuts per mounted device, and more for tall ones', () => {
    const placements: Placement[] = [
      { id: 'a', itemId: 'patch-panel-12-10', u: 8, side: 'front' },
      { id: 'b', itemId: 'shelf-1u-10', u: 7, side: 'front' },
      {
        id: 'c',
        itemId: 'fan-panel',
        u: 1,
        side: 'front',
        config: { kind: 'fanPanel', fanSizeMm: 120, count: 1, direction: 'out' },
      },
    ]
    const a = advisePrint(rack(8), placements, printer('bambu-p1s'))
    const screws = a.hardware.find((h) => h.id === 'device-screws')!
    expect(screws.qty).toBe(4 + 4 + 8)
    expect(a.hardware.find((h) => h.id === 'device-nuts')!.qty).toBe(screws.qty)
  })

  it('split rails need joint bolts and pins, whole rails need none', () => {
    const split = advisePrint(rack(8), [], printer('bambu-a1-mini'))
    // 4 rails, 1 joint each
    expect(split.hardware.find((h) => h.id === 'joint-bolts')!.qty).toBe(4 * 1 * 2)
    const whole = advisePrint(rack(8), [], printer('voron-24-350'))
    expect(whole.hardware.find((h) => h.id === 'joint-bolts')).toBeUndefined()
  })

  it('lists casters only when the rack has wheels, otherwise feet', () => {
    const wheels = advisePrint(rack(8, { casters: true }), [], printer('bambu-p1s'))
    expect(wheels.hardware.find((h) => h.id === 'casters')!.qty).toBe(4)
    expect(wheels.hardware.find((h) => h.id === 'feet')).toBeUndefined()
    const feet = advisePrint(rack(8), [], printer('bambu-p1s'))
    expect(feet.hardware.find((h) => h.id === 'feet')!.qty).toBe(4)
  })

  it('a taller rack needs more filament', () => {
    const small = advisePrint(rack(4), [], printer('bambu-p1s'))
    const tall = advisePrint(rack(12), [], printer('bambu-p1s'))
    expect(tall.filamentGrams).toBeGreaterThan(small.filamentGrams)
    expect(small.filamentGrams).toBeGreaterThan(100)
  })

  it('warns against printing a 19 inch rack that carries heavy servers', () => {
    const placements: Placement[] = [{ id: 'a', itemId: 'dell-r740', u: 1, side: 'front' }]
    const a = advisePrint(rack(12, { standard: '19', depthMm: 800 }), placements, printer('voron-24-350'))
    expect(a.warnings.join(' ')).toMatch(/metal|extrusion/i)
  })
})

describe('one way of fastening at a time', () => {
  const rack: Rack = { standard: '10', heightU: 8, depthMm: 260, style: 'open', casters: false }
  const gear: Placement[] = [{ id: 'a', itemId: 'patch-panel-12-10', u: 8, side: 'front' }]
  const printer = PRINTERS.find((p) => p.id === 'bambu-p1s')!
  const lines = (fastening: Fastening) => advisePrint(rack, gear, printer, { fastening }).hardware

  it.each([
    ['inserts', /heat-set inserts/i, /nuts/i],
    ['captive-nuts', /square nuts/i, /insert|cage/i],
    ['cage-nuts', /cage nuts/i, /insert|square nuts/i],
  ] as const)('%s lists only that kind for the equipment', (fastening, wanted, unwanted) => {
    const nuts = lines(fastening).find((h) => h.id === 'device-nuts')!
    expect(nuts.label).toMatch(wanted)
    expect(nuts.label).not.toMatch(unwanted)
    expect(nuts.label).not.toMatch(/\bor\b/)
    expect(nuts.qty).toBe(4)
    expect(lines(fastening).filter((h) => h.id === 'device-nuts')).toHaveLength(1)
  })

  it('printed threads need nothing but the screws', () => {
    expect(lines('printed-threads').find((h) => h.id === 'device-nuts')).toBeUndefined()
    expect(lines('printed-threads').find((h) => h.id === 'device-screws')!.qty).toBe(4)
  })

  it('no line anywhere offers two alternatives at once', () => {
    for (const f of FASTENINGS) for (const h of lines(f.id)) expect(h.label).not.toMatch(/ or /)
  })
})
