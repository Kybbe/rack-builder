import type { CatalogItem, RackProduct } from '../domain/types'
import { RACK_STANDARDS, U_MM } from '../domain/units'

/** Problems in the catalog data, as plain sentences. An empty list means the data is consistent. */
export function validateCatalog(items: CatalogItem[], racks: RackProduct[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const i of items) {
    if (seen.has(i.id)) out.push(`${i.id}: duplicate id`)
    seen.add(i.id)
    if (!/^https?:\/\//.test(i.sourceUrl)) out.push(`${i.id}: missing source link`)
    if (!(i.widthMm > 0 && i.heightMm > 0 && i.depthMm > 0)) out.push(`${i.id}: a dimension is missing`)
    if (!(i.weightKg >= 0) || !(i.powerW >= 0)) out.push(`${i.id}: weight or power is missing`)
    if (i.mount === 'rail') {
      if (!Number.isInteger(i.heightU) || (i.heightU ?? 0) < 1) {
        out.push(`${i.id}: a rack-mount item needs a whole number of rack units`)
      } else if (!i.configurable && i.heightMm > i.heightU! * U_MM + 0.5) {
        out.push(`${i.id}: ${i.heightMm} mm is taller than its ${i.heightU}U`)
      }
      const opening = RACK_STANDARDS[i.standard === 'both' ? '10' : i.standard].openingMm
      if (i.widthMm > opening)
        out.push(`${i.id}: ${i.widthMm} mm is too wide for a ${opening} mm rack opening`)
    } else {
      if (i.isShelf) out.push(`${i.id}: a shelf must be rack-mount`)
      if (Math.min(i.widthMm, i.heightMm) > RACK_STANDARDS['19'].shelfUsableMm)
        out.push(`${i.id}: too wide for any shelf`)
    }
    if (i.configurable && i.mount !== 'rail') out.push(`${i.id}: configurable parts must be rack-mount`)
  }
  const seenR = new Set<string>()
  for (const r of racks) {
    if (seenR.has(r.id)) out.push(`${r.id}: duplicate id`)
    seenR.add(r.id)
    if (!/^https?:\/\//.test(r.sourceUrl)) out.push(`${r.id}: missing source link`)
    if (!Number.isInteger(r.heightU) || r.heightU < 1 || r.heightU > 60) {
      out.push(`${r.id}: rack height must be 1U to 60U`)
      continue
    }
    if (r.outerMm.h < r.heightU * U_MM)
      out.push(`${r.id}: outer height is less than its ${r.heightU}U of rails`)
    if (r.outerMm.w < RACK_STANDARDS[r.standard].panelWidthMm)
      out.push(`${r.id}: outer width is narrower than a panel`)
    if (!(r.depthMm > 0)) out.push(`${r.id}: depth is missing`)
  }
  return out
}
