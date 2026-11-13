import { useMemo } from 'react'
import { toast } from 'sonner'
import { useStore, newId } from '../state/store'
import { planRack } from '../domain/planner'
import { getItem } from '../catalog'
import type { Layout, RackProduct } from '../domain/types'
import { Field, Len, Segmented, Slider, Stepper, Tip, ULabel } from './primitives'

/** Plans are laid out with throwaway ids; the rack needs its own. */
function withFreshIds(layout: Layout): Layout {
  return {
    rack: layout.rack,
    placements: layout.placements.map((p) => ({
      ...p,
      id: newId(),
      ...(p.children ? { children: p.children.map((c) => ({ ...c, id: newId() })) } : {}),
    })),
  }
}

export function PlannerPanel() {
  const wanted = useStore((s) => s.wanted)
  const headroomPct = useStore((s) => s.headroomPct)
  const standard = useStore((s) => s.planStandard)
  const hasRack = useStore((s) => s.placements.length > 0)
  const set = useStore((s) => s.set)
  const want = useStore((s) => s.want)
  const plan = useMemo(() => planRack(wanted, { standard, headroomPct }), [wanted, standard, headroomPct])

  const use = (product?: RackProduct) => {
    const p = product ? planRack(wanted, { standard, headroomPct, forRack: product }) : plan
    if (!p.layout) {
      toast.error(product ? `${product.name} is too small for this list.` : 'There is nothing to build yet.')
      return
    }
    useStore.getState().load(withFreshIds(p.layout))
    set({ tab: 'build' })
    useStore.getState().setView('iso')
    toast.success(product ? `Built in the ${product.name}` : `Built in a ${p.layout.rack.heightU}U rack`, {
      description: hasRack ? 'This replaced the rack you had.' : undefined,
      action: hasRack ? { label: 'Undo', onClick: () => useStore.getState().undo() } : undefined,
    })
  }

  return (
    <section className="panel-section" aria-label="Plan">
      <header className="panel-section__head">
        <h2>What goes in it</h2>
        {wanted.length > 0 && (
          <button type="button" className="link" onClick={() => set({ wanted: [] })}>
            Clear list
          </button>
        )}
      </header>
      <div className="grid-2">
        <Field label="Rack width">
          <Segmented
            full
            label="Rack width for the plan"
            value={standard}
            onChange={(planStandard) => set({ planStandard })}
            options={[
              { value: '10', label: '10"' },
              { value: '19', label: '19"' },
            ]}
          />
        </Field>
        <Field label="Spare room" value={<span className="mono">{headroomPct}%</span>}>
          <Slider
            label="Spare room in percent"
            value={headroomPct}
            min={0}
            max={100}
            step={5}
            onChange={(v) => set({ headroomPct: v })}
          />
        </Field>
      </div>

      {wanted.length === 0 ? (
        <p className="empty">
          Add equipment from the list below with +. The rack size is worked out from it.
        </p>
      ) : (
        <ul className="wanted">
          {wanted.map((w) => {
            const item = getItem(w.itemId)
            if (!item) return null
            return (
              <li key={w.itemId}>
                <span className="wanted__name">{item.name}</span>
                <span className="mono dim">{item.mount === 'rail' ? `${item.heightU}U` : 'shelf'}</span>
                <Stepper label={item.name} value={w.qty} onChange={(q) => want(w.itemId, q - w.qty)} />
              </li>
            )
          })}
        </ul>
      )}

      {plan.issues.map((i, n) => (
        <p key={n} className={`note ${i.code === 'needs-adapter' ? 'note--warn' : 'note--bad'}`}>
          {i.message}
        </p>
      ))}

      {plan.usedU > 0 && (
        <div className="result">
          <div className="result__big">
            {plan.suggestedHeightU !== null ? (
              <>
                <span className="result__num mono">
                  <ULabel u={plan.suggestedHeightU} />
                </span>
                <span>
                  suggested rack height
                  <br />
                  <span className="dim">
                    {plan.usedU}U of equipment + {headroomPct}% spare = {plan.requiredU}U
                  </span>
                </span>
              </>
            ) : (
              <span className="note note--bad">
                This list needs {plan.requiredU}U. No standard {standard}" rack is that tall: split it over
                two racks or lower the spare room.
              </span>
            )}
          </div>
          <dl className="specs mono">
            <div>
              <dt>Min. depth</dt>
              <dd>
                <Tip content="Deepest device plus 75 mm for plugs and cable bends">
                  <span tabIndex={0}>
                    <Len mm={plan.minDepthMm} digits={0} />
                  </span>
                </Tip>
              </dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{plan.weightKg.toFixed(1)} kg</dd>
            </div>
            <div>
              <dt>Max power</dt>
              <dd>{Math.round(plan.powerW)} W</dd>
            </div>
            <div>
              <dt>Shelves added</dt>
              <dd>{plan.shelvesAdded}</dd>
            </div>
          </dl>
          {plan.suggestedHeightU !== null && (
            <button type="button" className="btn btn--primary btn--block" onClick={() => use()}>
              Build this in a {plan.suggestedHeightU}U rack
            </button>
          )}

          <h3>Racks you can buy</h3>
          {plan.racks.length === 0 ? (
            <p className="empty">No rack in the catalog is tall enough for this list.</p>
          ) : (
            <ul className="racks">
              {plan.racks.map(({ product, depthOk, spareU }) => (
                <li key={product.id}>
                  <div>
                    <a href={product.sourceUrl} target="_blank" rel="noreferrer">
                      {product.name}
                    </a>
                    <span className="mono dim">
                      <ULabel u={product.heightU} /> · <Len mm={product.depthMm} digits={0} /> deep · {spareU}
                      U spare
                      {product.casters ? ' · wheels' : ''}
                    </span>
                    {!depthOk && (
                      <span className="note note--warn">
                        Too shallow: your deepest device is <Len mm={plan.deepestMm} digits={0} />.
                      </span>
                    )}
                    {!product.verified && (
                      <span className="dim">Size from resellers, not the maker. Check before buying.</span>
                    )}
                  </div>
                  <button type="button" className="btn" onClick={() => use(product)}>
                    Use
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
