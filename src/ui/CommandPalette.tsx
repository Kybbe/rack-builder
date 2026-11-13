import { useEffect } from 'react'
import { Command } from 'cmdk'
import { toast } from 'sonner'
import { useStore, type ViewPreset } from '../state/store'
import { CATALOG, CATEGORIES } from '../catalog'
import { report } from './feedback'
import { copyShareLink, exportLayout, importLayoutFile } from './io'

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen)
  const set = useStore((s) => s.set)
  const close = () => set({ paletteOpen: false })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        set({ paletteOpen: !useStore.getState().paletteOpen })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [set])

  const run = (fn: () => void) => () => {
    close()
    fn()
  }
  const add = (id: string, name: string) =>
    run(() => {
      const st = useStore.getState()
      if (st.tab === 'plan') {
        st.want(id, 1)
        toast.success(`${name} added to the list`)
        return
      }
      if (report(st.addAuto(id), { itemId: id })) toast.success(`${name} added`)
    })

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => set({ paletteOpen: o })}
      label="Search equipment and actions"
      className="palette"
      overlayClassName="overlay"
    >
      <Command.Input placeholder="Add equipment or run an action…" className="palette__input" />
      <Command.List className="palette__list">
        <Command.Empty className="palette__empty">Nothing found.</Command.Empty>
        <Command.Group heading="View">
          {(['iso', 'front', 'side', 'rear', 'top'] as ViewPreset[]).map((v) => (
            <Command.Item key={v} value={`view ${v}`} onSelect={run(() => useStore.getState().setView(v))}>
              Look from the {v === 'iso' ? 'corner' : v}
            </Command.Item>
          ))}
          <Command.Item
            value="toggle cad realistic look"
            onSelect={run(() => set({ look: useStore.getState().look === 'cad' ? 'real' : 'cad' }))}
          >
            Switch between CAD and realistic look
          </Command.Item>
          <Command.Item
            value="units mm inches"
            onSelect={run(() => set({ units: useStore.getState().units === 'mm' ? 'in' : 'mm' }))}
          >
            Switch between millimetres and inches
          </Command.Item>
        </Command.Group>
        <Command.Group heading="File">
          <Command.Item value="copy share link" onSelect={run(() => void copyShareLink())}>
            Copy share link
          </Command.Item>
          <Command.Item value="export json" onSelect={run(exportLayout)}>
            Export JSON
          </Command.Item>
          <Command.Item value="import json" onSelect={run(importLayoutFile)}>
            Import JSON…
          </Command.Item>
          <Command.Item
            value="undo"
            onSelect={run(() => {
              if (!useStore.getState().undo()) toast.message('Nothing to undo')
            })}
          >
            Undo
          </Command.Item>
        </Command.Group>
        {CATEGORIES.map((c) => (
          <Command.Group key={c.id} heading={`Add: ${c.label}`}>
            {CATALOG.filter((i) => i.category === c.id).map((i) => (
              <Command.Item key={i.id} value={`${i.name} ${i.brand}`} onSelect={add(i.id, i.name)}>
                <span>{i.name}</span>
                <span className="menu__hint">
                  {i.mount === 'rail' ? (i.configurable ? 'configurable' : `${i.heightU}U`) : 'shelf'}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  )
}
