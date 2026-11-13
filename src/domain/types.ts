export type RackStandard = '10' | '19'
export type Side = 'front' | 'rear'
export type RackStyle = 'open' | 'enclosed' | 'wall'
export type UnitSystem = 'mm' | 'in'

export interface Rack {
  standard: RackStandard
  heightU: number
  depthMm: number
  style: RackStyle
  casters: boolean
  /** Set when the rack was picked from the catalog of real racks. */
  productId?: string
}

export type Category =
  'networking' | 'servers' | 'minipc' | 'storage' | 'power' | 'cooling' | 'screens' | 'accessories'

/** What the procedural (CAD look) front of a device is built from. Positions are fractions of the face. */
export type FrontFeature =
  | { type: 'ports'; count: number; rows?: 1 | 2; x: number; w: number; kind?: 'rj45' | 'sfp' }
  | { type: 'bays'; count: number; rows: number; x: number; w: number; vertical?: boolean }
  | { type: 'screen'; x: number; w: number; h?: number }
  | { type: 'vent'; x: number; w: number }
  | { type: 'leds'; x: number; count: number }
  | { type: 'outlets'; count: number; x: number; w: number }
  | { type: 'keystones'; count: number; x: number; w: number }
  | { type: 'brush'; x: number; w: number }
  | { type: 'handles' }

export type FanDirection = 'in' | 'out' | 'up' | 'down'
export type DriveSize = '2.5' | '3.5'
export type BayOrientation = 'vertical' | 'horizontal'

export type Configurable =
  | { kind: 'fanPanel'; fanSizeMm: number; count: number; direction: 'in' | 'out' }
  | { kind: 'fanTray'; fanSizeMm: number; count: number; direction: 'up' | 'down' }
  | { kind: 'driveBay'; driveSize: DriveSize; orientation: BayOrientation; count: number }

export interface CatalogItem {
  id: string
  name: string
  brand: string
  category: Category
  /** 'rail' bolts to the rack rails. 'shelf' is a loose device that needs a shelf under it. */
  mount: 'rail' | 'shelf'
  /** Which rack width a rail item is made for. Loose devices and universal parts use 'both'. */
  standard: RackStandard | 'both'
  /** Rail items only: whole rack units. */
  heightU?: number
  /** Body size. For rail items widthMm is the body behind the ears. */
  widthMm: number
  heightMm: number
  depthMm: number
  weightKg: number
  powerW: number
  /** A rail item that carries loose devices. */
  isShelf?: boolean
  /** Default settings for parts whose size follows from a choice (fans, drive bays). */
  configurable?: Configurable
  features: FrontFeature[]
  color?: string
  sourceUrl: string
  /** true when the dimensions were checked against the linked source, false when they are from memory. */
  verified: boolean
  note?: string
}

export interface RackProduct {
  id: string
  name: string
  brand: string
  standard: RackStandard
  heightU: number
  /** Usable mounting depth. */
  depthMm: number
  style: RackStyle
  outerMm: { w: number; h: number; d: number }
  casters?: boolean
  sourceUrl: string
  verified: boolean
  note?: string
}

export interface ShelfChild {
  id: string
  itemId: string
  orientation: 'flat' | 'upright'
}

export interface Placement {
  id: string
  itemId: string
  /** Lowest rack unit the device occupies. U1 is the bottom of the rack. */
  u: number
  side: Side
  config?: Configurable
  children?: ShelfChild[]
  /** Force the CAD look for this device even in realistic mode. */
  cadOnly?: boolean
}

export interface Issue {
  code:
    | 'out-of-bounds'
    | 'overlap'
    | 'wrong-standard'
    | 'needs-adapter'
    | 'too-deep'
    | 'needs-shelf'
    | 'shelf-full'
    | 'not-a-shelf'
    | 'child-too-deep'
    | 'unknown-item'
  message: string
  placementId?: string
}

export interface Layout {
  rack: Rack
  placements: Placement[]
}
