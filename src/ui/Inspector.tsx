import { useEffect, useState } from 'react'
import { Drawer } from 'vaul'
import { toast } from 'sonner'
import { useStore } from '../state/store'
import { getItem } from '../catalog'
import { resolvePlacement } from '../domain/placement'
import { shelfLayout } from '../domain/shelf'
import type { Configurable, Placement } from '../domain/types'
import { hasModel } from '../three/Device'
import { report } from './feedback'
import { Field, Len, Picker, Segmented, Stepper, Switch, ULabel } from './primitives'

const FAN_SIZES = [40, 60, 80, 92, 120, 140]

export function removeWithUndo(id: string) {
  const st = useStore.getState()
  const p = st.placements.find((x) => x.id === id)
  if (!p) return
  st.remove(id)
  toast(`${getItem(p.itemId)?.name ?? 'Device'} removed`, {
    action: { label: 'Undo', onClick: () => useStore.getState().undo() },
  })
}

function ConfigEditor({ p, cfg, maxCount }: { p: Placement; cfg: Configurable; maxCount: number }) {
  const setConfig = useStore((s) => s.setConfig)
  const apply = (next: Configurable) => report(setConfig(p.id, next))
  if (cfg.kind === 'driveBay') {
    return (
      <>
        <div className="grid-2">
          <Field label="Drive size">
            <Segmented
              full
              label="Drive size"
              value={cfg.driveSize}
              onChange={(driveSize) => apply({ ...cfg, driveSize })}
              options={[
                { value: '3.5', label: '3.5"' },
                { value: '2.5', label: '2.5"' },
              ]}
            />
          </Field>
          <Field label="Drives">
            <Stepper
              label="Number of drives"
              value={cfg.count}
              min={1}
              max={maxCount}
              onChange={(count) => apply({ ...cfg, count })}
            />
          </Field>
        </div>
        <Field label="Direction">
          <Segmented
            full
            label="Drive direction"
            value={cfg.orientation}
            onChange={(orientation) => apply({ ...cfg, orientation })}
            options={[
              { value: 'horizontal', label: 'Lying flat' },
              { value: 'vertical', label: 'Standing up' },
            ]}
          />
        </Field>
      </>
    )
  }
  const tray = cfg.kind === 'fanTray'
  return (
    <>
      <div className="grid-2">
        <Field label="Fan size">
          <Picker
            label="Fan size"
            value={String(cfg.fanSizeMm)}
            onChange={(v) => {
              const next = { ...cfg, fanSizeMm: Number(v) }
              const st = useStore.getState()
              const max = resolvePlacement({ ...p, config: next }, st.rack)?.maxCount ?? 1
              apply({ ...next, count: Math.min(next.count, max) })
            }}
            options={FAN_SIZES.map((s) => ({
              value: String(s),
              label: `${s} mm`,
              hint: `${(s / 25.4).toFixed(1)} in`,
            }))}
          />
        </Field>
        <Field label="Fans">
          <Stepper
            label="Number of fans"
            value={cfg.count}
            min={1}
            max={maxCount}
            onChange={(count) => apply({ ...cfg, count })}
          />
        </Field>
      </div>
      <Field label="Air direction">
        {tray ? (
          <Segmented
            full
            label="Air direction"
            value={cfg.direction}
            onChange={(direction) => apply({ ...cfg, direction })}
            options={[
              { value: 'up', label: 'Blowing up' },
              { value: 'down', label: 'Blowing down' },
            ]}
          />
        ) : (
          <Segmented
            full
            label="Air direction"
            value={cfg.direction}
            onChange={(direction) => apply({ ...cfg, direction })}
            options={[
              { value: 'out', label: 'Blowing out' },
              { value: 'in', label: 'Blowing in' },
            ]}
          />
        )}
      </Field>
    </>
  )
}

