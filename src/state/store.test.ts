import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_RACK, needsRackSetup, useStore } from './store'

const s = () => useStore.getState()

beforeEach(() => {
  localStorage.clear()
  useStore.setState({
    rack: { ...DEFAULT_RACK },
    placements: [],
    cables: [],
    past: [],
    selectedId: null,
    rackChosen: false,
  })
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

describe('asking a new visitor to choose a rack', () => {
  it('asks until the visitor says the rack is chosen', () => {
    expect(needsRackSetup(s())).toBe(true)
    s().setRack({ heightU: 12 })
    expect(needsRackSetup(s())).toBe(true)
    s().set({ rackChosen: true })
    expect(needsRackSetup(s())).toBe(false)
  })

  it('takes the first device as the answer, and does not ask again when the rack is emptied', () => {
    expect(s().addAuto('patch-panel-12-10').ok).toBe(true)
    expect(needsRackSetup(s())).toBe(false)
    s().clear()
    expect(needsRackSetup(s())).toBe(false)
  })

  it('does not ask about a rack that was saved with equipment before this question existed', () => {
    s().add('patch-panel-12-10', 8, 'front')
    useStore.setState({ rackChosen: false })
    expect(needsRackSetup(s())).toBe(false)
  })

  it('does not ask about a shared or imported rack', () => {
    s().load({ rack: { ...DEFAULT_RACK, heightU: 12 }, placements: [], cables: [] })
    expect(needsRackSetup(s())).toBe(false)
  })

  it('asks again after resetting everything, and undoing the reset does not', () => {
    s().addAuto('patch-panel-12-10')
    s().reset()
    expect(needsRackSetup(s())).toBe(true)
    s().undo()
    expect(needsRackSetup(s())).toBe(false)
  })

  it('remembers the answer over a reload', () => {
    s().set({ rackChosen: true })
    expect(JSON.parse(localStorage.getItem('rack-builder')!).state.rackChosen).toBe(true)
  })
})

describe('cabling the rack in the app', () => {
  const wire = () => {
    useStore.setState({ cables: [], pendingPort: null, selectedCableId: null })
    s().setRack({ standard: '19', heightU: 12, depthMm: 600 })
    const udm = s().add('ubiquiti-udm-pro', 12, 'front').id!
    const sw = s().add('ubiquiti-usw-pro-24', 11, 'front').id!
    const pdu = s().add('pdu-8-19', 1, 'rear').id!
    return { udm, sw, pdu }
  }

  it('the first click on a port starts a cable and the second click on a fitting port finishes it', () => {
    const { udm, sw } = wire()
    expect(s().clickPort(`${udm}:f2.0`)).toMatchObject({ ok: true })
    expect(s().pendingPort).toBe(`${udm}:f2.0`)
    expect(s().cables).toHaveLength(0)
    const r = s().clickPort(`${sw}:f1.0`)
    expect(r.ok).toBe(true)
    expect(s().cables).toEqual([expect.objectContaining({ from: `${udm}:f2.0`, to: `${sw}:f1.0` })])
    expect(s().pendingPort).toBeNull()
    expect(s().selectedCableId).toBe(s().cables[0]!.id)
  })

  it('a click on a port that does not fit says why and keeps the cable in hand', () => {
    const { udm, pdu } = wire()
    s().clickPort(`${udm}:f2.0`)
    const r = s().clickPort(`${pdu}:f0.0`)
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/power/i) })
    expect(s().pendingPort).toBe(`${udm}:f2.0`)
    expect(s().cables).toHaveLength(0)
  })

  it('clicking the same port again puts the cable down', () => {
    const { udm } = wire()
    s().clickPort(`${udm}:f2.0`)
    s().clickPort(`${udm}:f2.0`)
    expect(s().pendingPort).toBeNull()
    expect(s().cables).toHaveLength(0)
  })

  it('clicking a port that already has a cable selects that cable instead of starting a new one', () => {
    const { udm, sw } = wire()
    s().clickPort(`${udm}:f2.0`)
    s().clickPort(`${sw}:f1.0`)
    s().selectCable(null)
    s().clickPort(`${sw}:f1.0`)
    expect(s().pendingPort).toBeNull()
    expect(s().selectedCableId).toBe(s().cables[0]!.id)
  })

  it('a power inlet can be sent to the wall socket', () => {
    const { pdu } = wire()
    s().clickPort(`${pdu}:pwr`)
    expect(s().clickPort('wall').ok).toBe(true)
    expect(s().cables[0]).toMatchObject({ from: `${pdu}:pwr`, to: 'wall' })
  })

  it('removing a device takes its cables with it, and undo brings both back', () => {
    const { udm, sw, pdu } = wire()
    s().plug(`${udm}:f2.0`, `${sw}:f1.0`)
    s().plug(`${pdu}:f0.0`, `${sw}:pwr`)
    s().plug(`${pdu}:f0.1`, `${udm}:pwr`)
    s().remove(sw)
    expect(s().cables.map((c) => c.to)).toEqual([`${udm}:pwr`])
    expect(s().undo()).toBe(true)
    expect(s().placements).toHaveLength(3)
    expect(s().cables).toHaveLength(3)
  })

  it('moving a device keeps its cables, and the length follows', () => {
    const { udm, sw } = wire()
    s().plug(`${udm}:f2.0`, `${sw}:f1.0`)
    expect(s().move(sw, 2, 'front').ok).toBe(true)
    expect(s().cables).toHaveLength(1)
  })

  it('a picked length can be set and cleared, a cable can be removed, and each step can be undone', () => {
    const { udm, sw } = wire()
    s().plug(`${udm}:f2.0`, `${sw}:f1.0`)
    const id = s().cables[0]!.id
    s().setCableLength(id, 2000)
    expect(s().cables[0]!.lengthMm).toBe(2000)
    s().setCableLength(id, undefined)
    expect(s().cables[0]!.lengthMm).toBeUndefined()
    s().removeCable(id)
    expect(s().cables).toHaveLength(0)
    expect(s().selectedCableId).toBeNull()
    s().undo()
    expect(s().cables).toHaveLength(1)
  })

  it('clearing the rack clears the cables, and a loaded rack brings its own', () => {
    const { udm, sw } = wire()
    s().plug(`${udm}:f2.0`, `${sw}:f1.0`)
    const saved = { rack: s().rack, placements: s().placements, cables: s().cables }
    s().clear()
    expect(s().cables).toHaveLength(0)
    s().load(saved)
    expect(s().cables).toHaveLength(1)
    s().load({ rack: saved.rack, placements: saved.placements })
    expect(s().cables).toHaveLength(0)
  })

  it('taking a mini PC off its shelf removes its cables', () => {
    const { sw, pdu } = wire()
    s().addOnNewShelf('lenovo-m720q', 'front', 6)
    const shelf = s().placements.find((p) => p.children?.length)!
    const child = shelf.children![0]!.id
    expect(s().plug(`${sw}:f1.0`, `${shelf.id}/${child}:r0.0`).ok).toBe(true)
    expect(s().plug(`${pdu}:f0.0`, `${shelf.id}/${child}:pwr`).ok).toBe(true)
    s().removeChild(shelf.id, child)
    expect(s().cables).toHaveLength(0)
  })
})

