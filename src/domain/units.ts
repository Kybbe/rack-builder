import type { RackStandard, UnitSystem } from './types'

/** One rack unit (EIA-310). */
export const U_MM = 44.45
export const MM_PER_IN = 25.4

export interface StandardSpec {
  label: string
  /** Full width of a front panel including the ears. */
  panelWidthMm: number
  /** Clear width between the rails: the widest body that passes through. */
  openingMm: number
  /** Distance between the centres of the left and right mounting holes. */
  holePitchMm: number
  /** Width a shelf offers to loose devices. */
  shelfUsableMm: number
}

export const RACK_STANDARDS: Record<RackStandard, StandardSpec> = {
  '19': { label: '19"', panelWidthMm: 482.6, openingMm: 450.85, holePitchMm: 465.1, shelfUsableMm: 440 },
  '10': { label: '10"', panelWidthMm: 254, openingMm: 222.25, holePitchMm: 236.525, shelfUsableMm: 215 },
}

/** Heights racks are commonly sold in. */
export const STANDARD_HEIGHTS: Record<RackStandard, number[]> = {
  '10': [4, 6, 8, 9, 12, 16, 18, 22],
  '19': [4, 6, 9, 12, 15, 18, 22, 25, 27, 32, 36, 42, 45, 48],
}

/** Mounting holes inside one unit, measured from the bottom edge of the unit (EIA-310 universal pattern). */
export const HOLE_OFFSETS_MM = [6.35, 22.225, 38.1]

export const uToMm = (u: number) => u * U_MM
export const mmToIn = (mm: number) => mm / MM_PER_IN
export const uToIn = (u: number) => mmToIn(uToMm(u))

export function formatLength(mm: number, unit: UnitSystem): string {
  return unit === 'mm' ? `${mm.toFixed(1)} mm` : `${mmToIn(mm).toFixed(2)} in`
}

/** "2U · 88.9 mm · 3.50 in", with the user's preferred unit first. */
export function formatU(u: number, unit: UnitSystem): string {
  const mm = formatLength(uToMm(u), 'mm')
  const inch = formatLength(uToMm(u), 'in')
  return unit === 'mm' ? `${u}U · ${mm} · ${inch}` : `${u}U · ${inch} · ${mm}`
}