function Body({ p }: { p: Placement }) {
  const rack = useStore((s) => s.rack)
  const look = useStore((s) => s.look)
  const st = useStore.getState
  const res = resolvePlacement(p, rack)
  if (!res) return null
  const { item } = res
  const cfg = item.configurable ? (p.config ?? item.configurable) : undefined
  const layout = item.isShelf ? shelfLayout(p, rack) : null
  const top = p.u + res.heightU - 1

  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <div>
          <p className="eyebrow">{item.brand}</p>
          <h2>{item.name}</h2>
        </div>
        <button type="button" className="icon-btn" onClick={() => st().select(null)} aria-label="Close">
          ×
        </button>
      </header>

      <dl className="specs mono">
        <div>
          <dt>Height</dt>
          <dd>
            <ULabel u={res.heightU} />
          </dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>{res.heightU > 1 ? `U${p.u}–U${top}` : `U${p.u}`}</dd>
        </div>
        <div>
          <dt>Depth</dt>
          <dd>
            <Len mm={res.depthMm} digits={0} />
          </dd>
        </div>
        <div>
          <dt>Weight</dt>
          <dd>{res.weightKg.toFixed(1)} kg</dd>
        </div>
        <div>
          <dt>Max power</dt>
          <dd>{Math.round(res.powerW)} W</dd>
        </div>
        <div>
          <dt>Width</dt>
          <dd>{item.configurable ? '—' : <Len mm={item.widthMm} digits={0} />}</dd>
        </div>
      </dl>
      {res.depthMm > rack.depthMm && (
        <p className="note note--warn">
          Deeper than the rack by <Len mm={res.depthMm - rack.depthMm} digits={0} />. It will stick out the
          back.
        </p>
      )}

      <div className="grid-2">
        <Field label="Move">
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => report(st().move(p.id, p.u + 1, p.side))}
              aria-label="Move up one unit"
            >
              ↑ Up
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => report(st().move(p.id, p.u - 1, p.side))}
              aria-label="Move down one unit"
            >
              ↓ Down
            </button>
          </div>
        </Field>
        <Field label="Mounted on">
          <Segmented
            full
            label="Side of the rack"
            value={p.side}
            onChange={(side) => report(st().move(p.id, p.u, side))}
            options={[
              { value: 'front', label: 'Front' },
              { value: 'rear', label: 'Rear' },
            ]}
          />
        </Field>
      </div>

      {cfg && <ConfigEditor p={p} cfg={cfg} maxCount={res.maxCount ?? 1} />}

      {layout && (
        <Field
          label="On this shelf"
          value={
            <span className="mono">
              <Len mm={Math.max(0, layout.usedMm)} digits={0} /> of <Len mm={layout.usableMm} digits={0} />
            </span>
          }
        >
          {(p.children ?? []).length === 0 ? (
            <p className="empty">Empty. Drag a mini PC, a small switch or a screen onto it.</p>
          ) : (
            <ul className="kids">
              {(p.children ?? []).map((c) => (
                <li key={c.id}>
                  <span className="kids__name">{getItem(c.itemId)?.name}</span>
                  <Segmented
                    label={`How ${getItem(c.itemId)?.name} is placed`}
                    value={c.orientation}
                    onChange={(o) => report(st().setChildOrientation(p.id, c.id, o))}
                    options={[
                      { value: 'flat', label: 'Flat' },
                      { value: 'upright', label: 'On its side' },
                    ]}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Add another ${getItem(c.itemId)?.name}`}
                    title="Add another one beside it"
                    onClick={() => report(st().addChild(p.id, c.itemId))}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${getItem(c.itemId)?.name}`}
                    onClick={() => st().removeChild(p.id, c.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {layout.warnings[0] && <p className="note note--warn">{layout.warnings[0].message}</p>}
        </Field>
      )}

      {hasModel(item.id) && look === 'real' && (
        <Switch
          id="cad-only"
          label="Show this one in CAD look"
          checked={!!p.cadOnly}
          onChange={(v) => st().setCadOnly(p.id, v)}
        />
      )}

      <p className="note">
        {item.verified ? 'Size checked against ' : 'Size not yet checked against the maker. Start from '}
        <a href={item.sourceUrl} target="_blank" rel="noreferrer">
          {new URL(item.sourceUrl).hostname.replace(/^www\./, '')}
        </a>
        .{item.note ? ` ${item.note}` : ''}
      </p>

      <div className="btn-row">
        <button type="button" className="btn" onClick={() => report(st().duplicate(p.id))}>
          Duplicate
        </button>
        <button type="button" className="btn btn--danger" onClick={() => removeWithUndo(p.id)}>
          Remove
        </button>
      </div>
    </div>
  )
}

function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 900px)').matches,
  )
  useEffect(() => {
    const m = matchMedia('(max-width: 900px)')
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

export function Inspector() {
  const p = useStore((s) => s.placements.find((x) => x.id === s.selectedId))
  const dragging = useStore((s) => !!s.drag)
  const narrow = useNarrow()
  if (narrow) {
    return (
      <Drawer.Root
        open={!!p && !dragging}
        onOpenChange={(o) => !o && useStore.getState().select(null)}
        modal={false}
      >
        <Drawer.Portal>
          <Drawer.Content className="drawer" aria-describedby={undefined}>
            <Drawer.Handle className="drawer__handle" />
            <Drawer.Title className="sr-only">Selected device</Drawer.Title>
            {p && <Body p={p} />}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }
  if (!p) return null
  return (
    <aside className="inspector" aria-label="Selected device">
      <Body p={p} />
    </aside>
  )
}
