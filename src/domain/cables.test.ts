import { describe, expect, it } from 'vitest'
import type { Cable, Placement, Rack } from './types'
import {
  WALL,
  cableLengthText,
  cableReport,
  connectCable,
  portsOf,
  pruneCables,
  setCableLength,
  suggestLength,
  updateCable,
  type Port,
} from './cables'
import { U_MM } from './units'

const rack: Rack = { standard: '19', heightU: 42, depthMm: 800, style: 'open', casters: false }

const udm = (u: number, id = 'udm'): Placement => ({ id, itemId: 'ubiquiti-udm-pro', u, side: 'front' })
const pdu = (u: number, side: Placement['side'] = 'rear'): Placement => ({
  id: 'pdu',
  itemId: 'pdu-8-19',
  u,
  side,
})
const r740 = (u: number): Placement => ({ id: 'r740', itemId: 'dell-r740', u, side: 'front' })
const shelf = (u: number): Placement => ({
  id: 'shelf',
  itemId: 'shelf-1u-19',
  u,
  side: 'front',
  children: [
    { id: 'm1', itemId: 'lenovo-m720q', orientation: 'flat' },
    { id: 'm2', itemId: 'lenovo-m720q', orientation: 'flat' },
  ],
})

const port = (ports: Port[], id: string) => {
  const p = ports.find((x) => x.id === id)
  if (!p) throw new Error(`no port ${id} in ${ports.map((x) => x.id).join(' ')}`)
  return p
}
const plug = (placements: Placement[], pairs: [string, string][]) => {
  let cables: Cable[] = []
  for (const [a, b] of pairs) {
    const r = connectCable(rack, placements, cables, a, b)
    if (!r.ok) throw new Error(r.error)
    cables = r.cables
  }
  return cables
}

describe('ports of the equipment', () => {
  it('gives a UDM Pro its 9 copper ports and 2 SFP+ cages on the front and a power inlet on the back', () => {
    const ports = portsOf(rack, [udm(10)])
    expect(ports.filter((p) => p.kind === 'rj45')).toHaveLength(9)
    expect(ports.filter((p) => p.kind === 'sfp')).toHaveLength(2)
    expect(ports.filter((p) => p.kind === 'inlet')).toHaveLength(1)
    expect(ports).toHaveLength(12)
    for (const p of ports.filter((x) => x.kind !== 'inlet')) {
      expect(p.facing).toBe('front')
      expect(p.pos.z).toBeCloseTo(400 + 2.5)
      // inside the unit it is mounted in: U10 starts 9 units above the bottom of U1
      expect(p.pos.y).toBeGreaterThan(20 + 9 * U_MM)
      expect(p.pos.y).toBeLessThan(20 + 10 * U_MM)
    }
    const inlet = port(ports, 'udm:pwr')
    expect(inlet.facing).toBe('rear')
    expect(inlet.pos.z).toBeCloseTo(400 - 285.6)
  })

  it('names ports the way they are counted on the device', () => {
    const ports = portsOf(rack, [udm(10)])
    expect(port(ports, 'udm:f2.0').label).toBe('Port 1')
    expect(port(ports, 'udm:f2.7').label).toBe('Port 8')
    expect(port(ports, 'udm:f3.0').label).toBe('Port 9')
    expect(port(ports, 'udm:f4.1').label).toBe('SFP 2')
    expect(port(ports, 'udm:pwr').label).toBe('Power in')
    expect(port(ports, 'udm:f2.0').device).toBe('UniFi Dream Machine Pro')
  })

  it('puts the ports of a rear-mounted PDU on the rear face, mirrored left to right', () => {
    const front = portsOf(rack, [pdu(1, 'front')])
    const rear = portsOf(rack, [pdu(1, 'rear')])
    expect(rear.filter((p) => p.kind === 'outlet')).toHaveLength(8)
    const a = port(front, 'pdu:f0.0')
    const b = port(rear, 'pdu:f0.0')
    expect(a.facing).toBe('front')
    expect(b.facing).toBe('rear')
    expect(b.pos.z).toBeCloseTo(-402.5)
    expect(b.pos.x).toBeCloseTo(-a.pos.x)
    expect(b.pos.y).toBeCloseTo(a.pos.y)
  })

  it('gives servers and mini PCs their network ports on the back', () => {
    const ports = portsOf(rack, [r740(1), shelf(5)])
    const lan = ports.filter((p) => p.ownerId === 'r740' && p.kind === 'rj45')
    expect(lan).toHaveLength(4)
    expect(lan.every((p) => p.facing === 'rear')).toBe(true)
    expect(port(ports, 'r740:r0.0').label).toBe('LAN 1')

    const m1 = port(ports, 'shelf/m1:r0.0')
    const m2 = port(ports, 'shelf/m2:r0.0')
    expect(m1.device).toBe('Lenovo ThinkCentre M720q Tiny')
    expect(m1.facing).toBe('rear')
    // two mini PCs side by side on one shelf: same height, different columns
    expect(m1.pos.y).toBeCloseTo(m2.pos.y)
    expect(Math.abs(m1.pos.x - m2.pos.x)).toBeGreaterThan(179)
    // the back of a 183 mm deep PC that stands 6 mm behind the shelf lip
    expect(m1.pos.z).toBeCloseTo(400 - 6 - 183)
    expect(port(ports, 'shelf/m1:pwr').kind).toBe('inlet')
  })

  it('gives a shelf, a blank panel or a patch panel no power inlet', () => {
    const ports = portsOf(rack, [
      { id: 's', itemId: 'shelf-1u-19', u: 1, side: 'front' },
      { id: 'k', itemId: 'patch-panel-24-19', u: 2, side: 'front' },
    ])
    expect(ports.filter((p) => p.kind === 'inlet')).toHaveLength(0)
    expect(ports.filter((p) => p.kind === 'rj45')).toHaveLength(24)
  })
})

