import { useMemo } from 'react'
import { toast } from 'sonner'
import { useStore } from '../state/store'
import {
  CABLE_NAME,
  STOCK_LENGTHS,
  WALL,
  cableLengthText,
  cableReport,
  portsOf,
  type CableRow,
} from '../domain/cables'
import { Field, Picker, Segmented } from './primitives'

const AUTO = 'auto'

function Row({ row }: { row: CableRow }) {
  const units = useStore((s) => s.units)
  const selected = useStore((s) => s.selectedCableId === row.cable.id)
  const text = (mm: number) => cableLengthText(mm, units)
  const end = (p: CableRow['to']) => (p === WALL ? 'Wall socket' : `${p.device} · ${p.label}`)
  return (
    <li className="cable" data-selected={selected ? '' : undefined} data-status={row.status}>
      <button
        type="button"
        className="cable__ends"
        onClick={() => {
          const st = useStore.getState()
          st.selectCable(row.cable.id)
        }}
      >
        <i className="cable__swatch" data-kind={row.kind} aria-hidden />
        <span>
          {end(row.from)}
          <span className="dim"> → </span>
          {end(row.to)}
        </span>
      </button>
      <div className="cable__meta">
        <span className="mono dim">
          {row.status === 'too-short' ? (
            <strong className="note--bad">too short, needs {text(row.requiredMm)}</strong>
          ) : row.status === 'no-stock' ? (
            <strong className="note--bad">needs {text(row.requiredMm)}: no stock length is that long</strong>
          ) : (
            <>needs {text(row.requiredMm)}</>
          )}
        </span>
        <Picker
          label={`Length of the cable from ${end(row.from)}`}
          value={row.cable.lengthMm === undefined ? AUTO : String(row.cable.lengthMm)}
          onChange={(v) =>
            useStore.getState().setCableLength(row.cable.id, v === AUTO ? undefined : Number(v))
          }
          options={[
            { value: AUTO, label: row.suggestedMm ? `Auto · ${text(row.suggestedMm)}` : 'Auto' },
            ...STOCK_LENGTHS[row.kind].map((l) => ({
              value: String(l),
              label: text(l),
              ...(l < row.requiredMm ? { hint: 'too short' } : {}),
            })),
          ]}
        />
        <label
          className="cable__have"
          title="Tick the cables you already have. The rest go on the list to buy."
        >
          <input
            type="checkbox"
            checked={row.have}
            onChange={(e) => useStore.getState().updateCable(row.cable.id, { have: e.target.checked })}
          />
          have
        </label>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Unplug the cable from ${end(row.from)}`}
          onClick={() => {
            useStore.getState().removeCable(row.cable.id)
            toast.success('Cable removed', {
              action: { label: 'Undo', onClick: () => useStore.getState().undo() },
            })
          }}
        >
          ×
        </button>
      </div>
    </li>
  )
}

/** The half-made cable: where it starts, and how to finish or drop it. Also shown on the phone sheet. */
export function CablePending() {
  const rack = useStore((s) => s.rack)
  const placements = useStore((s) => s.placements)
  const pending = useStore((s) => s.pendingPort)
  const from = useMemo(
    () => (pending ? portsOf(rack, placements).find((p) => p.id === pending) : undefined),
    [pending, rack, placements],
  )
  if (!from) return null
  return (
    <div className="cable-pending" role="status">
      <span>
        Cable from <strong>{from.device}</strong> · {from.label}. Pick the other end.
      </span>
      <span className="btn-row">
        {from.kind === 'inlet' && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              const r = useStore.getState().clickPort(WALL)
              if (!r.ok) toast.error(r.error)
            }}
          >
            To the wall socket
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => useStore.getState().cancelCable()}>
          Cancel
        </button>
      </span>
    </div>
  )
}

export function CablesPanel() {
  const rack = useStore((s) => s.rack)
  const placements = useStore((s) => s.placements)
  const cables = useStore((s) => s.cables)
  const pending = useStore((s) => s.pendingPort)
  const units = useStore((s) => s.units)
  const setView = useStore((s) => s.setView)
  const routing = useStore((s) => s.cableRouting)
  const report = useMemo(
    () => cableReport(rack, placements, cables, { routing }),
    [rack, placements, cables, routing],
  )
  const owned = report.rows.filter((r) => r.have).length
  const from = useMemo(
    () => (pending ? portsOf(rack, placements).find((p) => p.id === pending) : undefined),
    [pending, rack, placements],
  )

  return (
    <>
      <section className="panel-section">
        <div className="panel-section__head">
          <h2>Cables</h2>
          <span className="btn-row">
            <button type="button" className="link" onClick={() => setView('front')}>
              Front
            </button>
            <button type="button" className="link" onClick={() => setView('rear')}>
              Rear
            </button>
          </span>
        </div>
        <p className="note">
          Pick a port in the rack, then the port it plugs into. Switch and patch panel ports are on the front.
          Power inlets and the LAN ports of servers and mini PCs are on the back.
        </p>
        <Field label="Long cables run">
          <Segmented
            full
            label="How long cables run"
            value={routing}
            onChange={(cableRouting) => useStore.getState().set({ cableRouting })}
            options={[
              {
                value: 'direct',
                label: 'Straight across',
                title: 'The shortest way in front of the equipment',
              },
              {
                value: 'post',
                label: 'Along the posts',
                title:
                  'Sideways to the nearer post, along it, and back in. Neighbouring units stay straight.',
              },
            ]}
          />
        </Field>
        {from ? (
          <CablePending />
        ) : (
          placements.length === 0 && <p className="empty">Put equipment in the rack first.</p>
        )}
      </section>

      <section className="panel-section">
        <h3>Plugged in ({report.rows.length})</h3>
        {report.rows.length === 0 ? (
          <p className="empty">No cables yet.</p>
        ) : (
          <ul className="cables">
            {report.rows.map((r) => (
              <Row key={r.cable.id} row={r} />
            ))}
          </ul>
        )}
      </section>

      {report.rows.length > 0 && report.shopping.length === 0 && (
        <section className="panel-section">
          <h3>To buy</h3>
          <p className="empty">Nothing: you have every cable that is plugged in.</p>
        </section>
      )}
      {report.shopping.length > 0 && (
        <section className="panel-section">
          <h3>To buy</h3>
          <table className="table table--hw">
            <tbody>
              {report.shopping.map((s) => (
                <tr key={`${s.kind}${s.lengthMm}`}>
                  <td className="mono num">{s.count}×</td>
                  <td>
                    <span className="mono">{cableLengthText(s.lengthMm, units)}</span>{' '}
                    {CABLE_NAME[s.kind].toLowerCase()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">
            Lengths are the run along the rack plus 10% slack and 40 mm for each plug, rounded up to a length
            that is sold. A cable to the wall socket counts 1 m from the rack to the socket.
            {owned > 0 &&
              ` ${owned} cable${owned === 1 ? ' is' : 's are'} marked as already yours: power cables are assumed to come with the device.`}
          </p>
        </section>
      )}

      {report.unpowered.length > 0 && (
        <section className="panel-section">
          <h3>No power cable yet ({report.unpowered.length})</h3>
          <ul className="cables">
            {report.unpowered.map((u) => (
              <li key={u.portId} className="cable cable--todo">
                <span>{u.device}</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    const st = useStore.getState()
                    st.cancelCable()
                    const r = st.clickPort(u.portId)
                    if (!r.ok) return void toast.error(r.error)
                    const p = portsOf(st.rack, st.placements).find((x) => x.id === u.portId)
                    if (p) st.setView(p.facing)
                  }}
                >
                  Start cable
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
