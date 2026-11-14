import { describe, expect, it } from 'vitest'
import { sheetView, stepSheet, type SheetEvent, type SheetState } from './sheetRules'

const run = (events: SheetEvent[], from: SheetState = { snap: 'peek' }) => events.reduce(stepSheet, from)

describe('what the phone sheet shows', () => {
  it('shows the equipment panel when nothing is going on', () => {
    expect(sheetView({ selected: false, pendingCable: false })).toBe('panel')
  })
  it('shows the selected device or cable instead of the panel', () => {
    expect(sheetView({ selected: true, pendingCable: false })).toBe('inspector')
    expect(sheetView({ selected: true, pendingCable: true })).toBe('inspector')
  })
  it('asks for the other end while a cable has only one end', () => {
    expect(sheetView({ selected: false, pendingCable: true })).toBe('cable-prompt')
  })
})

describe('how tall the phone sheet is', () => {
  it('opens to half when a device is selected while it was only peeking', () => {
    expect(run([{ type: 'select' }]).snap).toBe('half')
  })
  it('goes back to the height it had once the selection is cleared', () => {
    expect(run([{ type: 'select' }, { type: 'deselect' }]).snap).toBe('peek')
    expect(run([{ type: 'select' }, { type: 'deselect' }], { snap: 'full' }).snap).toBe('full')
  })
  it('keeps a height the user chose while something was selected', () => {
    const s = run([{ type: 'select' }, { type: 'user', snap: 'full' }, { type: 'deselect' }])
    expect(s.snap).toBe('full')
  })
  it('does not shrink a sheet that is already open when something is selected', () => {
    expect(run([{ type: 'select' }], { snap: 'full' }).snap).toBe('full')
  })
  it('gets out of the way while equipment is dragged out of the list, then comes back', () => {
    const during = run([{ type: 'busy' }], { snap: 'full' })
    expect(during.snap).toBe('peek')
    expect(stepSheet(during, { type: 'idle' }).snap).toBe('full')
  })
  it('gets out of the way while a cable waits for its other end, then comes back', () => {
    const s = run([{ type: 'busy' }, { type: 'idle' }], { snap: 'half' })
    expect(s.snap).toBe('half')
  })
  it('stays down after a drag if the user had it down already', () => {
    expect(run([{ type: 'busy' }, { type: 'idle' }]).snap).toBe('peek')
  })
  it('selecting what was just dropped opens the inspector, not the old list height', () => {
    // Drop from a full-height list selects the new device: the rack should stay visible.
    const s = run([{ type: 'busy' }, { type: 'select' }, { type: 'idle' }], { snap: 'full' })
    expect(s.snap).toBe('half')
  })
  it('opens to half when a tab is picked while peeking, and leaves an open sheet alone', () => {
    expect(run([{ type: 'tab' }]).snap).toBe('half')
    expect(run([{ type: 'tab' }], { snap: 'full' }).snap).toBe('full')
  })
  it('a second idle or deselect changes nothing', () => {
    expect(run([{ type: 'idle' }, { type: 'deselect' }], { snap: 'half' })).toEqual({ snap: 'half' })
  })
})