describe('plugging a cable in', () => {
  const placements = [udm(10), udm(9, 'udm2'), pdu(1), r740(3)]

  it('connects two network ports and calls it an ethernet cable', () => {
    const r = connectCable(rack, placements, [], 'udm:f2.0', 'udm2:f2.0')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cables).toHaveLength(1)
    expect(cableReport(rack, placements, r.cables).rows[0]!.kind).toBe('ethernet')
  })

  it('connects a PDU outlet to a power inlet whichever end is clicked first', () => {
    for (const [a, b] of [
      ['pdu:f0.0', 'udm:pwr'],
      ['udm:pwr', 'pdu:f0.0'],
    ] as const) {
      const r = connectCable(rack, placements, [], a, b)
      expect(r.ok).toBe(true)
      if (r.ok) expect(cableReport(rack, placements, r.cables).rows[0]!.kind).toBe('power')
    }
  })

  it('lets a PDU be plugged into the wall socket, and any number of things with it', () => {
    const cables = plug(placements, [
      ['pdu:pwr', WALL],
      [WALL, 'r740:pwr'],
    ])
    expect(cables).toHaveLength(2)
  })

  it('refuses a second cable in a port that is taken', () => {
    const cables = plug(placements, [['udm:f2.0', 'udm2:f2.0']])
    const r = connectCable(rack, placements, cables, 'udm2:f2.0', 'udm:f2.1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Port 1 on UniFi Dream Machine Pro already has a cable/)
  })

  it.each([
    ['udm:f2.0', 'udm:f2.0', /same port/],
    ['udm:f2.0', 'udm2:f4.0', /SFP/],
    ['udm:f2.0', 'pdu:f0.0', /power/i],
    ['udm:f2.0', 'udm2:pwr', /power/i],
    ['pdu:f0.0', 'pdu:f0.1', /outlet/i],
    ['udm:pwr', 'udm2:pwr', /outlet/i],
    ['pdu:f0.0', 'pdu:pwr', /itself/],
    ['udm:f2.0', WALL, /wall/i],
    ['pdu:f0.0', WALL, /wall/i],
    ['udm:f2.0', 'gone:f2.0', /no longer/],
  ])('refuses %s → %s', (a, b, why) => {
    const r = connectCable(rack, placements, [], a, b)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(why)
  })

  it('connects two SFP+ cages with a DAC', () => {
    const r = connectCable(rack, placements, [], 'udm:f4.0', 'udm2:f4.0')
    expect(r.ok).toBe(true)
    if (r.ok) expect(cableReport(rack, placements, r.cables).rows[0]!.kind).toBe('sfp')
  })
})

