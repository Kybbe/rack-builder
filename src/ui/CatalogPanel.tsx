import { useMemo, useState } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { CATALOG, CATEGORIES } from '../catalog'
import type { CatalogItem } from '../domain/types'
import { useHoldDrag } from './useHoldDrag'
import { narrowNow } from './useNarrow'
import { useStore } from '../state/store'
import { hasModel } from '../three/Device'
import { Len, Tip, ULabel } from './primitives'
import { report } from './feedback'
import { ItemPreview } from './ItemPreview'

/** Rack heights fall into five colour steps: 1U, 2U, 3U, 4U and everything taller. */
export const uStep = (u: number) => Math.min(5, Math.max(1, Math.round(u)))

/** What a card says about size. Gear with rack ears has its width and height set by the rack, so only depth is told. */
function Meta({ item }: { item: CatalogItem }) {
  const load = (
    <>
      <span>{item.weightKg} kg</span>
      {item.powerW > 0 && <span>{item.powerW} W max</span>}
    </>
  )
  if (item.configurable)
    return (
      <span className="card__meta mono">
        <span>size by choice</span>
        <span>{item.note}</span>
      </span>
    )
  if (item.mount === 'rail')
    return (
      <span className="card__meta mono">
        <span>{item.standard === 'both' ? '10" / 19"' : `${item.standard}"`}</span>
        {item.depthMm > 5 && (
          <span>
            <Len mm={item.depthMm} digits={0} /> deep
          </span>
        )}
        {load}
      </span>
    )
  return (
    <span className="card__meta mono">
      <span>
        <Len mm={item.widthMm} digits={0} /> × <Len mm={item.heightMm} digits={0} /> ×{' '}
        <Len mm={item.depthMm} digits={0} />
      </span>
      {load}
    </span>
  )
}

/** The corner of a card: how many units it takes, or that it needs a shelf to stand on. */
function Corner({ item }: { item: CatalogItem }) {
  if (item.mount === 'shelf')
    return (
      <Tip content="A loose device: it stands on a shelf, not on the rails">
        <span className="tag tag--shelf card__corner" tabIndex={0}>
          shelf
        </span>
      </Tip>
    )
  if (item.configurable || !item.heightU) return null
  return <ULabel u={item.heightU} className="tag card__corner" step={uStep(item.heightU)} />
}

function Card({ item, mode }: { item: CatalogItem; mode: 'build' | 'plan' }) {
  const rackStd = useStore((s) => s.rack.standard)
  const planStd = useStore((s) => s.planStandard)
  const wantedQty = useStore((s) => s.wanted.find((w) => w.itemId === item.id)?.qty ?? 0)
  const std = mode === 'build' ? rackStd : planStd
  const previews = useStore((s) => s.showPreviews)
  const blocked = item.mount === 'rail' && item.standard === '19' && std === '10'
  const act = () => {
    const st = useStore.getState()
    if (mode === 'plan') {
      st.want(item.id, 1)
      return
    }
    const added = report(st.addAuto(item.id), { itemId: item.id })
    // On a phone the selection takes over the sheet; adding several things in a row must keep the list.
    if (added && narrowNow()) useStore.getState().select(null)
  }
  const hold = useHoldDrag<HTMLLIElement>(
    () => useStore.getState().setDrag({ itemId: item.id, held: true }),
    mode === 'build' && !blocked,
  )
  return (
    <li
      className="card"
      data-blocked={blocked ? '' : undefined}
      {...hold}
      draggable={mode === 'build' && !blocked}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id)
        e.dataTransfer.effectAllowed = 'copy'
        useStore.getState().setDrag({ itemId: item.id })
      }}
      onDragEnd={() => useStore.getState().setDrag(null)}
      onDoubleClick={() => !blocked && act()}
    >
      <span className="card__swatch" style={{ background: item.color ?? '#2a2c30' }} aria-hidden />
      <span className="card__body">
        <Corner item={item} />
        <span className="card__name">
          {item.name}
          {hasModel(item.id) && (
            <Tip content="Has a real 3D model">
              <span className="tag">3D</span>
            </Tip>
          )}
          {!item.verified && item.brand !== 'Generic' && (
            <Tip content="Size not yet checked against the maker's own page. Measure before you buy.">
              <span className="tag tag--warn" tabIndex={0}>
                unchecked
              </span>
            </Tip>
          )}
        </span>
        {blocked ? (
          <span className="card__meta">19" only: does not fit a 10" rack</span>
        ) : (
          <Meta item={item} />
        )}
        {previews && (
          <span className="card__pv">
            <ItemPreview item={item} standard={std} />
          </span>
        )}
      </span>
      {mode === 'plan' && wantedQty > 0 && <span className="card__qty mono">{wantedQty}</span>}
      <button
        type="button"
        className="card__add"
        disabled={blocked}
        onClick={act}
        aria-label={mode === 'plan' ? `Add ${item.name} to the list` : `Add ${item.name} to the rack`}
      >
        +
      </button>
    </li>
  )
}

export function CatalogPanel({ mode }: { mode: 'build' | 'plan' }) {
  const [query, setQuery] = useState('')
  const std = useStore((s) => (mode === 'build' ? s.rack.standard : s.planStandard))
  // What fits the chosen rack width comes first; the rest stays visible but greyed out.
  const fits = (i: CatalogItem) => !(i.mount === 'rail' && i.standard === '19' && std === '10')
  const q = query.trim().toLowerCase()
  const groups = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        ...c,
        items: CATALOG.filter(
          (i) => i.category === c.id && (!q || `${i.name} ${i.brand} ${i.id}`.toLowerCase().includes(q)),
        ).sort((a, b) => Number(fits(b)) - Number(fits(a))),
      })).filter((g) => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, std],
  )
  const [open, setOpen] = useState<string[]>(['networking'])
  const previews = useStore((s) => s.showPreviews)
  return (
    <section className="panel-section panel-section--grow" aria-label="Equipment">
      <header className="panel-section__head">
        <h2>Equipment</h2>
        <button
          type="button"
          className="link"
          aria-pressed={previews}
          onClick={() => useStore.getState().set({ showPreviews: !previews })}
        >
          {previews ? 'Hide previews' : 'Show previews'}
        </button>
      </header>
      <input
        className="search"
        type="search"
        placeholder={mode === 'build' ? 'Search, then drag into the rack' : 'Search, then add with +'}
        aria-label="Search equipment"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {groups.length === 0 && <p className="empty">Nothing matches “{query}”.</p>}
      <Accordion.Root
        type="multiple"
        className="acc"
        value={q ? groups.map((g) => g.id) : open}
        onValueChange={(v) => !q && setOpen(v)}
      >
        {groups.map((g) => (
          <Accordion.Item key={g.id} value={g.id} className="acc__item">
            <Accordion.Header className="acc__header">
              <Accordion.Trigger className="acc__trigger">
                <span>{g.label}</span>
                <span className="mono dim">{g.items.length}</span>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="acc__content">
              <ul className="cards">
                {g.items.map((i) => (
                  <Card key={i.id} item={i} mode={mode} />
                ))}
              </ul>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  )
}
