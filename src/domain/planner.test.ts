import { describe, expect, it } from 'vitest'
import { planRack } from './planner'
import { validateLayout, occupiedRange } from './placement'

const homelab = [
  { itemId: 'ubiquiti-udm-pro', qty: 1 },
  { itemId: 'ubiquiti-usw-pro-24', qty: 1 },
  { itemId: 'patch-panel-24-19', qty: 1 },
  { itemId: 'dell-r740', qty: 2 },
  { itemId: 'apc-smt1500rm2u', qty: 1 },
]

describe('suggesting a rack size from a wish list', () => {
  it('a UDM Pro, a switch, a patch panel, two R740 and a 2U UPS need 9U, and a 12U rack with 25% headroom', () => {
    const plan = planRack(homelab, { standard: '19', headroomPct: 25 })
    expect(plan.usedU).toBe(9)
    expect(plan.requiredU).toBe(12) // 9 × 1.25 = 11.25, rounded up
    expect(plan.suggestedHeightU).toBe(12)
    expect(plan.issues).toEqual([])
  })

  it('without headroom the same list gets the smallest standard rack that holds 9U', () => {
    const plan = planRack(homelab, { standard: '19', headroomPct: 0 })
    expect(plan.requiredU).toBe(9)
    expect(plan.suggestedHeightU).toBe(9)
  })

  it('the minimum depth is set by the deepest device plus room for cables', () => {
    const plan = planRack(homelab, { standard: '19', headroomPct: 25 })
    expect(plan.minDepthMm).toBeGreaterThan(737)
  })

  it('lays the plan out without overlaps, network gear at the top and the UPS at the bottom', () => {
    const plan = planRack(homelab, { standard: '19', headroomPct: 25 })
    expect(plan.layout).not.toBeNull()
    const { rack, placements } = plan.layout!
    expect(validateLayout(rack, placements).filter((i) => i.code !== 'too-deep')).toEqual([])
    const ups = placements.find((p) => p.itemId === 'apc-smt1500rm2u')!
    const udm = placements.find((p) => p.itemId === 'ubiquiti-udm-pro')!
    expect(ups.u).toBe(1)
    expect(occupiedRange(udm).to).toBe(rack.heightU)
    expect(placements).toHaveLength(6)
  })

  it('suggests real racks of that standard that are tall enough, smallest first', () => {
    const plan = planRack(homelab, { standard: '19', headroomPct: 25 })
    expect(plan.racks.length).toBeGreaterThan(0)
    for (const r of plan.racks) {
      expect(r.product.standard).toBe('19')
      expect(r.product.heightU).toBeGreaterThanOrEqual(plan.requiredU)
    }
    const heights = plan.racks.map((r) => r.product.heightU)
    expect([...heights].sort((a, b) => a - b)).toEqual(heights)
    // an R740 is 737 mm deep: shallow wall racks must be flagged, not hidden
    expect(plan.racks.some((r) => !r.depthOk)).toBe(true)
  })

  it('puts loose mini PCs on shelves: three M720q in a 10 inch rack need three 1U shelves', () => {
    const plan = planRack([{ itemId: 'lenovo-m720q', qty: 3 }], { standard: '10', headroomPct: 0 })
    expect(plan.shelvesAdded).toBe(3)
    expect(plan.usedU).toBe(3)
    expect(plan.suggestedHeightU).toBe(4)
  })

  it('in a 19 inch rack the same three need two shelves, two on one and one on the other', () => {
    const plan = planRack([{ itemId: 'lenovo-m720q', qty: 3 }], { standard: '19', headroomPct: 0 })
    expect(plan.shelvesAdded).toBe(2)
    const counts = plan.layout!.placements.map((p) => p.children?.length ?? 0).sort()
    expect(counts).toEqual([1, 2])
  })

  it('lays the list out in a bought rack when one is picked, keeping its real size', () => {
    const base = planRack(homelab, { standard: '19', headroomPct: 25 })
    const product = base.racks.find((r) => r.product.heightU > 12)!.product
    const plan = planRack(homelab, { standard: '19', headroomPct: 25, forRack: product })
    expect(plan.layout!.rack).toMatchObject({
      heightU: product.heightU,
      depthMm: product.depthMm,
      productId: product.id,
    })
    expect(
      validateLayout(plan.layout!.rack, plan.layout!.placements).filter((i) => i.code === 'overlap'),
    ).toEqual([])
    expect(plan.suggestedHeightU).toBe(12)
  })

  it('refuses to lay the list out in a bought rack that is too small', () => {
    const tiny = { ...planRack(homelab, { standard: '19', headroomPct: 0 }).racks[0]!.product, heightU: 4 }
    expect(planRack(homelab, { standard: '19', headroomPct: 0, forRack: tiny }).layout).toBeNull()
  })

  it('an empty list gives no suggestion and no error', () => {
    const plan = planRack([], { standard: '19', headroomPct: 25 })
    expect(plan.usedU).toBe(0)
    expect(plan.suggestedHeightU).toBeNull()
    expect(plan.layout).toBeNull()
    expect(plan.issues).toEqual([])
  })

  it('says so when the list is too big for any standard rack', () => {
    const plan = planRack([{ itemId: 'dell-r740', qty: 30 }], { standard: '19', headroomPct: 0 })
    expect(plan.usedU).toBe(60)
    expect(plan.suggestedHeightU).toBeNull()
    expect(plan.layout).toBeNull()
  })

  it('flags 19 inch gear on a 10 inch plan instead of pretending it fits', () => {
    const plan = planRack([{ itemId: 'dell-r740', qty: 1 }], { standard: '10', headroomPct: 0 })
    expect(plan.issues.map((i) => i.code)).toContain('wrong-standard')
    expect(plan.usedU).toBe(0)
  })

  it('ignores zero and negative quantities', () => {
    const plan = planRack(
      [
        { itemId: 'dell-r740', qty: 0 },
        { itemId: 'ubiquiti-udm-pro', qty: -2 },
      ],
      {
        standard: '19',
        headroomPct: 0,
      },
    )
    expect(plan.usedU).toBe(0)
  })
})