describe('how long the cable has to be', () => {
  it('needs 0.25 m between the same port of two switches right above each other', () => {
    const placements = [udm(10), udm(9, 'udm2')]
    const row = cableReport(rack, placements, plug(placements, [['udm:f2.0', 'udm2:f2.0']])).rows[0]!
    // 25 mm out of each port plus one rack unit down
    expect(row.pathMm).toBeCloseTo(50 + U_MM)
    // 10 % slack and 40 mm for each plug
    expect(row.requiredMm).toBeCloseTo((50 + U_MM) * 1.1 + 80)
    expect(row.suggestedMm).toBe(250)
    expect(row.lengthMm).toBe(250)
    expect(row.status).toBe('ok')
  })

  it('needs 3 m from the top of a 42U rack to the bottom', () => {
    const placements = [udm(42), udm(1, 'udm2')]
    const row = cableReport(rack, placements, plug(placements, [['udm:f2.0', 'udm2:f2.0']])).rows[0]!
    expect(row.pathMm).toBeCloseTo(50 + 41 * U_MM)
    expect(row.suggestedMm).toBe(3000)
  })

  it('gets longer when the device is moved further away', () => {
    const cables = plug([udm(10), udm(9, 'udm2')], [['udm:f2.0', 'udm2:f2.0']])
    const near = cableReport(rack, [udm(10), udm(9, 'udm2')], cables).rows[0]!
    const far = cableReport(rack, [udm(30), udm(9, 'udm2')], cables).rows[0]!
    expect(far.requiredMm).toBeGreaterThan(near.requiredMm + 20 * U_MM)
    expect(far.suggestedMm).toBe(1500)
  })

  it('runs along the width as well as the height', () => {
    const placements = [udm(10)]
    // ports 1 and 4 are the two ends of the top row of the UDM Pro's switch block
    const row = cableReport(rack, placements, plug(placements, [['udm:f2.0', 'udm:f2.3']])).rows[0]!
    const ports = portsOf(rack, placements)
    const dx = Math.abs(port(ports, 'udm:f2.0').pos.x - port(ports, 'udm:f2.3').pos.x)
    expect(dx).toBeGreaterThan(50)
    expect(row.pathMm).toBeCloseTo(50 + dx)
  })

  it('goes around the side of the rack from a front port to a port at the back', () => {
    const placements = [udm(10), r740(3)]
    const row = cableReport(rack, placements, plug(placements, [['udm:f2.0', 'r740:r0.0']])).rows[0]!
    const ports = portsOf(rack, placements)
    const a = port(ports, 'udm:f2.0')
    const b = port(ports, 'r740:r0.0')
    // never shorter than the depth between the two faces plus the height difference
    expect(row.pathMm).toBeGreaterThan(Math.abs(a.pos.z - b.pos.z) + Math.abs(a.pos.y - b.pos.y))
    // and it has to reach a side of the rack first: at least the distance from the nearer port to a rail
    expect(row.pathMm).toBeGreaterThan(
      Math.abs(a.pos.z - b.pos.z) + Math.abs(a.pos.y - b.pos.y) + (241.3 - Math.abs(a.pos.x)),
    )
    expect(row.points.length).toBeGreaterThanOrEqual(4)
    expect(row.points[0]).toEqual(a.pos)
    expect(row.points.at(-1)).toEqual(b.pos)
  })

  it('adds a metre from the rack to the wall socket', () => {
    const placements = [pdu(1)]
    const row = cableReport(rack, placements, plug(placements, [['pdu:pwr', WALL]])).rows[0]!
    expect(row.to).toBe(WALL)
    expect(row.pathMm).toBeGreaterThan(1000)
    expect(row.pathMm).toBeLessThan(1000 + 800 + 500)
  })

  it('suggests the next length sold, per kind of cable', () => {
    expect(suggestLength('ethernet', 184)).toBe(250)
    expect(suggestLength('ethernet', 500)).toBe(500)
    expect(suggestLength('ethernet', 501)).toBe(1000)
    expect(suggestLength('power', 300)).toBe(500)
    expect(suggestLength('sfp', 300)).toBe(500)
    expect(suggestLength('ethernet', 40_000)).toBeUndefined()
  })
})

