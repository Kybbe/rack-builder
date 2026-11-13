import type { Issue, Placement, Rack } from './types'
import { resolvePlacement, validateLayout } from './placement'

export interface Budget {
  usedU: number
  freeU: number
  weightKg: number
  powerW: number
  deepestMm: number
  issues: Issue[]
}

export function budget(rack: Rack, placements: Placement[]): Budget {
  const taken = new Set<number>()
  let weightKg = 0
  let powerW = 0
  let deepestMm = 0
  for (const p of placements) {
    const r = resolvePlacement(p, rack)
    if (!r) continue
    for (let u = p.u; u < p.u + r.heightU; u++) taken.add(u)
    weightKg += r.weightKg
    powerW += r.powerW
    deepestMm = Math.max(deepestMm, r.depthMm)
  }
  return {
    usedU: taken.size,
    freeU: Math.max(0, rack.heightU - taken.size),
    weightKg,
    powerW,
    deepestMm,
    issues: validateLayout(rack, placements),
  }
}
