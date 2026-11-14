import { describe, expect, it } from 'vitest'
import type { Placement, Rack } from './types'
import {
  addPlacement,
  bottomMm,
  stepHole,
  checkPlacement,
  firstFreeU,
  movePlacement,
  occupiedRange,
  removePlacement,
  resolvePlacement,
  validateLayout,
} from './placement'

const rack19: Rack = { standard: '19', heightU: 42, depthMm: 800, style: 'open', casters: false }
const rack10: Rack = { standard: '10', heightU: 8, depthMm: 300, style: 'open', casters: false }

const p = (itemId: string, u: number, extra: Partial<Placement> = {}): Placement => ({
  id: `${itemId}@${u}${extra.side ?? ''}`,
  itemId,
  u,
  side: 'front',
  ...extra,
})

describe('placing equipment in a rack', () => {
  it('a 1U UDM Pro fits in any free unit of a 19 inch rack', () => {
    const r = checkPlacement(rack19, [], p('ubiquiti-udm-pro', 42))
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('a 2U server occupies its own unit and the one above', () => {
    expect(occupiedRange(p('dell-r740', 10))).toEqual({ from: 10, to: 11 })
  })

  it('refuses a 2U server in the top unit, because it would stick out above the rack', () => {
    const r = checkPlacement(rack19, [], p('dell-r740', 42))
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('out-of-bounds')
    expect(checkPlacement(rack19, [], p('dell-r740', 41)).ok).toBe(true)
  })

  it('refuses unit 0 and below', () => {
    expect(checkPlacement(rack19, [], p('ubiquiti-udm-pro', 0)).ok).toBe(false)
  })

  it('refuses two devices in the same units', () => {
    const existing = [p('dell-r740', 10)]
    expect(checkPlacement(rack19, existing, p('ubiquiti-udm-pro', 11)).errors.map((e) => e.code)).toContain(
      'overlap',
    )
    expect(checkPlacement(rack19, existing, p('ubiquiti-udm-pro', 12)).ok).toBe(true)
    expect(checkPlacement(rack19, existing, p('ubiquiti-udm-pro', 9)).ok).toBe(true)
  })

  it('refuses 19 inch equipment in a 10 inch rack', () => {
    const r = checkPlacement(rack10, [], p('ubiquiti-udm-pro', 1))
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('wrong-standard')
  })

  it('allows 10 inch equipment in a 19 inch rack but warns that adapter ears are needed', () => {
    const r = checkPlacement(rack19, [], p('patch-panel-12-10', 5))
    expect(r.ok).toBe(true)
    expect(r.warnings.map((w) => w.code)).toContain('needs-adapter')
  })

  it('warns when a device is deeper than the rack', () => {
    const shallow: Rack = { ...rack19, depthMm: 450 }
    const r = checkPlacement(shallow, [], p('dell-r740', 1))
    expect(r.ok).toBe(true)
    expect(r.warnings.map((w) => w.code)).toContain('too-deep')
    expect(checkPlacement(rack19, [], p('dell-r740', 1)).warnings).toEqual([])
  })

  it('lets a short device share a unit front and rear, as long as the two do not meet in the middle', () => {
    const front = [p('patch-panel-24-19', 20)]
    const rearPdu = p('pdu-8-19', 20, { side: 'rear' })
    expect(checkPlacement(rack19, front, rearPdu).ok).toBe(true)

    const deepFront = [p('dell-r740', 20)]
    // 737.5 mm server + 60 mm PDU do not fit behind each other in 750 mm, but do in 800 mm
    const r = checkPlacement({ ...rack19, depthMm: 750 }, deepFront, rearPdu)
    expect(checkPlacement(rack19, deepFront, rearPdu).ok).toBe(true)
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('overlap')
  })

  it('refuses a loose device straight on the rails, because it needs a shelf', () => {
    const r = checkPlacement(rack19, [], p('lenovo-m720q', 5))
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('needs-shelf')
  })

  it('refuses an item that is not in the catalog', () => {
    expect(checkPlacement(rack19, [], p('no-such-thing', 5)).errors.map((e) => e.code)).toContain(
      'unknown-item',
    )
  })
})

describe('changing a layout', () => {
  it('adding keeps the old layout untouched and returns the new one', () => {
    const before: Placement[] = []
    const r = addPlacement(rack19, before, p('ubiquiti-udm-pro', 42))
    expect(r.ok).toBe(true)
    expect(r.placements).toHaveLength(1)
    expect(before).toHaveLength(0)
  })

  it('a refused add leaves the layout exactly as it was', () => {
    const before = [p('dell-r740', 10)]
    const r = addPlacement(rack19, before, p('ubiquiti-udm-pro', 10))
    expect(r.ok).toBe(false)
    expect(r.placements).toBe(before)
  })

  it('a device can move onto units it already occupies itself', () => {
    const before = [p('dell-r740', 10)]
    const r = movePlacement(rack19, before, before[0]!.id, 11, 'front')
    expect(r.ok).toBe(true)
    expect(r.placements[0]!.u).toBe(11)
  })

  it('a move into another device is refused and nothing moves', () => {
    const before = [p('dell-r740', 10), p('ubiquiti-udm-pro', 12)]
    const r = movePlacement(rack19, before, before[1]!.id, 11, 'front')
    expect(r.ok).toBe(false)
    expect(r.placements).toBe(before)
  })

  it('removing takes out only that device', () => {
    const before = [p('dell-r740', 10), p('ubiquiti-udm-pro', 12)]
    expect(removePlacement(before, before[0]!.id).map((x) => x.itemId)).toEqual(['ubiquiti-udm-pro'])
  })

  it('finds the highest free unit for light gear and the lowest for heavy gear', () => {
    const existing = [p('ubiquiti-udm-pro', 42)]
    expect(firstFreeU(rack19, existing, p('ubiquiti-usw-pro-24', 0))).toBe(41)
    expect(firstFreeU(rack19, existing, p('apc-smt1500rm2u', 0))).toBe(1)
  })

  it('reports no free unit when the rack is full', () => {
    const full: Placement[] = Array.from({ length: 8 }, (_, i) => p('patch-panel-12-10', i + 1))
    expect(firstFreeU(rack10, full, p('patch-panel-12-10', 0))).toBeNull()
  })

  it('shrinking the rack reports the devices that no longer fit', () => {
    const placements = [p('patch-panel-12-10', 8), p('patch-panel-12-10', 2)]
    const issues = validateLayout({ ...rack10, heightU: 4 }, placements)
    expect(issues.filter((i) => i.code === 'out-of-bounds').map((i) => i.placementId)).toEqual([
      placements[0]!.id,
    ])
  })
})

describe('parts whose size follows from a choice', () => {
  it('a front panel with 120 mm fans is 3U tall, and with 40 mm fans 1U', () => {
    const big = resolvePlacement(
      p('fan-panel', 1, { config: { kind: 'fanPanel', fanSizeMm: 120, count: 3, direction: 'out' } }),
      rack19,
    )
    expect(big?.heightU).toBe(3)
    const small = resolvePlacement(
      p('fan-panel', 1, { config: { kind: 'fanPanel', fanSizeMm: 40, count: 4, direction: 'in' } }),
      rack19,
    )
    expect(small?.heightU).toBe(1)
  })

  it('a 10 inch rack takes fewer fans side by side than a 19 inch rack', () => {
    const cfg = { kind: 'fanPanel', fanSizeMm: 80, count: 1, direction: 'out' } as const
    const in10 = resolvePlacement(p('fan-panel', 1, { config: cfg }), rack10)
    const in19 = resolvePlacement(p('fan-panel', 1, { config: cfg }), rack19)
    expect(in10?.maxCount).toBe(2)
    expect(in19?.maxCount).toBe(5)
  })

  it('a flat fan tray stays 1U whatever the fan size', () => {
    const tray = resolvePlacement(
      p('fan-tray', 1, { config: { kind: 'fanTray', fanSizeMm: 120, count: 2, direction: 'up' } }),
      rack19,
    )
    expect(tray?.heightU).toBe(1)
  })

  it('twelve 3.5 inch drives lying flat need 2U in a 19 inch rack (three rows of four)', () => {
    const bay = resolvePlacement(
      p('drive-bay', 1, {
        config: { kind: 'driveBay', driveSize: '3.5', orientation: 'horizontal', count: 12 },
      }),
      rack19,
    )
    expect(bay?.heightU).toBe(2)
  })

  it('3.5 inch drives standing up need 3U', () => {
    const bay = resolvePlacement(
      p('drive-bay', 1, {
        config: { kind: 'driveBay', driveSize: '3.5', orientation: 'vertical', count: 8 },
      }),
      rack19,
    )
    expect(bay?.heightU).toBe(3)
  })

  it('twenty-four 2.5 inch drives standing up fit in 2U of a 19 inch rack', () => {
    const bay = resolvePlacement(
      p('drive-bay', 1, {
        config: { kind: 'driveBay', driveSize: '2.5', orientation: 'vertical', count: 24 },
      }),
      rack19,
    )
    expect(bay?.heightU).toBe(2)
    expect(bay?.maxCount).toBeGreaterThanOrEqual(24)
  })

  it('a bigger drive bay pushes into the device above and is refused', () => {
    const existing = [p('ubiquiti-udm-pro', 2)]
    const bay = p('drive-bay', 1, {
      config: { kind: 'driveBay', driveSize: '3.5', orientation: 'vertical', count: 8 },
    })
    expect(checkPlacement(rack19, existing, bay).errors.map((e) => e.code)).toContain('overlap')
  })
})

describe('mounting one or two holes off the unit grid', () => {
  it('a device moved up one hole sits 15.875 mm higher, two holes 31.75 mm', () => {
    expect(bottomMm(p('ubiquiti-udm-pro', 5))).toBeCloseTo(4 * 44.45)
    expect(bottomMm(p('ubiquiti-udm-pro', 5, { hole: 1 }))).toBeCloseTo(4 * 44.45 + 15.875)
    expect(bottomMm(p('ubiquiti-udm-pro', 5, { hole: 2 }))).toBeCloseTo(4 * 44.45 + 31.75)
  })

  it('a device one hole up runs into the device in the unit above', () => {
    const above = p('ubiquiti-usw-pro-24', 6)
    const r = checkPlacement(rack19, [above], p('ubiquiti-udm-pro', 5, { hole: 1 }))
    expect(r.ok).toBe(false)
    expect(r.errors[0]!.code).toBe('overlap')
  })

  it('it also runs into a device that starts in the same unit', () => {
    expect(
      checkPlacement(rack19, [p('ubiquiti-usw-pro-24', 5)], p('ubiquiti-udm-pro', 5, { hole: 2 })).ok,
    ).toBe(false)
  })

  it('two devices shifted by the same hole stack without a gap', () => {
    const lower = p('ubiquiti-udm-pro', 5, { hole: 1 })
    expect(checkPlacement(rack19, [lower], p('ubiquiti-usw-pro-24', 6, { hole: 1 })).ok).toBe(true)
  })

  it('leaves room below for nothing: the unit it left is only partly free', () => {
    const shifted = p('ubiquiti-udm-pro', 5, { hole: 1 })
    expect(checkPlacement(rack19, [shifted], p('ubiquiti-usw-pro-24', 5)).ok).toBe(false)
    expect(checkPlacement(rack19, [shifted], p('ubiquiti-usw-pro-24', 4)).ok).toBe(true)
  })

  it('cannot stick out of the top of the rack', () => {
    const r = checkPlacement(rack19, [], p('ubiquiti-udm-pro', 42, { hole: 1 }))
    expect(r.ok).toBe(false)
    expect(r.errors[0]!.code).toBe('out-of-bounds')
  })

  it('moving a device keeps the hole only when one is given', () => {
    const start = [p('ubiquiti-udm-pro', 5, { hole: 2 })]
    const onGrid = movePlacement(rack19, start, start[0]!.id, 9, 'front')
    expect(onGrid.placements[0]).toMatchObject({ u: 9 })
    expect(onGrid.placements[0]!.hole).toBeUndefined()
    const off = movePlacement(rack19, start, start[0]!.id, 9, 'front', 1)
    expect(off.placements[0]).toMatchObject({ u: 9, hole: 1 })
  })

  it('steps hole by hole across unit borders', () => {
    expect(stepHole({ u: 5, hole: 0 }, 1)).toEqual({ u: 5, hole: 1 })
    expect(stepHole({ u: 5, hole: 2 }, 1)).toEqual({ u: 6, hole: 0 })
    expect(stepHole({ u: 5, hole: 0 }, -1)).toEqual({ u: 4, hole: 2 })
    expect(stepHole({ u: 5 }, -1)).toEqual({ u: 4, hole: 2 })
  })
})
