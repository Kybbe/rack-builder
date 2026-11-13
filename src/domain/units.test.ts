import { describe, expect, it } from 'vitest'
import { RACK_STANDARDS, STANDARD_HEIGHTS, U_MM, formatLength, formatU, mmToIn, uToIn, uToMm } from './units'

describe('rack units', () => {
  it('one rack unit is 44.45 mm, which is 1.75 inches', () => {
    expect(U_MM).toBe(44.45)
    expect(uToMm(1)).toBe(44.45)
    expect(uToIn(1)).toBeCloseTo(1.75, 6)
  })

  it('a full 42U rack has 1866.9 mm of mounting height', () => {
    expect(uToMm(42)).toBeCloseTo(1866.9, 6)
    expect(uToIn(42)).toBeCloseTo(73.5, 6)
  })

  it('converts millimetres to inches', () => {
    expect(mmToIn(254)).toBe(10)
    expect(mmToIn(482.6)).toBeCloseTo(19, 6)
  })

  it('a 19 inch panel is 482.6 mm wide and a 10 inch panel is 254 mm wide', () => {
    expect(RACK_STANDARDS['19'].panelWidthMm).toBe(482.6)
    expect(RACK_STANDARDS['10'].panelWidthMm).toBe(254)
    expect(RACK_STANDARDS['19'].openingMm).toBeLessThan(RACK_STANDARDS['19'].holePitchMm)
    expect(RACK_STANDARDS['10'].openingMm).toBeLessThan(RACK_STANDARDS['10'].holePitchMm)
  })

  it('shows a U height with both units, in the order the user chose', () => {
    expect(formatU(2, 'mm')).toBe('2U · 88.9 mm · 3.50 in')
    expect(formatU(2, 'in')).toBe('2U · 3.50 in · 88.9 mm')
    expect(formatU(1, 'mm')).toBe('1U · 44.5 mm · 1.75 in')
  })

  it('formats a plain length in the chosen unit', () => {
    expect(formatLength(285.6, 'mm')).toBe('285.6 mm')
    expect(formatLength(254, 'in')).toBe('10.00 in')
  })

  it('offers only heights that exist for each standard, in rising order', () => {
    for (const std of ['10', '19'] as const) {
      const hs = STANDARD_HEIGHTS[std]
      expect([...hs].sort((a, b) => a - b)).toEqual(hs)
    }
    expect(STANDARD_HEIGHTS['19']).toContain(42)
    expect(STANDARD_HEIGHTS['10']).toContain(8)
    expect(Math.max(...STANDARD_HEIGHTS['10'])).toBeLessThan(Math.max(...STANDARD_HEIGHTS['19']))
  })
})
