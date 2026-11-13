import type { CatalogItem, Category, FrontFeature, RackStandard } from '../domain/types'

type Dims = [widthMm: number, heightMm: number, depthMm: number]
type Extra = Partial<Pick<CatalogItem, 'isShelf' | 'configurable' | 'color' | 'verified' | 'note'>>

/** Equipment with rack ears. */
export function rail(
  id: string,
  name: string,
  brand: string,
  category: Category,
  standard: RackStandard | 'both',
  heightU: number,
  [widthMm, heightMm, depthMm]: Dims,
  weightKg: number,
  powerW: number,
  features: FrontFeature[],
  sourceUrl: string,
  extra: Extra = {},
): CatalogItem {
  return {
    id,
    name,
    brand,
    category,
    mount: 'rail',
    standard,
    heightU,
    widthMm,
    heightMm,
    depthMm,
    weightKg,
    powerW,
    features,
    sourceUrl,
    verified: false,
    ...extra,
  }
}

/** A device without rack ears: it stands on a shelf. */
export function loose(
  id: string,
  name: string,
  brand: string,
  category: Category,
  [widthMm, heightMm, depthMm]: Dims,
  weightKg: number,
  powerW: number,
  features: FrontFeature[],
  sourceUrl: string,
  extra: Extra = {},
): CatalogItem {
  return {
    id,
    name,
    brand,
    category,
    mount: 'shelf',
    standard: 'both',
    widthMm,
    heightMm,
    depthMm,
    weightKg,
    powerW,
    features,
    sourceUrl,
    verified: false,
    ...extra,
  }
}
