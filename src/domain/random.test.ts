import { describe, expect, it } from 'vitest'
import type { Placement, Rack } from './types'
import { addPlacement, movePlacement, occupiedRange, removePlacement, validateLayout } from './placement'
import { addToShelf, removeFromShelf } from './shelf'
import { CATALOG } from '../catalog'

// Small seeded generator so a failure can be replayed from its seed.
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function assertInvariants(rack: Rack, placements: Placement[], seed: number, step: number) {
  const where = `seed ${seed} step ${step}`
  const hard = validateLayout(rack, placements).filter((i) =>
    ['out-of-bounds', 'overlap', 'wrong-standard', 'needs-shelf', 'shelf-full', 'unknown-item'].includes(
      i.code,
    ),
  )
  expect(hard, where).toEqual([])
  // independent check: no unit is claimed twice on the same side
  for (const side of ['front', 'rear'] as const) {
    const seen = new Set<number>()
    for (const p of placements.filter((x) => x.side === side)) {
      const { from, to } = occupiedRange(p)
      expect(from, where).toBeGreaterThanOrEqual(1)
      expect(to, where).toBeLessThanOrEqual(rack.heightU)
      for (let u = from; u <= to; u++) {
        expect(seen.has(u), `${where}: U${u} ${side} claimed twice`).toBe(false)
        seen.add(u)
      }
    }
  }
  expect(new Set(placements.map((p) => p.id)).size, where).toBe(placements.length)
}

describe('random editing never corrupts a rack', () => {
  for (const seed of [1, 7, 42, 1337, 20261113]) {
    it(`seed ${seed}`, () => {
      const rnd = mulberry32(seed)
      const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!
      const rack: Rack = {
        standard: rnd() < 0.5 ? '10' : '19',
        heightU: pick([4, 8, 12, 22]),
        depthMm: pick([200, 450, 800]),
        style: 'open',
        casters: false,
      }
      let placements: Placement[] = []
      let n = 0
      for (let step = 0; step < 400; step++) {
        const op = rnd()
        if (op < 0.45) {
          const item = pick(CATALOG)
          const r = addPlacement(rack, placements, {
            id: `p${n++}`,
            itemId: item.id,
            u: Math.floor(rnd() * (rack.heightU + 3)) - 1,
            side: rnd() < 0.8 ? 'front' : 'rear',
            config: item.configurable,
          })
          placements = r.placements
        } else if (op < 0.65 && placements.length) {
          const t = pick(placements)
          placements = movePlacement(
            rack,
            placements,
            t.id,
            Math.floor(rnd() * (rack.heightU + 3)) - 1,
            rnd() < 0.8 ? 'front' : 'rear',
          ).placements
        } else if (op < 0.8 && placements.length) {
          placements = addToShelf(rack, placements, pick(placements).id, pick(CATALOG).id, {
            orientation: rnd() < 0.5 ? 'flat' : 'upright',
            childId: `k${n++}`,
          }).placements
        } else if (op < 0.88 && placements.length) {
          const t = pick(placements)
          if (t.children?.length) placements = removeFromShelf(placements, t.id, pick(t.children).id)
        } else if (placements.length) {
          placements = removePlacement(placements, pick(placements).id)
        }
        assertInvariants(rack, placements, seed, step)
      }
    })
  }
})