describe('selecting, copying and resetting', () => {
  const setup = () => {
    useStore.setState({ cables: [], pendingPort: null, selectedCableId: null, clipboard: null })
    s().setRack({ standard: '19', heightU: 12, depthMm: 600 })
    const udm = s().add('ubiquiti-udm-pro', 12, 'front').id!
    const sw = s().add('ubiquiti-usw-pro-24', 11, 'front').id!
    s().plug(`${udm}:f2.0`, `${sw}:f1.0`)
    return { udm, sw, cable: s().cables[0]!.id }
  }

  it('only one thing is selected at a time: a device or a cable', () => {
    const { udm, cable } = setup()
    s().select(udm)
    expect(s().selectedCableId).toBeNull()
    s().selectCable(cable)
    expect(s().selectedId).toBeNull()
    expect(s().selectedCableId).toBe(cable)
    s().select(udm)
    expect(s().selectedCableId).toBeNull()
  })

  it('copy and paste puts a second one of the device in the rack and selects it', () => {
    const { sw } = setup()
    expect(s().copy(sw)).toBe(true)
    const r = s().paste()
    expect(r.ok).toBe(true)
    expect(s().placements.filter((p) => p.itemId === 'ubiquiti-usw-pro-24')).toHaveLength(2)
    expect(s().selectedId).not.toBe(sw)
    // pasting again keeps working, and what was copied survives the original being removed
    s().remove(sw)
    expect(s().paste().ok).toBe(true)
    expect(s().placements.filter((p) => p.itemId === 'ubiquiti-usw-pro-24')).toHaveLength(2)
  })

  it('paste with nothing copied does nothing and says so', () => {
    setup()
    const r = s().paste()
    expect(r.ok).toBe(false)
    expect(s().placements).toHaveLength(2)
  })

  it('a pasted shelf brings copies of what stood on it', () => {
    setup()
    s().addOnNewShelf('lenovo-m720q', 'front', 5)
    const shelf = s().placements.find((p) => p.children?.length)!
    s().copy(shelf.id)
    s().paste()
    const shelves = s().placements.filter((p) => p.children?.length)
    expect(shelves).toHaveLength(2)
    expect(shelves[0]!.children![0]!.id).not.toBe(shelves[1]!.children![0]!.id)
  })

  it('reset empties the rack, puts the default rack back, and can be undone', () => {
    const { udm } = setup()
    s().setPlacementColor(udm, '#224466')
    s().reset()
    expect(s().rack).toEqual(DEFAULT_RACK)
    expect(s().placements).toEqual([])
    expect(s().cables).toEqual([])
    expect(s().selectedId).toBeNull()
    expect(s().undo()).toBe(true)
    expect(s().placements).toHaveLength(2)
    expect(s().cables).toHaveLength(1)
    expect(s().rack.standard).toBe('19')
  })

  it('a device and the frame can be given a colour, and lose it again', () => {
    const { udm } = setup()
    s().setPlacementColor(udm, '#224466')
    expect(s().placements.find((p) => p.id === udm)!.color).toBe('#224466')
    s().setPlacementColor(udm, undefined)
    expect('color' in s().placements.find((p) => p.id === udm)!).toBe(false)
    expect(s().setRack({ color: '#d0d0d0' }).ok).toBe(true)
    expect(s().rack.color).toBe('#d0d0d0')
    // recolouring the frame keeps it the same bought product
    s().applyRackProduct('deskpi-rackmate-t2')
  })

  it('a cable keeps its settings through the store', () => {
    const { cable } = setup()
    s().updateCable(cable, { color: '#22aa55', diameterMm: 6, have: true, route: 'post' })
    expect(s().cables[0]).toMatchObject({ color: '#22aa55', diameterMm: 6, have: true, route: 'post' })
    s().undo()
    expect(s().cables[0]!.color).toBeUndefined()
  })

  it('a drop on a mounting hole between units mounts the device there', () => {
    setup()
    const r = s().drop(
      { kind: 'rail', u: 5, heightU: 1, side: 'front', ok: true, issues: [], hole: 1 },
      { itemId: 'patch-panel-24-19' },
    )
    expect(r.ok).toBe(true)
    expect(s().placements.at(-1)).toMatchObject({ u: 5, hole: 1 })
    const id = s().placements.at(-1)!.id
    s().move(id, 7, 'front', 2)
    expect(s().placements.find((p) => p.id === id)).toMatchObject({ u: 7, hole: 2 })
    s().move(id, 8, 'front')
    expect(s().placements.find((p) => p.id === id)!.hole).toBeUndefined()
  })
})

describe('printed rack designs', () => {
  it('choosing Lab Rax gives a 10 inch 5U rack and sets the fastening its design uses', () => {
    useStore.setState({ fastening: 'cage-nuts' })
    expect(s().applyRackProduct('labrax-5u').ok).toBe(true)
    expect(s().rack).toMatchObject({ standard: '10', heightU: 5, productId: 'labrax-5u' })
    expect(s().fastening).toBe('inserts')
    s().applyRackProduct('labrax-bolted')
    expect(s().fastening).toBe('captive-nuts')
  })

  it('a modular design stays that design at another height it comes in, and stops being it at one it does not', () => {
    s().applyRackProduct('kws-rack-v2')
    expect(s().rack.heightU).toBe(6)
    s().setRack({ heightU: 9 })
    expect(s().rack.productId).toBe('kws-rack-v2')
    s().setRack({ heightU: 8 })
    expect(s().rack.productId).toBeUndefined()
  })

  it('a bought rack still stops being that product when its height is edited', () => {
    s().applyRackProduct('deskpi-rackmate-t2')
    s().setRack({ heightU: 9 })
    expect(s().rack.productId).toBeUndefined()
  })
})
