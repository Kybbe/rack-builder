import type { Placement, Rack } from './types'
import { RACK_STANDARDS, U_MM } from './units'
import { resolvePlacement } from './placement'
import { getItem } from '../catalog'

export interface Printer {
  id: string
  name: string
  x: number
  y: number
  z: number
  note?: string
}

/** Build volumes in mm. */
export const PRINTERS: Printer[] = [
  { id: 'bambu-a1-mini', name: 'Bambu Lab A1 mini', x: 180, y: 180, z: 180 },
  { id: 'bambu-a1', name: 'Bambu Lab A1', x: 256, y: 256, z: 256 },
  { id: 'bambu-p1s', name: 'Bambu Lab P1S', x: 256, y: 256, z: 256 },
  { id: 'bambu-p2s', name: 'Bambu Lab P2S', x: 256, y: 256, z: 256 },
  { id: 'bambu-x1c', name: 'Bambu Lab X1 Carbon', x: 256, y: 256, z: 256 },
  { id: 'bambu-h2s', name: 'Bambu Lab H2S', x: 340, y: 320, z: 340 },
  {
    id: 'bambu-h2d',
    name: 'Bambu Lab H2D',
    x: 325,
    y: 320,
    z: 325,
    note: 'One nozzle reaches 325 mm. Printing with both nozzles leaves 300 mm.',
  },
  { id: 'prusa-mk4s', name: 'Prusa MK4S', x: 250, y: 210, z: 220 },
  { id: 'prusa-core-one', name: 'Prusa CORE One', x: 250, y: 220, z: 270 },
  {
    id: 'prusa-core-one-indx',
    name: 'Prusa CORE One+ INDX',
    x: 248,
    y: 205,
    z: 270,
    note: 'The tool dock takes some of the bed.',
  },
  { id: 'prusa-core-one-l', name: 'Prusa CORE One L', x: 300, y: 300, z: 330 },
  {
    id: 'prusa-core-one-l-indx',
    name: 'Prusa CORE One L+ INDX',
    x: 298,
    y: 275,
    z: 330,
    note: 'The tool dock takes some of the bed.',
  },
  { id: 'prusa-xl', name: 'Prusa XL', x: 360, y: 360, z: 360 },
  { id: 'creality-ender-3-v2', name: 'Creality Ender-3 V2', x: 220, y: 220, z: 250 },
  { id: 'creality-ender-3-v3', name: 'Creality Ender-3 V3', x: 220, y: 220, z: 250 },
  { id: 'creality-k1-max', name: 'Creality K1 Max', x: 300, y: 300, z: 300 },
  { id: 'creality-k2-pro', name: 'Creality K2 Pro', x: 300, y: 300, z: 300 },
  { id: 'creality-k3', name: 'Creality K3', x: 260, y: 260, z: 260 },
  { id: 'snapmaker-u1', name: 'Snapmaker U1', x: 270, y: 270, z: 270 },
  { id: 'voron-24-350', name: 'Voron 2.4 (350)', x: 350, y: 350, z: 330 },
]

export type Orientation = 'flat' | 'diagonal'

/** How a long part of length × width lies on the bed, or null when it does not fit at all. */
export function fitsOnBed(
  lengthMm: number,
  widthMm: number,
  bed: { x: number; y: number },
): Orientation | null {
  if ((lengthMm <= bed.x && widthMm <= bed.y) || (lengthMm <= bed.y && widthMm <= bed.x)) return 'flat'
  for (let deg = 1; deg < 90; deg++) {
    const a = (deg * Math.PI) / 180
    const w = lengthMm * Math.cos(a) + widthMm * Math.sin(a)
    const h = lengthMm * Math.sin(a) + widthMm * Math.cos(a)
    if (w <= bed.x && h <= bed.y) return 'diagonal'
  }
  return null
}

export type Fastening = 'inserts' | 'captive-nuts' | 'cage-nuts' | 'printed-threads'