describe('a cable of a chosen length', () => {
  const placements = [udm(30), udm(9, 'udm2')]
  const cables = plug(placements, [['udm:f2.0', 'udm2:f2.0']])
  const id = cables[0]!.id

  it('is fine when it is long enough', () => {
    const row = cableReport(rack, placements, setCableLength(cables, id, 2000)).rows[0]!
    expect(row.lengthMm).toBe(2000)
    expect(row.suggestedMm).toBe(1500)
    expect(row.status).toBe('ok')
  })

  it('is flagged when it cannot reach', () => {
    const row = cableReport(rack, placements, setCableLength(cables, id, 500)).rows[0]!
    expect(row.status).toBe('too-short')
  })

  it('becomes too short when the device is moved away afterwards', () => {
    const plugged = plug([udm(10), udm(9, 'udm2')], [['udm:f2.0', 'udm2:f2.0']])
    const fixed = setCableLength(plugged, plugged[0]!.id, 250)
    const before = cableReport(rack, [udm(10), udm(9, 'udm2')], fixed).rows[0]!
    const after = cableReport(rack, [udm(30), udm(9, 'udm2')], fixed).rows[0]!
    expect(before.status).toBe('ok')
    expect(after.status).toBe('too-short')
  })

  it('goes back to the suggested length when the choice is cleared', () => {
    const row = cableReport(rack, placements, setCableLength(setCableLength(cables, id, 500), id, undefined))
      .rows[0]!
    expect(row.lengthMm).toBe(1500)
    expect(row.status).toBe('ok')
  })
})

describe('the shopping list', () => {
  it('counts the cables to buy by kind and length', () => {
    const placements = [udm(10), udm(9, 'udm2'), pdu(1), r740(3)]
    const cables = plug(placements, [
      ['udm:f2.0', 'udm2:f2.0'],
      ['udm:f2.1', 'udm2:f2.1'],
      ['udm:f4.0', 'udm2:f4.0'],
      ['pdu:f0.0', 'udm:pwr'],
    ])
    const { shopping } = cableReport(rack, placements, cables)
    expect(shopping).toContainEqual({ kind: 'ethernet', lengthMm: 250, count: 2 })
    expect(shopping).toContainEqual({ kind: 'sfp', lengthMm: 500, count: 1 })
    // the power cable came with the device, so it is not bought
    expect(shopping.filter((s) => s.kind === 'power')).toHaveLength(0)
    expect(shopping.reduce((n, s) => n + s.count, 0)).toBe(3)
  })

  it('lists what still has no power cable, and nothing that needs none', () => {
    const placements = [
      udm(10),
      pdu(1),
      shelf(5),
      { id: 'k', itemId: 'patch-panel-24-19', u: 2, side: 'front' as const },
    ]
    const cables = plug(placements, [['pdu:f0.0', 'udm:pwr']])
    const names = cableReport(rack, placements, cables).unpowered.map((u) => u.portId)
    expect(names.sort()).toEqual(['pdu:pwr', 'shelf/m1:pwr', 'shelf/m2:pwr'])
  })

  it('is empty for an empty rack', () => {
    expect(cableReport(rack, [], [])).toEqual({ rows: [], shopping: [], unpowered: [] })
  })
})

