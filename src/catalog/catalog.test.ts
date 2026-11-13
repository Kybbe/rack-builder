import { describe, expect, it } from 'vitest'
import { CATALOG, RACK_PRODUCTS, getItem } from './index'
import { validateCatalog } from './validate'
import { RACK_STANDARDS, STANDARD_HEIGHTS, U_MM } from '../domain/units'

describe('the equipment catalog', () => {
  it('has no problems', () => {
    expect(validateCatalog(CATALOG, RACK_PRODUCTS)).toEqual([])
  })

  it('finds an item by id', () => {
    expect(getItem('ubiquiti-udm-pro')?.name).toMatch(/Dream Machine Pro/)
    expect(getItem('nope')).toBeUndefined()
  })

  it('covers every category the user asked for', () => {
    const cats = new Set(CATALOG.map((i) => i.category))
    for (const c of [
      'networking',
      'servers',
      'minipc',
      'storage',
      'power',
      'cooling',
      'screens',
      'accessories',
    ]) {
      expect(cats).toContain(c)
    }
    expect(CATALOG.filter((i) => i.brand === 'Ubiquiti').length).toBeGreaterThanOrEqual(8)
    expect(RACK_PRODUCTS.some((r) => r.standard === '10')).toBe(true)
    expect(RACK_PRODUCTS.some((r) => r.standard === '19')).toBe(true)
  })

  it('catches a rail device that is taller than its rack units', () => {
    const bad = { ...getItem('ubiquiti-udm-pro')!, id: 'bad', heightMm: 60 }
    expect(validateCatalog([bad], []).join(' ')).toMatch(/bad.*taller/)
  })

  it('catches a device wider than the opening of its rack standard', () => {
    const bad = { ...getItem('patch-panel-12-10')!, id: 'bad', widthMm: 300 }
    expect(validateCatalog([bad], []).join(' ')).toMatch(/bad.*wide/)
    expect(RACK_STANDARDS['10'].openingMm).toBeLessThan(300)
  })

  it('catches duplicate ids and missing source links', () => {
    const a = getItem('ubiquiti-udm-pro')!
    expect(validateCatalog([a, a], []).join(' ')).toMatch(/duplicate/)
    expect(validateCatalog([{ ...a, sourceUrl: '' }], []).join(' ')).toMatch(/source/)
  })

  it('catches a rack product with a height that standard does not come in, or shorter than its units', () => {
    const r = RACK_PRODUCTS[0]!
    expect(validateCatalog([], [{ ...r, heightU: 0 }]).length).toBeGreaterThan(0)
    expect(
      validateCatalog([], [{ ...r, outerMm: { ...r.outerMm, h: r.heightU * U_MM - 1 } }]).join(' '),
    ).toMatch(/outer height/)
    expect(STANDARD_HEIGHTS[r.standard].length).toBeGreaterThan(0)
  })
})