/** Ways to give a printed rail a thread. They replace each other: pick one for the whole rack. */
export const FASTENINGS: { id: Fastening; name: string; nut?: string; blurb: string }[] = [
  {
    id: 'inserts',
    name: 'Heat-set inserts',
    nut: 'M6 heat-set inserts',
    blurb: 'Brass inserts melted into the rail with a soldering iron. Strong and reusable, the usual choice.',
  },
  {
    id: 'captive-nuts',
    name: 'Square nuts',
    nut: 'M6 square nuts (DIN 562)',
    blurb: 'Nuts pushed into pockets behind each hole. Cheap, no soldering iron, the rail needs the pockets.',
  },
  {
    id: 'cage-nuts',
    name: 'Cage nuts',
    nut: 'M6 cage nuts',
    blurb: 'Like a steel rack: needs 9.5 mm square holes and thick rails, so only for sturdy prints.',
  },
  {
    id: 'printed-threads',
    name: 'Printed threads',
    blurb: 'Screws cut straight into the plastic. Nothing to buy, wears out after a few changes.',
  },
]

export interface HardwareLine {
  id: string
  label: string
  qty: number
  note?: string
}

export interface PrintAdvice {
  rail: {
    lengthMm: number
    sectionMm: number
    parts: number
    /** Rack units in each printed piece, bottom to top. */
    partUs: number[]
    longestPieceMm: number
    orientation: Orientation
  }
  plate: { widthMm: number; depthMm: number; parts: number; tiles: [number, number] }
  /** Side of the smallest square bed that prints a rail in one piece (corner to corner). */
  minBedForOnePieceMm: number
  hardware: HardwareLine[]
  filamentGrams: number
  spools: number
  warnings: string[]
  tips: string[]
}

/** Extra length on each printed rail piece for the end caps or the joint. */
const RAIL_EXTRA_MM = 10
const PLATE_THICKNESS_MM = 5
/** Share of a part's outer volume that is plastic with ~4 walls and 25% infill. */
const RAIL_FILL = 0.45
const PLATE_FILL = 0.5
const PETG_G_PER_CM3 = 1.27

