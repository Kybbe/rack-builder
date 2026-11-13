import { describe, expect, it } from 'vitest'
import type { Placement, Rack } from './types'
import { dropTarget, rackGeometry, yOfU } from './geometry'
import { U_MM } from './units'

const rack: Rack = { standard: '19', heightU: 12, depthMm: 800, style: 'open', casters: false }
const mid = (u: number) => yOfU(rack, u) + U_MM / 2

describe('dropping a dragged device on the rack', () => {
  it('a 1U device lands in the unit under the cursor', () => {
    const t = dropTarget(rack, [], { itemId: 'ubiquiti-udm-pro' }, mid(5), 'front')
    expect(t).toMatchObject({ kind: 'rail', u: 5, heightU: 1, ok: true })
  })

  it('a 2U device centres on the cursor: on the line between U5 and U6 it takes both', () => {
    const t = dropTarget(rack, [], { itemId: 'dell-r740' }, yOfU(rack, 6), 'front')
    expect(t).toMatchObject({ u: 5, heightU: 2, ok: true })
  })

  it('snaps back inside the rack when the cursor is above the top or below the bottom', () => {
    expect(dropTarget(rack, [], { itemId: 'dell-r740' }, 99999, 'front')).toMatchObject({ u: 11, ok: true })
    expect(dropTarget(rack, [], { itemId: 'dell-r740' }, -500, 'front')).toMatchObject({ u: 1, ok: true })
  })

  it('shows a refused drop on an occupied unit', () => {
    const placements: Placement[] = [{ id: 'a', itemId: 'ubiquiti-udm-pro', u: 5, side: 'front' }]
    const t = dropTarget(rack, placements, { itemId: 'ubiquiti-usw-pro-24' }, mid(5), 'front')
    expect(t?.ok).toBe(false)
    expect(t?.issues.map((i) => i.code)).toContain('overlap')
  })

  it('a device being moved does not collide with itself', () => {
    const placements: Placement[] = [{ id: 'a', itemId: 'dell-r740', u: 5, side: 'front' }]
    const t = dropTarget(rack, placements, { itemId: 'dell-r740', moveId: 'a' }, yOfU(rack, 7), 'front')
    expect(t).toMatchObject({ u: 6, ok: true })
  })

  it('a mini PC dropped on a shelf goes onto that shelf', () => {
    const placements: Placement[] = [{ id: 's', itemId: 'shelf-1u-19', u: 3, side: 'front' }]
    const t = dropTarget(rack, placements, { itemId: 'lenovo-m720q' }, mid(3), 'front')
    expect(t).toMatchObject({ kind: 'shelf', shelfId: 's', ok: true })
  })

  it('dropping just above a shelf, where the device will stand, also counts as on the shelf', () => {
    const placements: Placement[] = [{ id: 's', itemId: 'shelf-1u-19', u: 3, side: 'front' }]
    expect(dropTarget(rack, placements, { itemId: 'lenovo-m720q' }, mid(4), 'front')).toMatchObject({
      kind: 'shelf',
      shelfId: 's',
      ok: true,
    })
    const blocked: Placement[] = [
      ...placements,
      { id: 'sw', itemId: 'ubiquiti-udm-pro', u: 4, side: 'front' },
    ]
    expect(dropTarget(rack, blocked, { itemId: 'lenovo-m720q' }, mid(4), 'front')).toMatchObject({
      kind: 'rail',
      ok: false,
    })
  })

  it('a mini PC dropped on bare rails is refused with the reason', () => {
    const t = dropTarget(rack, [], { itemId: 'lenovo-m720q' }, mid(3), 'front')
    expect(t?.ok).toBe(false)
    expect(t?.issues[0]?.code).toBe('needs-shelf')
  })

  it('a third mini PC on a full shelf is refused', () => {
    const placements: Placement[] = [
      {
        id: 's',
        itemId: 'shelf-1u-19',
        u: 3,
        side: 'front',
        children: [
          { id: 'k1', itemId: 'lenovo-m720q', orientation: 'flat' },
          { id: 'k2', itemId: 'lenovo-m720q', orientation: 'flat' },
        ],
      },
    ]
    const t = dropTarget(rack, placements, { itemId: 'lenovo-m720q' }, mid(3), 'front')
    expect(t).toMatchObject({ kind: 'shelf', ok: false })
  })

  it('the rear face is its own side', () => {
    const placements: Placement[] = [{ id: 'a', itemId: 'patch-panel-24-19', u: 5, side: 'front' }]
    expect(dropTarget(rack, placements, { itemId: 'pdu-8-19' }, mid(5), 'rear')).toMatchObject({
      side: 'rear',
      ok: true,
    })
  })

  it('wheels lift the first unit off the floor', () => {
    expect(rackGeometry({ ...rack, casters: true }).u1Y).toBeGreaterThan(rackGeometry(rack).u1Y)
  })
})
