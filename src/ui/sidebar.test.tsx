import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as Tabs from '@radix-ui/react-tabs'
import * as Tooltip from '@radix-ui/react-tooltip'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { CatalogPanel, uStep } from './CatalogPanel'
import { Panels } from './Panels'
import { TopBar } from './TopBar'

beforeEach(() => {
  localStorage.clear()
  useStore.getState().reset()
  useStore.getState().set({ units: 'mm', tab: 'build' })
})

const app = (narrow = false) =>
  render(
    <Tooltip.Provider>
      <Tabs.Root value="build">
        <TopBar narrow={narrow} />
        <Panels />
      </Tabs.Root>
    </Tooltip.Provider>,
  )

describe('choosing the rack', () => {
  it('is the first thing in the list for a new visitor, and leaves the list once the rack is chosen', async () => {
    const user = userEvent.setup()
    app()
    const setup = screen.getByRole('region', { name: 'Choose your rack' })
    await user.click(within(setup).getByRole('radio', { name: '19"' }))
    expect(useStore.getState().rack.standard).toBe('19')
    await user.click(within(setup).getByRole('button', { name: 'Use this rack' }))
    expect(screen.queryByRole('region', { name: 'Choose your rack' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Equipment' })).toBeInTheDocument()
  })

  it('leaves the list by itself when the first device goes in', () => {
    useStore.getState().addAuto('patch-panel-12-10')
    app()
    expect(screen.queryByRole('region', { name: 'Choose your rack' })).toBeNull()
  })

  it('stays reachable from the top bar, which always says what the rack is', async () => {
    const user = userEvent.setup()
    useStore.getState().set({ rackChosen: true })
    app()
    const chip = screen.getByRole('button', { name: /^Rack/ })
    expect(chip).toHaveTextContent('10" · 8U · 260 mm')
    expect(screen.queryByRole('radio', { name: '19"' })).toBeNull()
    await user.click(chip)
    await user.click(screen.getByRole('radio', { name: '19"' }))
    expect(useStore.getState().rack.standard).toBe('19')
    expect(chip).toHaveTextContent('19" · 9U · 600 mm')
  })

  it('is in the top bar on a phone too, without the depth to save room', () => {
    useStore.getState().set({ rackChosen: true })
    app(true)
    const chip = screen.getByRole('button', { name: /^Rack/ })
    expect(chip).toHaveTextContent('10" · 8U')
    expect(chip).not.toHaveTextContent('260')
  })
})

describe('equipment cards', () => {
  /** Search the list like a person would and return the card with that name. */
  const card = async (search: string, name: string) => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <CatalogPanel mode="plan" />
      </Tooltip.Provider>,
    )
    await user.type(screen.getByRole('searchbox', { name: 'Search equipment' }), search)
    return screen.getByText(name).closest('li') as HTMLElement
  }

  it('a rack-mount server shows its height as a tag and only its depth: width and height follow from the rack', async () => {
    useStore.getState().set({ planStandard: '19' })
    const el = await card('R640', 'Dell PowerEdge R640')
    expect(within(el).getByText('1U')).toHaveAttribute('data-u', '1')
    expect(el).toHaveTextContent('795 mm deep')
    expect(el).not.toHaveTextContent('434')
    expect(el).not.toHaveTextContent('×')
    expect(within(el).queryByText('shelf')).toBeNull()
  })

  it('a loose device is tagged as needing a shelf and keeps all three sizes, which decide where it fits', async () => {
    const el = await card('NUC 13', 'Intel NUC 13 Pro (tall)')
    expect(within(el).getByText('shelf')).toBeInTheDocument()
    expect(el).toHaveTextContent('117 mm × 54 mm × 112 mm')
    expect(el.querySelector('[data-u]')).toBeNull()
  })

  it('taller gear gets its own tag colour step', async () => {
    useStore.getState().set({ planStandard: '19' })
    const el = await card('R740', 'Dell PowerEdge R740')
    expect(within(el).getByText('2U')).toHaveAttribute('data-u', '2')
  })

  it('a part whose height is a choice is not given a fixed height tag', async () => {
    const el = await card('Fan panel', 'Fan panel, blowing in or out')
    expect(el.querySelector('[data-u]')).toBeNull()
    expect(el).toHaveTextContent('size by choice')
  })

  it('heights fall into five colour steps: 1U, 2U, 3U, 4U and everything taller', () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(uStep)).toEqual([1, 2, 3, 4, 5, 5, 5])
  })
})
