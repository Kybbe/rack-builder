import { useMemo } from 'react'
import * as Toolbar from '@radix-ui/react-toolbar'
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
    </Toolbar.Root>
  )
}

export function BudgetBar() {
  const rack = useStore((s) => s.rack)
  const placements = useStore((s) => s.placements)
  const b = useMemo(() => budget(rack, placements), [rack, placements])
  const warnings = b.issues.filter(
    (i) => i.code === 'too-deep' || i.code === 'needs-adapter' || i.code === 'child-too-deep',
  )
  const pct = Math.round((b.usedU / rack.heightU) * 100)
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
