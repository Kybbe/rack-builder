import { useMemo } from 'react'
import * as Toolbar from '@radix-ui/react-toolbar'
import * as Popover from '@radix-ui/react-popover'
import { useStore, type ViewPreset } from '../state/store'
import { budget } from '../domain/budget'
import { Len, Tip, ULabel } from './primitives'

const VIEWS: { id: ViewPreset; label: string }[] = [
  { id: 'iso', label: 'Iso' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'rear', label: 'Rear' },
  { id: 'top', label: 'Top' },
]

export function ViewToolbar() {
  const preset = useStore((s) => s.view.preset)
  const projection = useStore((s) => s.projection)
  const showDimensions = useStore((s) => s.showDimensions)
  const holeSnap = useStore((s) => s.holeSnap)
  const set = useStore((s) => s.set)
  const setView = useStore((s) => s.setView)
  return (
    <Toolbar.Root className="viewbar" aria-label="View">
      <Toolbar.ToggleGroup
        type="single"
        value={preset}
        aria-label="Camera"
        onValueChange={(v) => setView((v || preset) as ViewPreset)}
      >
        {VIEWS.map((v) => (
          <Toolbar.ToggleItem key={v.id} value={v.id} className="viewbar__btn">
            {v.label}
          </Toolbar.ToggleItem>
        ))}
      </Toolbar.ToggleGroup>
      <Toolbar.Separator className="viewbar__sep" />
      <Toolbar.Button
        className="viewbar__btn"
        data-state={projection === 'orthographic' ? 'on' : 'off'}
        aria-pressed={projection === 'orthographic'}
        onClick={() => set({ projection: projection === 'orthographic' ? 'perspective' : 'orthographic' })}
        title="Parallel projection, like a technical drawing"
      >
        Ortho
      </Toolbar.Button>
      <Toolbar.Button
        className="viewbar__btn"
        data-state={showDimensions ? 'on' : 'off'}
        aria-pressed={showDimensions}
        onClick={() => set({ showDimensions: !showDimensions })}
      >
        Dimensions
      </Toolbar.Button>
      <Toolbar.Button
        className="viewbar__btn"
        data-state={holeSnap ? 'on' : 'off'}
        aria-pressed={holeSnap}
        onClick={() => set({ holeSnap: !holeSnap })}
        title="Let devices land on any mounting hole (3 per unit) instead of whole units"
      >
        Any hole
      </Toolbar.Button>
    </Toolbar.Root>
  )
}

export function BudgetBar({ compact = false }: { compact?: boolean }) {
  const rack = useStore((s) => s.rack)
  const placements = useStore((s) => s.placements)
  const b = useMemo(() => budget(rack, placements), [rack, placements])
  const warnings = b.issues.filter(
    (i) => i.code === 'too-deep' || i.code === 'needs-adapter' || i.code === 'child-too-deep',
  )
  const pct = Math.round((b.usedU / rack.heightU) * 100)
  if (compact) {
    // No hover on a phone and little room: one line, and the rest behind a tap.
    return (
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="budget budget--compact mono"
            aria-label="Rack totals, tap for details"
          >
            <span className="budget__cell budget__cell--bar">
              <span>
                <b>{b.usedU}</b> of {rack.heightU}U used
              </span>
              <span className="meter" role="img" aria-label={`${pct}% of the rack is used`}>
                <span style={{ width: `${pct}%` }} />
              </span>
            </span>
            {warnings.length > 0 && (
              <span className="budget__cell budget__cell--warn">
                {warnings.length} warning{warnings.length === 1 ? '' : 's'}
              </span>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="popover totals"
            side="top"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            // Focus would land on the first length and pop its unit tooltip open over the numbers.
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <dl className="totals__list mono">
              <div>
                <dt>Free</dt>
                <dd>{b.freeU}U</dd>
              </div>
              <div>
                <dt>Weight</dt>
                <dd>{b.weightKg.toFixed(1)} kg</dd>
              </div>
              <div>
                <dt>Max power</dt>
                <dd>{Math.round(b.powerW)} W</dd>
              </div>
              <div>
                <dt>Deepest</dt>
                <dd>{b.deepestMm ? <Len mm={b.deepestMm} digits={0} /> : '—'}</dd>
              </div>
            </dl>
            <p className="note">
              Max power is each device's maximum draw added up. Real use is usually well below.
            </p>
            {warnings.length > 0 && (
              <ul className="tip__list note--warn">
                {warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    )
  }
  return (
    <footer className="budget mono" aria-label="Rack totals">
      <div className="budget__cell budget__cell--bar">
        <span>
          <b>{b.usedU}</b> of <ULabel u={rack.heightU} /> used
        </span>
        <span className="meter" role="img" aria-label={`${pct}% of the rack is used`}>
          <span style={{ width: `${pct}%` }} />
        </span>
        <span className="dim">{b.freeU}U free</span>
      </div>
      <div className="budget__cell">
        <span className="dim">Weight</span> <b>{b.weightKg.toFixed(1)} kg</b>
      </div>
      <div className="budget__cell">
        <Tip content="Sum of each device's maximum draw. Real use is usually well below this.">
          <span tabIndex={0}>
            <span className="dim">Max power</span> <b>{Math.round(b.powerW)} W</b>
          </span>
        </Tip>
      </div>
      <div className="budget__cell">
        <span className="dim">Deepest</span> <b>{b.deepestMm ? <Len mm={b.deepestMm} digits={0} /> : '—'}</b>
      </div>
      {warnings.length > 0 && (
        <Tip
          content={
            <ul className="tip__list">
              {warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          }
        >
          <div className="budget__cell budget__cell--warn" tabIndex={0}>
            {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </div>
        </Tip>
      )}
    </footer>
  )
}
