import { useMemo } from 'react'
import { useStore } from '../state/store'
import { PRINTERS, advisePrint } from '../domain/printAdvisor'
import { Field, Len, Picker, ULabel } from './primitives'

export function PrintPanel() {
  const rack = useStore((s) => s.rack)
  const placements = useStore((s) => s.placements)
  const printerId = useStore((s) => s.printerId)
  const set = useStore((s) => s.set)
  const printer = PRINTERS.find((p) => p.id === printerId) ?? PRINTERS[0]!
  const a = useMemo(() => advisePrint(rack, placements, printer), [rack, placements, printer])
  const whole = PRINTERS.filter((p) => advisePrint(rack, [], p).rail.parts === 1).map((p) => p.name)

  return (
    <section className="panel-section panel-section--grow" aria-label="3D printing">
      <header className="panel-section__head">
        <h2>Print this rack</h2>
        <span className="mono dim">
          {rack.standard}" · <ULabel u={rack.heightU} />
        </span>
      </header>
      <Field
        label="Your printer"
        value={
          <span className="mono">
            {printer.x} × {printer.y} × {printer.z} mm
          </span>
        }
      >
        <Picker
          label="Printer"
          value={printer.id}
          onChange={(printerId) => set({ printerId })}
          options={PRINTERS.map((p) => ({ value: p.id, label: p.name, hint: `${p.x}×${p.y}` }))}
        />
      </Field>

      {printer.note && <p className="note">{printer.note}</p>}

      {a.warnings.map((w) => (
        <p key={w} className="note note--warn">
          {w}
        </p>
      ))}

      <h3>Parts</h3>
      <table className="table">
        <tbody>
          <tr>
            <th scope="row">4 upright rails</th>
            <td>
              <Len mm={a.rail.lengthMm} /> long, {a.rail.sectionMm} mm square
              <br />
              {a.rail.parts === 1 ? (
                <strong>
                  Prints in one piece{a.rail.orientation === 'diagonal' ? ', corner to corner' : ''}.
                </strong>
              ) : (
                <strong>
                  Split each into {a.rail.parts}: {a.rail.partUs.map((u) => `${u}U`).join(' + ')}
                  {a.rail.orientation === 'diagonal' ? ', each corner to corner' : ''}.
                </strong>
              )}
              <br />
              <span className="dim">
                Longest piece <Len mm={a.rail.longestPieceMm} />. Cuts sit between rack units, so no mounting
                hole is cut in half.
              </span>
            </td>
          </tr>
          <tr>
            <th scope="row">Top and bottom plate</th>
            <td>
              <Len mm={a.plate.widthMm} digits={0} /> × <Len mm={a.plate.depthMm} digits={0} />
              <br />
              <strong>
                {a.plate.parts === 1
                  ? 'Each prints in one piece.'
                  : `Each in ${a.plate.parts} tiles (${a.plate.tiles[0]} × ${a.plate.tiles[1]}), bolted along the seams.`}
              </strong>
            </td>
          </tr>
          <tr>
            <th scope="row">One-piece rails need</th>
            <td>
              a bed of at least <Len mm={a.minBedForOnePieceMm} digits={0} /> square.
              <br />
              <span className="dim">
                {whole.length
                  ? `Of the listed printers: ${whole.join(', ')}.`
                  : 'None of the listed printers is that big.'}
              </span>
            </td>
          </tr>
          <tr>
            <th scope="row">Filament</th>
            <td>
              about <strong className="mono">{a.filamentGrams} g</strong> of PETG ({a.spools} spool
              {a.spools === 1 ? '' : 's'})
              <br />
              <span className="dim">
                Frame only, at 4 walls and 25% infill. Brackets and shelves come on top.
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Hardware</h3>
      <table className="table table--hw">
        <tbody>
          {a.hardware.map((h) => (
            <tr key={h.id}>
              <td className="mono num">{h.qty}×</td>
              <td>
                {h.label}
                {h.note && <span className="dim block">{h.note}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {placements.length === 0 && (
        <p className="empty">Add equipment to the rack to count its mounting screws.</p>
      )}

      <h3>Before you print</h3>
      <ul className="tips">
        {a.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
        <li>
          10" racks built from 2020 aluminium extrusion often end up with 242 mm between screw centres instead
          of the standard 236.5 mm. Measure your design before you print panels for it.
        </li>
      </ul>
      <p className="note">
        These are estimates from the rack size, not a sliced model. Treat the numbers as a shopping guide.
      </p>
    </section>
  )
}