export function advisePrint(
  rack: Rack,
  placements: Placement[],
  printer: Printer,
  opts: { fastening?: Fastening } = {},
): PrintAdvice {
  const fastening = FASTENINGS.find((f) => f.id === (opts.fastening ?? 'inserts'))!
  const plain = fastening.id === 'inserts' || fastening.id === 'cage-nuts' ? 'heat-set inserts' : 'hex nuts'
  const std = RACK_STANDARDS[rack.standard]
  const section = rack.standard === '10' ? 20 : 25
  const bed = { x: printer.x, y: printer.y }
  const lengthMm = rack.heightU * U_MM + RAIL_EXTRA_MM

  // Fewest pieces that fit, cut between rack units so no mounting hole is split.
  let parts = 1
  let orientation: Orientation | null = null
  for (; parts <= rack.heightU; parts++) {
    const longest = Math.ceil(rack.heightU / parts) * U_MM + RAIL_EXTRA_MM
    orientation = fitsOnBed(longest, section, bed)
    if (orientation) break
  }
  parts = Math.min(parts, rack.heightU)
  const base = Math.floor(rack.heightU / parts)
  const extra = rack.heightU % parts
  const partUs = Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0))
  const longestPieceMm = Math.max(...partUs) * U_MM + RAIL_EXTRA_MM

  const plateW = std.panelWidthMm + 26
  const plateD = rack.depthMm
  const tilesFor = (bx: number, by: number): [number, number] => [
    Math.ceil(plateW / bx),
    Math.ceil(plateD / by),
  ]
  const a = tilesFor(bed.x, bed.y)
  const b = tilesFor(bed.y, bed.x)
  const tiles = a[0] * a[1] <= b[0] * b[1] ? a : b
  const plateParts = tiles[0] * tiles[1]

  let deviceScrews = 0
  let loadKg = 0
  for (const p of placements) {
    const r = resolvePlacement(p, rack)
    if (!r) continue
    loadKg += r.weightKg
    if (getItem(p.itemId)?.mount === 'rail') deviceScrews += r.heightU <= 2 ? 4 : 8
  }

  const hardware: HardwareLine[] = []
  if (deviceScrews > 0) {
    hardware.push({
      id: 'device-screws',
      label: 'M6 × 12 mm rack screws',
      qty: deviceScrews,
      note: '4 per device up to 2U, 8 for taller ones',
    })
    if (fastening.nut)
      hardware.push({
        id: 'device-nuts',
        label: fastening.nut,
        qty: deviceScrews,
        note: `Filling every hole in the front rails would take ${rack.heightU * 3 * 2}`,
      })
  }
  hardware.push({
    id: 'frame-bolts',
    label: `M5 × 16 mm bolts with M5 ${plain}`,
    qty: 16,
    note: '2 at each end of each rail, into the top and bottom plates',
  })
  const joints = 4 * (parts - 1)
  if (joints > 0) {
    hardware.push({ id: 'joint-bolts', label: `M3 × 20 mm bolts with M3 ${plain}`, qty: joints * 2 })
    hardware.push({
      id: 'joint-pins',
      label: '3 mm steel dowel pins',
      qty: joints * 2,
      note: 'Keep the rail halves in line. Filament offcuts also work',
    })
  }
  if (plateParts > 1) {
    hardware.push({
      id: 'plate-bolts',
      label: 'M3 × 12 mm bolts + nuts for the plate seams',
      qty: 2 * (plateParts - 1) * 3,
    })
  }
  if (rack.casters) {
    hardware.push({ id: 'casters', label: '40 mm swivel casters (2 with brake)', qty: 4 })
    hardware.push({ id: 'caster-screws', label: 'M5 × 12 mm bolts + nuts for the casters', qty: 16 })
  } else {
    hardware.push({ id: 'feet', label: 'Rubber feet', qty: 4 })
  }

  const railCm3 = (4 * lengthMm * section * section * RAIL_FILL) / 1000
  const plateCm3 = (2 * plateW * plateD * PLATE_THICKNESS_MM * PLATE_FILL) / 1000
  const filamentGrams = Math.round(((railCm3 + plateCm3) * PETG_G_PER_CM3) / 10) * 10

  const warnings: string[] = []
  if (rack.standard === '19') {
    warnings.push(
      'A fully printed 19" frame flexes under load. Use 2020 aluminium extrusion or steel rack rails for the uprights and print only the corners and brackets.',
    )
  }
  if (loadKg > 15) {
    warnings.push(
      `This rack carries about ${Math.round(loadKg)} kg. Printed rails creep under that much weight: use metal uprights.`,
    )
  }
  if (parts > 1) {
    warnings.push(
      `Each rail is printed in ${parts} pieces. A joint is the weakest point: put the heavy devices so they do not hang across one.`,
    )
  }
  const tips = [
    'Print the rails lying down so the layers run along their length. A rail printed standing up snaps between layers.',
    'Use PETG or ASA. PLA softens around 55 °C and sags next to warm equipment.',
    '4 walls and 25 to 40% infill for rails, and at least 5 top and bottom layers for the plates.',
    orientation === 'diagonal'
      ? 'The rail pieces only fit corner to corner on this bed. Check that the purge line and brim still have room.'
      : 'Leave a few millimetres to the bed edge for a brim.',
  ]

  return {
    rail: { lengthMm, sectionMm: section, parts, partUs, longestPieceMm, orientation: orientation ?? 'flat' },
    plate: { widthMm: plateW, depthMm: plateD, parts: plateParts, tiles },
    minBedForOnePieceMm: Math.ceil((lengthMm + section) / Math.SQRT2),
    hardware,
    filamentGrams,
    spools: Math.max(1, Math.ceil(filamentGrams / 1000)),
    warnings,
    tips,
  }
}