describe('cables after the rack changes', () => {
  const placements = [udm(10), udm(9, 'udm2'), shelf(5)]
  const cables = plug(placements, [
    ['udm:f2.0', 'udm2:f2.0'],
    ['udm:f2.1', 'shelf/m1:r0.0'],
    ['udm:f2.2', 'shelf/m2:r0.0'],
  ])

  it('drops the cables of a device that was removed and keeps the rest', () => {
    const left = pruneCables(rack, [udm(10), shelf(5)], cables)
    expect(left.map((c) => c.to)).toEqual(['shelf/m1:r0.0', 'shelf/m2:r0.0'])
  })

  it('drops the cable of a mini PC taken off its shelf', () => {
    const s = shelf(5)
    const left = pruneCables(rack, [udm(10), udm(9, 'udm2'), { ...s, children: [s.children![1]!] }], cables)
    expect(left.map((c) => c.to)).toEqual(['udm2:f2.0', 'shelf/m2:r0.0'])
  })

  it('keeps every cable when a device only moves', () => {
    expect(pruneCables(rack, [udm(20), udm(9, 'udm2'), shelf(30)], cables)).toEqual(cables)
  })
})

describe('random plugging', () => {
  // small seeded generator so a failure can be replayed
  const rng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32
  }

  it.each([1, 7, 42, 2026])('never double-books a port or joins plugs that do not fit (seed %i)', (seed) => {
    const rand = rng(seed)
    const placements = [udm(40), udm(39, 'udm2'), pdu(1), pdu(2, 'front'), r740(10), shelf(20)].map((p, i) =>
      i === 3 ? { ...p, id: 'pdu2' } : p,
    )
    const ports = portsOf(rack, placements)
    const ends = [...ports.map((p) => p.id), WALL]
    let cables: Cable[] = []
    for (let i = 0; i < 300; i++) {
      const a = ends[Math.floor(rand() * ends.length)]!
      const b = ends[Math.floor(rand() * ends.length)]!
      const r = connectCable(rack, placements, cables, a, b)
      if (r.ok) cables = r.cables
      if (rand() < 0.1 && cables.length) cables = cables.filter((_, k) => k !== 0)
    }
    expect(cables.length).toBeGreaterThan(3)
    const used = cables.flatMap((c) => [c.from, c.to]).filter((e) => e !== WALL)
    expect(new Set(used).size).toBe(used.length)
    const report = cableReport(rack, placements, cables)
    expect(report.rows).toHaveLength(cables.length)
    for (const row of report.rows) {
      const kinds = [row.from.kind, row.to === WALL ? 'wall' : row.to.kind].sort().join('+')
      expect(['inlet+outlet', 'inlet+wall', 'rj45+rj45', 'sfp+sfp']).toContain(kinds)
      if (row.to !== WALL) {
        const d = Math.hypot(
          row.from.pos.x - row.to.pos.x,
          row.from.pos.y - row.to.pos.y,
          row.from.pos.z - row.to.pos.z,
        )
        expect(row.pathMm).toBeGreaterThanOrEqual(d - 1e-6)
      }
      expect(row.requiredMm).toBeGreaterThan(row.pathMm)
      if (row.suggestedMm !== undefined) expect(row.suggestedMm).toBeGreaterThanOrEqual(row.requiredMm)
    }
  })
})

describe('how a cable length is written', () => {
  it('uses metres, or feet when the app is set to inches', () => {
    expect(cableLengthText(250, 'mm')).toBe('0.25 m')
    expect(cableLengthText(1500, 'mm')).toBe('1.5 m')
    expect(cableLengthText(3000, 'mm')).toBe('3 m')
    expect(cableLengthText(3048, 'in')).toBe('10 ft')
    expect(cableLengthText(500, 'in')).toBe('1.6 ft')
  })
})

