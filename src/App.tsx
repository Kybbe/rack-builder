import { useEffect } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { Toaster, toast } from 'sonner'
import { useStore, type Tab } from './state/store'
import { getItem } from './catalog'
import { Viewport } from './three/Viewport'
import { TopBar } from './ui/TopBar'
import { RackSettings } from './ui/RackSettings'
import { CatalogPanel } from './ui/CatalogPanel'
import { PlannerPanel } from './ui/PlannerPanel'
import { CablesPanel } from './ui/CablesPanel'
import { PrintPanel } from './ui/PrintPanel'
import { Inspector, removeWithUndo } from './ui/Inspector'
import { BudgetBar, ViewToolbar } from './ui/Overlays'
import { CommandPalette } from './ui/CommandPalette'
import { loadFromHash } from './ui/io'
import { report } from './ui/feedback'

function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea.Root className="scroll">
      <ScrollArea.Viewport className="scroll__view">{children}</ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="scroll__bar">
        <ScrollArea.Thumb className="scroll__thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}

function SceneMenu() {
  const selected = useStore((s) => s.placements.find((p) => p.id === s.selectedId))
  const st = useStore.getState
  const say = (r: Parameters<typeof report>[0]) => {
    report(r)
  }
  if (!selected) {
    return (
      <>
        <ContextMenu.Item className="menu__item" onSelect={() => st().setView('iso')}>
          Reset the view
        </ContextMenu.Item>
        <ContextMenu.Item
          className="menu__item"
          onSelect={() => say(st().addAuto(st().rack.standard === '19' ? 'shelf-1u-19' : 'shelf-1u-10'))}
        >
          Add a shelf
        </ContextMenu.Item>
        <ContextMenu.Item className="menu__item" onSelect={() => st().set({ paletteOpen: true })}>
          Add equipment…
        </ContextMenu.Item>
      </>
    )
  }
  const other = selected.side === 'front' ? 'rear' : 'front'
  return (
    <>
      <ContextMenu.Label className="menu__label">{getItem(selected.itemId)?.name}</ContextMenu.Label>
      <ContextMenu.Item
        className="menu__item"
        onSelect={() => say(st().move(selected.id, selected.u, other, selected.hole))}
      >
        Move to the {other}
      </ContextMenu.Item>
      <ContextMenu.Item className="menu__item" onSelect={() => say(st().duplicate(selected.id))}>
        Duplicate <span className="menu__hint">D</span>
      </ContextMenu.Item>
      <ContextMenu.Item className="menu__item" onSelect={() => st().copy(selected.id)}>
        Copy <span className="menu__hint">⌘C</span>
      </ContextMenu.Item>
      <ContextMenu.Separator className="menu__sep" />
      <ContextMenu.Item
        className="menu__item menu__item--danger"
        onSelect={() => removeWithUndo(selected.id)}
      >
        Remove <span className="menu__hint">Del</span>
      </ContextMenu.Item>
    </>
  )
}

/** The edge between the list and the 3D view: drag to resize, double-click or press Enter to collapse. */
function Resizer() {
  const width = useStore((s) => s.sideWidth)
  const collapsed = useStore((s) => s.sideCollapsed)
  const st = useStore.getState
  const toggle = () => st().set({ sideCollapsed: !st().sideCollapsed })
  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the equipment list"
      aria-valuenow={collapsed ? 0 : width}
      aria-valuemin={0}
      aria-valuemax={720}
      tabIndex={0}
      title="Drag to resize. Double-click to hide or show the list."
      onDoubleClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') st().setSideWidth(st().sideWidth - 24)
        else if (e.key === 'ArrowRight') st().setSideWidth(st().sideWidth + 24)
        else if (e.key === 'Enter' || e.key === ' ') toggle()
        else return
        e.preventDefault()
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        const el = e.currentTarget
        el.setPointerCapture(e.pointerId)
        const move = (ev: PointerEvent) => {
          // Pulled most of the way shut: hide it. Pulled back out: show it again.
          if (ev.clientX < 140) st().set({ sideCollapsed: true })
          else {
            if (st().sideCollapsed) st().set({ sideCollapsed: false })
            st().setSideWidth(ev.clientX)
          }
        }
        const up = () => {
          el.removeEventListener('pointermove', move)
          el.removeEventListener('pointerup', up)
          el.removeEventListener('pointercancel', up)
        }
        el.addEventListener('pointermove', move)
        el.addEventListener('pointerup', up)
        el.addEventListener('pointercancel', up)
      }}
    />
  )
}

export function App() {
  const tab = useStore((s) => s.tab)
  const sideWidth = useStore((s) => s.sideWidth)
  const sideCollapsed = useStore((s) => s.sideCollapsed)
  const theme = useStore((s) => s.theme)
  const set = useStore((s) => s.set)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    loadFromHash()
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      const st = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedCableId) {
        e.preventDefault()
        st.removeCable(st.selectedCableId)
        toast.success('Cable removed', { action: { label: 'Undo', onClick: () => st.undo() } })
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId) {
        e.preventDefault()
        removeWithUndo(st.selectedId)
      } else if (e.key === 'Escape') {
        st.select(null)
        st.selectCable(null)
        st.cancelCable()
      } else if (e.key.toLowerCase() === 'd' && !mod && !e.altKey && st.selectedId) {
        e.preventDefault()
        report(st.duplicate(st.selectedId))
      } else if (e.key.toLowerCase() === 'c' && mod && st.selectedId) {
        // Leave the browser's own copy alone while text is selected.
        if (window.getSelection()?.toString()) return
        e.preventDefault()
        if (st.copy(st.selectedId)) toast.message('Copied. Paste with ⌘V or Ctrl+V.')
      } else if (e.key.toLowerCase() === 'v' && mod) {
        if (!st.clipboard) return
        e.preventDefault()
        report(st.paste())
      } else if (e.key.toLowerCase() === 'z' && mod && !e.shiftKey) {
        e.preventDefault()
        if (!st.undo()) toast.message('Nothing to undo')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={400}>
      <Tabs.Root
        className="app"
        data-side={sideCollapsed ? 'collapsed' : 'open'}
        style={{ '--side-w': `${sideWidth}px` } as React.CSSProperties}
        value={tab}
        onValueChange={(v) => {
          useStore.getState().cancelCable()
          set({ tab: v as Tab, sideCollapsed: false })
        }}
      >
        <TopBar />
        <aside className="side">
          <Scroll>
            <Tabs.Content value="build" className="side__tab">
              <RackSettings />
              <CatalogPanel mode="build" />
            </Tabs.Content>
            <Tabs.Content value="cables" className="side__tab">
              <CablesPanel />
            </Tabs.Content>
            <Tabs.Content value="plan" className="side__tab">
              <PlannerPanel />
              <CatalogPanel mode="plan" />
            </Tabs.Content>
            <Tabs.Content value="print" className="side__tab">
              <PrintPanel />
            </Tabs.Content>
          </Scroll>
        </aside>
        <main className="stage">
          <Resizer />
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
              <div className="stage__canvas">
                <Viewport />
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className="menu">
                <SceneMenu />
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
          <ViewToolbar />
          <Inspector />
          <BudgetBar />
        </main>
      </Tabs.Root>
      <CommandPalette />
      <Toaster theme={theme} position="bottom-center" offset={56} toastOptions={{ className: 'toast' }} />
    </Tooltip.Provider>
  )
}
