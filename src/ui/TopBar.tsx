import * as Tabs from '@radix-ui/react-tabs'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Dialog from '@radix-ui/react-dialog'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { useState } from 'react'
import { toast } from 'sonner'
import { useStore } from '../state/store'
import { copyShareLink, exportLayout, importLayoutFile } from './io'
import { Segmented } from './primitives'
import models from '../catalog/models.json'

interface ModelCredit {
  itemId: string
  title: string
  author: string
  licence: string
  sourceUrl: string
}

export function TopBar() {
  const units = useStore((s) => s.units)
  const look = useStore((s) => s.look)
  const theme = useStore((s) => s.theme)
  const set = useStore((s) => s.set)
  const collapsed = useStore((s) => s.sideCollapsed)
  const [credits, setCredits] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const list = models as ModelCredit[]

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn panel-toggle"
        aria-pressed={!collapsed}
        aria-label={collapsed ? 'Show the equipment list' : 'Hide the equipment list'}
        title={collapsed ? 'Show the list' : 'Hide the list'}
        onClick={() => set({ sideCollapsed: !collapsed })}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <rect x="1.5" y="2.5" width="13" height="11" fill="none" stroke="currentColor" />
          <path d="M6 2.5v11" stroke="currentColor" />
          {!collapsed && <rect x="2" y="3" width="4" height="10" fill="currentColor" opacity="0.45" />}
        </svg>
      </button>
      <h1 className="brand">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
          <path
            d="M2.5 1.5v13M13.5 1.5v13M2.5 3.5h11M2.5 6.5h11M2.5 9.5h11M2.5 12.5h11"
            fill="none"
            stroke="currentColor"
          />
        </svg>
        Rack Builder
      </h1>
      <Tabs.List className="tabs" aria-label="Mode">
        <Tabs.Trigger value="build" className="tabs__tab">
          Build
        </Tabs.Trigger>
        <Tabs.Trigger value="cables" className="tabs__tab">
          Cables
        </Tabs.Trigger>
        <Tabs.Trigger value="plan" className="tabs__tab">
          Plan
        </Tabs.Trigger>
        <Tabs.Trigger value="print" className="tabs__tab">
          3D print
        </Tabs.Trigger>
      </Tabs.List>
      <div className="topbar__spacer" />
      <Segmented
        label="Units"
        value={units}
        onChange={(units) => set({ units })}
        options={[
          { value: 'mm', label: 'mm' },
          { value: 'in', label: 'in' },
        ]}
      />
      <Segmented
        label="Look"
        value={look}
        onChange={(look) => set({ look })}
        options={[
          { value: 'real', label: 'Realistic', title: 'Device colours and 3D models where available' },
          { value: 'cad', label: 'CAD', title: 'Plain line drawing look for everything' },
        ]}
      />
      <button type="button" className="btn btn--ghost kbd-btn" onClick={() => set({ paletteOpen: true })}>
        Search <kbd>⌘K</kbd>
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="btn">File ▾</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu" align="end" sideOffset={4}>
            <DropdownMenu.Item className="menu__item" onSelect={() => void copyShareLink()}>
              Copy share link
            </DropdownMenu.Item>
            <DropdownMenu.Item className="menu__item" onSelect={exportLayout}>
              Export JSON
            </DropdownMenu.Item>
            <DropdownMenu.Item className="menu__item" onSelect={importLayoutFile}>
              Import JSON…
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu__sep" />
            <DropdownMenu.Item
              className="menu__item"
              onSelect={() => {
                if (!useStore.getState().undo()) toast.message('Nothing to undo')
              }}
            >
              Undo <span className="menu__hint">⌘Z</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="menu__item"
              onSelect={() => {
                useStore.getState().clear()
                toast('Rack emptied', {
                  action: { label: 'Undo', onClick: () => useStore.getState().undo() },
                })
              }}
            >
              Empty the rack
            </DropdownMenu.Item>
            <DropdownMenu.Item className="menu__item menu__item--danger" onSelect={() => setResetOpen(true)}>
              Reset everything…
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu__sep" />
            <DropdownMenu.Item
              className="menu__item"
              onSelect={() => set({ theme: theme === 'dark' ? 'light' : 'dark' })}
            >
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </DropdownMenu.Item>
            <DropdownMenu.Item className="menu__item" onSelect={() => setCredits(true)}>
              Credits
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <AlertDialog.Root open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="overlay" />
          <AlertDialog.Content className="dialog">
            <AlertDialog.Title>Reset everything?</AlertDialog.Title>
            <AlertDialog.Description>
              This removes all equipment and cables and puts the rack back to the 10" 8U starting size. You
              can still undo it with ⌘Z until you reload the page.
            </AlertDialog.Description>
            <div className="btn-row">
              <AlertDialog.Cancel className="btn">Keep my rack</AlertDialog.Cancel>
              <AlertDialog.Action
                className="btn btn--danger"
                onClick={() => {
                  useStore.getState().reset()
                  toast('Everything reset', {
                    action: { label: 'Undo', onClick: () => useStore.getState().undo() },
                  })
                }}
              >
                Reset
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <Dialog.Root open={credits} onOpenChange={setCredits}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Credits</Dialog.Title>
            <p>
              Device photos in the realistic look come from the{' '}
              <a
                href="https://github.com/netbox-community/devicetype-library"
                target="_blank"
                rel="noreferrer"
              >
                NetBox device-type library
              </a>{' '}
              (CC0). Product names and logos belong to their makers.
            </p>
            {list.length === 0 ? (
              <Dialog.Description>
                No third-party 3D models are bundled yet. Every device is drawn from its catalog dimensions.
                To add one, put a .glb file in <code>public/models</code> and list it in{' '}
                <code>src/catalog/models.json</code>.
              </Dialog.Description>
            ) : (
              <>
                <Dialog.Description>
                  Models used in the realistic look, with their licences.
                </Dialog.Description>
                <ul className="credits">
                  {list.map((m) => (
                    <li key={m.itemId}>
                      <a href={m.sourceUrl} target="_blank" rel="noreferrer">
                        {m.title}
                      </a>{' '}
                      by {m.author} · {m.licence}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Dialog.Close className="btn">Close</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  )
}