describe('routing along the posts', () => {
  const POST_X = 482.6 / 2 - (482.6 - 450.85) / 4

  it('a cable over several units runs to the nearer post, along it, and back in', () => {
    const placements = [udm(10), udm(3, 'udm2')]
    const cables = plug(placements, [['udm:f2.0', 'udm2:f2.0']])
    const direct = cableReport(rack, placements, cables).rows[0]!
    const viaPost = cableReport(rack, placements, cables, { routing: 'post' }).rows[0]!
    const x = port(portsOf(rack, placements), 'udm:f2.0').pos.x
    expect(direct.pathMm).toBeCloseTo(50 + 7 * U_MM)
    expect(viaPost.pathMm).toBeCloseTo(50 + 7 * U_MM + 2 * (POST_X - Math.abs(x)))
    // the vertical part is on the post on the port's own side of the rack
    const onPost = viaPost.points.filter((p) => Math.abs(Math.abs(p.x) - POST_X) < 1e-6)
    expect(onPost.length).toBeGreaterThanOrEqual(2)
    expect(onPost.every((p) => Math.sign(p.x) === Math.sign(x))).toBe(true)
    expect(viaPost.suggestedMm).toBeGreaterThanOrEqual(direct.suggestedMm!)
  })

  it('a patch between neighbouring units stays a short straight cable', () => {
    const placements = [udm(10), udm(9, 'udm2')]
    const cables = plug(placements, [['udm:f2.0', 'udm2:f2.0']])
    expect(cableReport(rack, placements, cables, { routing: 'post' }).rows[0]!.pathMm).toBeCloseTo(50 + U_MM)
  })

  it('one cable can be set apart from the rest', () => {
    const placements = [udm(10), udm(3, 'udm2')]
    const cables = plug(placements, [
      ['udm:f2.0', 'udm2:f2.0'],
      ['udm:f2.1', 'udm2:f2.1'],
    ])
    const mixed = updateCable(cables, cables[0]!.id, { route: 'post' })
    const rows = cableReport(rack, placements, mixed).rows
    expect(rows[0]!.pathMm).toBeGreaterThan(rows[1]!.pathMm + 100)
    const back = updateCable(mixed, cables[0]!.id, { route: 'direct' })
    expect(cableReport(rack, placements, back, { routing: 'post' }).rows[0]!.pathMm).toBeCloseTo(
      50 + 7 * U_MM,
    )
  })

  it('cables plugged in later run in the same plane as the first: no creeping outwards', () => {
    const placements = [udm(10), udm(9, 'udm2')]
    const pairs = [0, 1, 2, 3, 4, 5, 6, 7].map((i): [string, string] => [`udm:f2.${i}`, `udm2:f2.${i}`])
    const rows = cableReport(rack, placements, plug(placements, pairs)).rows
    for (const r of rows) {
      expect(r.pathMm).toBeCloseTo(rows[0]!.pathMm)
      expect(Math.max(...r.points.map((p) => p.z))).toBeCloseTo(Math.max(...rows[0]!.points.map((p) => p.z)))
    }
  })
})

describe('cables you already have', () => {
  const placements = [udm(10), udm(9, 'udm2'), pdu(1)]
  const cables = plug(placements, [
    ['udm:f2.0', 'udm2:f2.0'],
    ['pdu:f0.0', 'udm:pwr'],
    ['pdu:pwr', WALL],
  ])

  it('assumes every device came with its power cable and that patch cables have to be bought', () => {
    const { rows, shopping } = cableReport(rack, placements, cables)
    expect(rows.map((r) => r.have)).toEqual([false, true, true])
    expect(shopping).toEqual([{ kind: 'ethernet', lengthMm: 250, count: 1 }])
  })

  it('lets the user say which ones they have and which they need', () => {
    let mine = updateCable(cables, cables[0]!.id, { have: true })
    mine = updateCable(mine, cables[1]!.id, { have: false })
    const { rows, shopping } = cableReport(rack, placements, mine)
    expect(rows.map((r) => r.have)).toEqual([true, false, true])
    expect(shopping.map((s) => s.kind)).toEqual(['power'])
  })

  it('keeps a colour and a thickness per cable, and drops them again when cleared', () => {
    const styled = updateCable(cables, cables[0]!.id, { color: '#22aa55', diameterMm: 6 })
    expect(styled[0]).toMatchObject({ color: '#22aa55', diameterMm: 6 })
    const plain = updateCable(styled, cables[0]!.id, { color: undefined, diameterMm: undefined })
    expect(plain[0]).toEqual(cables[0])
  })
})
