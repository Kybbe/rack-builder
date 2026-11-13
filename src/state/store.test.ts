import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_RACK, useStore } from './store'

const s = () => useStore.getState()

beforeEach(() => {
  localStorage.clear()
  useStore.setState({ rack: { ...DEFAULT_RACK }, placements: [], past: [], selectedId: null })
})

describe('editing the rack in the app', () => {
  it('shrinking the rack is refused while a device sits in the units that would disappear', () => {
    s().add('patch-panel-12-10', 8, 'front')
    const r = s().setRack({ heightU: 4 })
    expect(r.ok).toBe(false)
    expect(r.errors[0]!.message).toMatch(/1 device would not fit/)
    expect(s().rack.heightU).toBe(8)
    expect(s().placements).toHaveLength(1)
  })

  it('switching to 10 inch is refused while 19 inch gear is mounted', () => {
    s().setRack({ standard: '19', heightU: 12, depthMm: 800 })
    s().add('ubiquiti-udm-pro', 12, 'front')
    expect(s().setRack({ standard: '10' }).ok).toBe(false)
    expect(s().rack.standard).toBe('19')
  })

  it('growing the rack keeps every device where it was', () => {
    s().add('patch-panel-12-10', 8, 'front')
    expect(s().setRack({ heightU: 12 }).ok).toBe(true)
    expect(s().placements[0]!.u).toBe(8)
  })

  it('choosing a real rack takes over its size, and editing the size afterwards forgets the product', () => {
    expect(s().applyRackProduct('deskpi-rackmate-t2').ok).toBe(true)
    expect(s().rack).toMatchObject({ standard: '10', heightU: 12, productId: 'deskpi-rackmate-t2' })
    s().setRack({ heightU: 9 })
    expect(s().rack.productId).toBeUndefined()
  })

  it('a wall-mounted rack has no wheels', () => {
    s().setRack({ casters: true })
    s().setRack({ style: 'wall' })
    expect(s().rack.casters).toBe(false)
  })

  it('undo brings back a deleted device with what was on it', () => {
    const shelf = s().add('shelf-1u-10', 3, 'front')
    s().addChild(shelf.id!, 'raspberry-pi-5')
    s().remove(shelf.id!)
    expect(s().placements).toHaveLength(0)
    expect(s().undo()).toBe(true)
    expect(s().placements[0]!.children).toHaveLength(1)
  })

  it('undo with nothing to undo does nothing', () => {
    expect(s().undo()).toBe(false)
  })

  it('quick-add puts a mini PC on the first shelf with room, and says so when there is none', () => {
    expect(s().addAuto('lenovo-m720q').ok).toBe(false)
    s().add('shelf-1u-10', 3, 'front')
    expect(s().addAuto('lenovo-m720q').ok).toBe(true)
    const again = s().addAuto('lenovo-m720q')
    expect(again.ok).toBe(false)
    expect(again.errors[0]!.message).toMatch(/shelf/)
  })

  it('"add a shelf" puts a new shelf where the device was dropped, with the device on it', () => {
    const r = s().addOnNewShelf('lenovo-m720q', 'front', 3)
    expect(r.ok).toBe(true)
    const shelf = s().placements[0]!
    expect(shelf).toMatchObject({ u: 3, side: 'front' })
    expect(shelf.children!.map((c) => c.itemId)).toEqual(['lenovo-m720q'])
    // an M720q is 183 mm deep: the 200 mm shelf is chosen over the 150 mm one
    expect(shelf.itemId).toBe('shelf-1u-10-deep')
    expect(s().selectedId).toBe(shelf.id)
  })

  it('"add a shelf" moves to free units when the drop spot is taken or too low for a tall device', () => {
    s().add('patch-panel-12-10', 3, 'front')
    expect(s().addOnNewShelf('raspberry-pi-5', 'front', 3).ok).toBe(true)
    expect(s().placements.find((p) => p.children)!.u).not.toBe(3)
    // a Mac mini is 50 mm tall, so its shelf takes 2U and cannot sit in the top unit
    expect(s().addOnNewShelf('apple-mac-mini-m4', 'front', 8).ok).toBe(true)
    const tall = s().placements.find((p) => p.children?.[0]?.itemId === 'apple-mac-mini-m4')!
    expect(tall.u).toBeLessThanOrEqual(7)
  })

  it('"add a shelf" is refused in a full rack and changes nothing', () => {
    for (let u = 1; u <= 8; u++) s().add('patch-panel-12-10', u, 'front')
    const r = s().addOnNewShelf('raspberry-pi-5', 'front', 3)
    expect(r.ok).toBe(false)
    expect(s().placements).toHaveLength(8)
  })

  it('"add a shelf" uses a 19 inch shelf in a 19 inch rack', () => {
    s().setRack({ standard: '19', heightU: 12, depthMm: 600 })
    s().addOnNewShelf('lenovo-m720q', 'front')
    expect(s().placements[0]!.itemId).toMatch(/^shelf-1u-19/)
  })

  it('quick-add of a mini PC without a shelf says a shelf is needed, so the app can offer one', () => {
    expect(s().addAuto('lenovo-m720q').errors[0]!.code).toBe('needs-shelf')
  })

  it('the sidebar width stays between readable and half the screen', () => {
    s().setSideWidth(10)
    expect(s().sideWidth).toBe(260)
    s().setSideWidth(5000)
    expect(s().sideWidth).toBe(720)
    s().setSideWidth(412.6)
    expect(s().sideWidth).toBe(413)
  })

  it('quick-add of 19 inch gear into a 10 inch rack gives the real reason, not "no space"', () => {
    const r = s().addAuto('ubiquiti-udm-pro')
    expect(r.ok).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('wrong-standard')
  })

  it('a duplicate lands in free units and gets its own ids', () => {
    const a = s().add('shelf-1u-10', 8, 'front')
    s().addChild(a.id!, 'raspberry-pi-5')
    expect(s().duplicate(a.id!).ok).toBe(true)
    const [x, y] = s().placements
    expect(x!.id).not.toBe(y!.id)
    expect(x!.children![0]!.id).not.toBe(y!.children![0]!.id)
    expect(y!.u).not.toBe(x!.u)
  })

  it('making a fan panel taller is refused when it would hit the device above', () => {
    const fan = s().add('fan-panel', 1, 'front', {
      kind: 'fanPanel',
      fanSizeMm: 40,
      count: 2,
      direction: 'out',
    })
    s().add('patch-panel-12-10', 2, 'front')
    const r = s().setConfig(fan.id!, { kind: 'fanPanel', fanSizeMm: 120, count: 1, direction: 'out' })
    expect(r.ok).toBe(false)
    expect(s().placements.find((p) => p.id === fan.id)!.config).toMatchObject({ fanSizeMm: 40 })
  })

  it('the rack survives a reload', () => {
    s().add('patch-panel-12-10', 8, 'front')
    const saved = JSON.parse(localStorage.getItem('rack-builder')!)
    expect(saved.state.placements).toHaveLength(1)
    expect(saved.state.selectedId).toBeUndefined()
  })
})
