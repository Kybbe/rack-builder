import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import * as Popover from '@radix-ui/react-popover'
import { needsRackSetup, useStore } from '../state/store'
import { RACK_PRODUCTS } from '../catalog'
import { STANDARD_HEIGHTS, formatLength, formatU } from '../domain/units'
import type { Rack } from '../domain/types'
import { ColorField, Field, Len, Picker, Segmented, Slider, Switch } from './primitives'

const CUSTOM = '__custom'

/** Every setting of the rack itself. `id` keeps form ids apart when two copies are on screen. */
function RackFields({ id }: { id: string }) {
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
  const product = RACK_PRODUCTS.find((p) => p.id === rack.productId)
  // A modular printed design offers its own heights; anything else the heights racks are sold in.
  const heights = [...new Set([...(product?.heights ?? STANDARD_HEIGHTS[rack.standard]), rack.heightU])].sort(
    (a, b) => a - b,
  )
  const depthRange = rack.standard === '10' ? { min: 100, max: 450 } : { min: 250, max: 1200 }

  return (
    <>
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
            id={`${id}-casters`}
            label="Wheels"
            checked={rack.casters}
            onChange={(casters) => {
              if (rack.style === 'wall') toast.message('A wall-mounted rack has no wheels.')
              else apply({ casters })
            }}
          />
        </Field>
      </div>
      <Field label="Frame colour">
        <ColorField label="Frame colour" value={rack.color} onChange={(color) => apply({ color })} />
      </Field>
      <Field label="Or start from a real rack or a printed design">
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
              hint: `${p.printed ? 'print · ' : ''}${p.standard}" · ${p.heightU}U`,
            })),
          ]}
        />
      </Field>
      {product?.printed && (
        <p className="note">
          Printed design by {product.printed.author} ({product.printed.licence}).{' '}
          <a href={product.sourceUrl} target="_blank" rel="noreferrer">
            Get the files
          </a>
          . {product.note}
        </p>
      )}
    </>
  )
}

/** One line that says what the rack is, for places that only have room for that. */
export function RackSummary({ depth = true }: { depth?: boolean }) {
  const rack = useStore((s) => s.rack)
  const units = useStore((s) => s.units)
  // Plain text, not <Len>: this sits inside a button, where a second thing to focus and hover has no place.
  const deep = units === 'mm' ? `${Math.round(rack.depthMm)} mm` : formatLength(rack.depthMm, units)
  return (
    <span className="mono">
      {rack.standard}" · {rack.heightU}U{depth && ` · ${deep}`}
    </span>
  )
}

/** Choosing the rack as the first step, at the top of the list until it is settled. */
export function RackSetup() {
  const needed = useStore(needsRackSetup)
  if (!needed) return null
  return (
    <section className="panel-section" aria-label="Choose your rack">
      <header className="panel-section__head">
        <h2>Choose your rack</h2>
        <RackSummary />
      </header>
      <RackFields id="setup" />
      <div className="btn-row">
        <span className="note">You can change it later from the top bar.</span>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => useStore.getState().set({ rackChosen: true })}
        >
          Use this rack
        </button>
      </div>
    </section>
  )
}

/** The rack in the top bar: says what it is, and opens the same settings. */
export function RackButton({ narrow = false }: { narrow?: boolean }) {
  const setup = useStore(needsRackSetup)
  return (
    <Popover.Root onOpenChange={(open) => !open && setup && useStore.getState().set({ rackChosen: true })}>
      <Popover.Trigger className="btn btn--ghost rack-btn" aria-label="Rack, change size and type">
        <RackSummary depth={!narrow} />
        <span aria-hidden> ▾</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="popover rack-pop"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          aria-label="Rack"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <RackFields id="bar" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
