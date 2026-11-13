import { describe, expect, it } from 'vitest'
import type { Placement, Rack } from './types'
import { budget } from './budget'

const rack: Rack = { standard: '19', heightU: 12, depthMm: 800, style: 'open', casters: false }

describe('rack totals', () => {
  it('an empty rack uses nothing', () => {
    expect(budget(rack, [])).toMatchObject({ usedU: 0, freeU: 12, weightKg: 0, powerW: 0 })
  })

  it('adds up units, weight and power, including the devices on shelves', () => {
    const placements: Placement[] = [
      { id: 'a', itemId: 'dell-r740', u: 1, side: 'front' },
      {
        id: 'b',
        itemId: 'shelf-1u-19',
        u: 5,
        side: 'front',
        children: [
          { id: 'k1', itemId: 'lenovo-m720q', orientation: 'flat' },
          { id: 'k2', itemId: 'lenovo-m720q', orientation: 'flat' },
        ],
      },
    ]
    const b = budget(rack, placements)
    expect(b.usedU).toBe(3)
    expect(b.freeU).toBe(9)
    const empty = budget(rack, [placements[0]!, { ...placements[1]!, children: [] }])
    expect(b.weightKg).toBeCloseTo(empty.weightKg + 2 * 1.32, 2)
    expect(b.powerW).toBe(empty.powerW + 2 * 65)
  })

  it('a unit used front and rear counts once', () => {
    const placements: Placement[] = [
      { id: 'a', itemId: 'patch-panel-24-19', u: 5, side: 'front' },
      { id: 'b', itemId: 'pdu-8-19', u: 5, side: 'rear' },
    ]
    expect(budget(rack, placements).usedU).toBe(1)
  })
})
