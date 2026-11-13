import type { CatalogItem, Category } from '../domain/types'
import { networking } from './networking'
import { servers } from './servers'
import { minipc } from './minipc'
import { storage } from './storage'
import { power } from './power'
import { cooling } from './cooling'
import { screens } from './screens'
import { accessories } from './accessories'

export { RACK_PRODUCTS } from './racks'

export const CATALOG: CatalogItem[] = [
  ...networking,
  ...servers,
  ...minipc,
  ...storage,
  ...power,
  ...cooling,
  ...screens,
  ...accessories,
]

const byId = new Map(CATALOG.map((i) => [i.id, i]))
export const getItem = (id: string): CatalogItem | undefined => byId.get(id)

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'networking', label: 'Networking' },
  { id: 'servers', label: 'Servers' },
  { id: 'minipc', label: 'Mini PCs and boards' },
  { id: 'storage', label: 'Storage' },
  { id: 'power', label: 'Power' },
  { id: 'cooling', label: 'Cooling' },
  { id: 'screens', label: 'Screens' },
  { id: 'accessories', label: 'Shelves and panels' },
]
