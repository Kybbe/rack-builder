import { memo } from 'react'
import type { CatalogItem, Rack } from '../domain/types'
import { driveGrid, resolvePlacement } from '../domain/placement'
import { RACK_STANDARDS, U_MM } from '../domain/units'
import { featureRects, type Rect } from '../three/features'

const TONE: Record<Rect['tone'], string> = {
  hole: 'var(--pv-hole)',
  bay: 'var(--pv-bay)',
  screen: 'var(--pv-screen)',
  led: 'var(--pv-led)',
  sfp: 'var(--pv-sfp)',
  handle: 'var(--pv-bay)',
}

/**
 * A front view of a catalog item, drawn from the same data as the 3D model. All previews share one scale
 * (a 19" panel fills the width), so a 10" panel is visibly half as wide and a 4U chassis four times as tall as 1U.
 */
export const ItemPreview = memo(function ItemPreview({
  item,
  standard,
}: {
  item: CatalogItem
  standard: Rack['standard']
}) {
  const std = item.standard === 'both' ? standard : item.standard
  const spec = RACK_STANDARDS[std]
  const rack: Rack = { standard: std, heightU: 48, depthMm: 600, style: 'open', casters: false }
  const full = RACK_STANDARDS['19'].panelWidthMm
  let w: number
  let h: number
  const shapes: React.ReactNode[] = []
  const rects = (rs: Rect[], cx: number, cy: number) =>
    rs.map((r, i) => (
      <rect
        key={`r${i}`}
        x={cx + r.x - r.w / 2}
        y={cy - r.y - r.h / 2}
        width={r.w}
        height={r.h}
        fill={TONE[r.tone]}
      />
    ))

  if (item.mount === 'shelf') {
    w = item.widthMm
    h = item.heightMm
    shapes.push(
      <rect key="b" width={w} height={h} fill={item.color ?? 'var(--pv-bay)'} className="pv-body" />,
    )
    shapes.push(...rects(featureRects(item.features, w * 0.92, h), w / 2, h / 2))
  } else {
    const res = resolvePlacement({ id: 'pv', itemId: item.id, u: 1, side: 'front' }, rack)
    w = spec.panelWidthMm
    h = (res?.heightU ?? 1) * U_MM
    const ear = (spec.panelWidthMm - spec.openingMm) / 2
    const cfg = item.configurable
    if (item.isShelf) {
      shapes.push(<rect key="l" y={h - 12} width={w} height={12} fill={item.color} className="pv-body" />)
      shapes.push(<rect key="e1" width={ear} height={h} fill={item.color} className="pv-body" />)
      shapes.push(<rect key="e2" x={w - ear} width={ear} height={h} fill={item.color} className="pv-body" />)
    } else {
      shapes.push(
        <rect key="b" width={w} height={h} fill={item.color ?? 'var(--pv-bay)'} className="pv-body" />,
      )
    }
    // mounting holes in the ears
    for (let u = 0; u < h / U_MM; u++)
      for (const off of [6.35, 38.1])
        for (const x of [ear / 2, w - ear / 2])
          shapes.push(
            <circle key={`h${u}${off}${x}`} cx={x} cy={u * U_MM + off} r={2.6} fill="var(--pv-hole)" />,
          )
    if (cfg?.kind === 'fanPanel' || cfg?.kind === 'fanTray') {
      const n = cfg.count
      const size = cfg.kind === 'fanPanel' ? Math.min(cfg.fanSizeMm, h - 6) : Math.min(34, h - 8)
      for (let i = 0; i < n; i++) {
        const cx = ear + (spec.openingMm / n) * (i + 0.5)
        shapes.push(<circle key={`f${i}`} cx={cx} cy={h / 2} r={size / 2} fill="var(--pv-hole)" />)
        shapes.push(<circle key={`fh${i}`} cx={cx} cy={h / 2} r={size / 6} fill="var(--pv-sfp)" />)
      }
    } else if (cfg?.kind === 'driveBay') {
      const g = driveGrid(cfg, item, rack)
      const px = (spec.openingMm - 10) / g.cols
      const py = h / g.rows
      for (let i = 0; i < g.cols * g.rows; i++) {
        const c = i % g.cols
        const r = Math.floor(i / g.cols)
        shapes.push(
          <rect
            key={`d${i}`}
            x={ear + 5 + px * c + (px - Math.min(g.cellW, px - 3)) / 2}
            y={h - py * (r + 1) + (py - Math.min(g.cellH, py - 3)) / 2}
            width={Math.min(g.cellW, px - 3)}
            height={Math.min(g.cellH, py - 3)}
            fill={i < cfg.count ? 'var(--pv-bay)' : 'var(--pv-hole)'}
          />,
        )
      }
    } else {
      shapes.push(...rects(featureRects(item.features, spec.openingMm - 14, h), w / 2, h / 2))
    }
  }
  return (
    <svg
      className="pv"
      viewBox={`-1 -1 ${w + 2} ${h + 2}`}
      style={{ width: `${(w / full) * 100}%` }}
      role="img"
      aria-label={`Front view of ${item.name}`}
    >
      {shapes}
    </svg>
  )
})
