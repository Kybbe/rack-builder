import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useStore } from '../state/store'
import { RACK_PRODUCTS } from '../catalog'
import { STANDARD_HEIGHTS, formatU } from '../domain/units'
import type { Rack } from '../domain/types'
import { Field, Len, Picker, Segmented, Slider, Switch, ULabel } from './primitives'

const CUSTOM = '__custom'

export function RackSettings() {
  const rack = useStore((s) => s.rack)
  const units = useStore((s) => s.units)
  const setRack = useStore((s) => s.setRack)
  const applyProduct = useStore((s) => s.applyRackProduct)
  const [depth, setDepth] = useState(rack.depthMm)
  useEffect(() => setDepth(rack.depthMm), [rack.depthMm])

  const apply = (patch: Partial<Rack>) => {
    const r = setRack(patch)
    if (!r.ok) toast.error(r.errors[0]?.message ?? 'That rack size does not work.')
    return r.ok
  }
  const heights = [...new Set([...STANDARD_HEIGHTS[rack.standard], rack.heightU])].sort((a, b) => a - b)
  const depthRange = rack.standard === '10' ? { min: 100, max: 450 } : { min: 250, max: 1200 }

  return (
    <section className="panel-section" aria-label="Rack">
      <header className="panel-section__head">
        <h2>Rack</h2>
        <span className="mono dim">
          {rack.standard}" · <ULabel u={rack.heightU} /> · <Len mm={rack.depthMm} digits={0} />
        </span>
      </header>
      <div className="grid-2">
        <Field label="Width">
          <Segmented
            full
            label="Rack width"
            value={rack.standard}
            onChange={(standard) => {
              const height = STANDARD_HEIGHTS[standard].includes(rack.heightU)
                ? rack.heightU
                : (STANDARD_HEIGHTS[standard].find((h) => h >= rack.heightU) ??
                  STANDARD_HEIGHTS[standard].at(-1)!)
              apply({
                standard,
                heightU: height,
                depthMm: standard === '10' ? Math.min(rack.depthMm, 300) : Math.max(rack.depthMm, 600),
              })
            }}
            options={[
              { value: '10', label: '10"', title: '254 mm panels' },
              { value: '19', label: '19"', title: '482.6 mm panels' },
            ]}
          />
        </Field>
        <Field label="Height">
          <Picker
            label="Rack height"
            value={String(rack.heightU)}
            onChange={(v) => apply({ heightU: Number(v) })}
            options={heights.map((h) => ({
              value: String(h),
              label: `${h}U`,
              hint: formatU(h, units).split(' · ')[1],
            }))}
          />
        </Field>
      </div>
      <Field label="Depth" value={<Len mm={depth} digits={0} />}>
        <Slider
          label="Rack depth"
          value={depth}
          min={depthRange.min}
          max={depthRange.max}
          step={10}
          onChange={setDepth}
          onCommit={(v) => {
            if (!apply({ depthMm: v })) setDepth(rack.depthMm)
          }}
        />
      </Field>
      <div className="grid-2">
        <Field label="Type">
          <Picker
            label="Rack type"
            value={rack.style}
            onChange={(v) => apply({ style: v as Rack['style'] })}
            options={[
              { value: 'open', label: 'Open frame' },
              { value: 'enclosed', label: 'Enclosed' },
              { value: 'wall', label: 'Wall mount' },
            ]}
          />
        </Field>
        <Field label="Base">
          <Switch
            id="casters"
            label="Wheels"
            checked={rack.casters}
            onChange={(casters) => {
              if (rack.style === 'wall') toast.message('A wall-mounted rack has no wheels.')
              else apply({ casters })
            }}
          />
        </Field>
      </div>
      <Field label="Or start from a real rack">
        <Picker
          label="Real rack"
          value={rack.productId ?? CUSTOM}
          onChange={(v) => {
            if (v === CUSTOM) return
            const r = applyProduct(v)
            if (!r.ok) toast.error(r.errors[0]?.message ?? 'That rack does not fit your equipment.')
          }}
          options={[
            { value: CUSTOM, label: 'Custom size' },
            ...RACK_PRODUCTS.map((p) => ({
              value: p.id,
              label: p.name,
              hint: `${p.standard}" · ${p.heightU}U`,
            })),
          ]}
        />
      </Field>
    </section>
  )
}
