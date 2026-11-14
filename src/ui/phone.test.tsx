import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as Tabs from '@radix-ui/react-tabs'
import * as Tooltip from '@radix-ui/react-tooltip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { CatalogPanel } from './CatalogPanel'
import { BudgetBar } from './Overlays'
import { Tip } from './primitives'
import { TopBar } from './TopBar'
import { HOLD_MS } from './useHoldDrag'

const finger = (el: Element, type: string, x = 100, y = 100) =>
  fireEvent(
    el,
    new PointerEvent(type, { bubbles: true, pointerType: 'touch', button: 0, clientX: x, clientY: y }),
  )

beforeEach(() => {
  localStorage.clear()
  useStore.getState().reset()
  useStore.getState().setDrag(null)
})

describe('explanations that used to need hovering', () => {
  const tip = () => (
    <Tooltip.Provider>
      <Tip content="Size not yet checked against the maker">
        <span tabIndex={0}>unchecked</span>
      </Tip>
      <p>elsewhere</p>
    </Tooltip.Provider>
  )

  it('open when tapped with a finger and close when tapped again', async () => {
    const user = userEvent.setup()
    render(tip())
    const tag = screen.getByText('unchecked')
    await user.pointer({ keys: '[TouchA]', target: tag })
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Size not yet checked against the maker')
    await user.pointer({ keys: '[TouchA]', target: tag })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('do not pop open from a mouse click, which keeps meaning what it meant', async () => {
    render(tip())
    const tag = screen.getByText('unchecked')
    fireEvent(tag, new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))
    fireEvent.click(tag)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('the top bar on a phone', () => {
  const bar = (narrow: boolean) =>
    render(
      <Tabs.Root value="build">
        <TopBar narrow={narrow} />
      </Tabs.Root>,
    )

  it('keeps everything from the wide bar reachable through one menu', async () => {
    const user = userEvent.setup()
    bar(true)
    expect(screen.queryByRole('tab')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    for (const name of [
      /Undo/,
      'Export JSON',
      'Import JSON…',
      'Copy share link',
      'Reset everything…',
      'Credits',
    ])
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    for (const name of ['Millimetres', 'Inches', 'Realistic', 'CAD'])
      expect(screen.getByRole('menuitemradio', { name })).toBeInTheDocument()
  })

  it('switches units from that menu', async () => {
    const user = userEvent.setup()
    bar(true)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Inches' }))
    expect(useStore.getState().units).toBe('in')
  })

  it('is unchanged on a wide screen: tabs and unit switch in the bar', () => {
    bar(false)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Build',
      'Cables',
      'Plan',
      '3D print',
    ])
    expect(screen.getByRole('radio', { name: 'in' })).toBeInTheDocument()
  })
})

describe('rack totals on a phone', () => {
  it('show how full the rack is, and the rest after a tap', async () => {
    const user = userEvent.setup()
    useStore.getState().setRack({ standard: '19', heightU: 12, depthMm: 800 })
    expect(useStore.getState().addAuto('ubiquiti-udm-pro').ok).toBe(true)
    render(
      <Tooltip.Provider>
        <BudgetBar compact />
      </Tooltip.Provider>,
    )
    const strip = screen.getByRole('button', { name: /Rack totals/ })
    expect(strip).toHaveTextContent('1 of 12U used')
    expect(screen.queryByText('Weight')).toBeNull()
    await user.click(strip)
    expect(screen.getByText('Weight')).toBeInTheDocument()
    expect(screen.getByText('Max power')).toBeInTheDocument()
  })
})

describe('picking equipment up from the list with a finger', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const card = () => {
    render(
      <Tooltip.Provider>
        <CatalogPanel mode="build" />
      </Tooltip.Provider>,
    )
    return screen.getAllByRole('listitem')[0]!
  }
  const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

  it('picks the card up only after the finger has rested on it', () => {
    const el = card()
    finger(el, 'pointerdown')
    wait(HOLD_MS - 50)
    expect(useStore.getState().drag).toBeNull()
    wait(60)
    expect(useStore.getState().drag).toMatchObject({ held: true })
  })

  it('leaves a swipe to scroll the list', () => {
    const el = card()
    finger(el, 'pointerdown', 100, 100)
    finger(el, 'pointermove', 100, 140)
    wait(HOLD_MS * 2)
    expect(useStore.getState().drag).toBeNull()
  })

  it('does nothing on a quick tap', () => {
    const el = card()
    finger(el, 'pointerdown')
    finger(el, 'pointerup')
    wait(HOLD_MS * 2)
    expect(useStore.getState().drag).toBeNull()
  })

  it('is not how a mouse drags: that still uses the browser drag', () => {
    const el = card()
    fireEvent(el, new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))
    wait(HOLD_MS * 2)
    expect(useStore.getState().drag).toBeNull()
  })
})
