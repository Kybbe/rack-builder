import { toast } from 'sonner'
import { useStore } from '../state/store'
import { fromShareHash, parseLayout, serializeLayout, toShareHash } from '../domain/serialization'

const HASH_KEY = '#r='

export function exportLayout() {
  const { rack, placements } = useStore.getState()
  const blob = new Blob([serializeLayout({ rack, placements })], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `rack-${rack.standard}in-${rack.heightU}u.json`
  a.click()
  URL.revokeObjectURL(a.href)
  toast.success('Rack exported')
}

function undoToast(message: string) {
  toast.success(message, { action: { label: 'Undo', onClick: () => useStore.getState().undo() } })
}

export function importLayoutText(text: string) {
  const r = parseLayout(text)
  if (!r.ok) {
    toast.error('Import refused. Your rack is unchanged.', { description: r.error })
    return false
  }
  useStore.getState().load(r.layout)
  undoToast('Rack imported')
  return true
}

export function importLayoutFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (file) importLayoutText(await file.text())
  }
  input.click()
}

export async function copyShareLink() {
  const { rack, placements } = useStore.getState()
  const url = `${location.origin}${location.pathname}${HASH_KEY}${toShareHash({ rack, placements })}`
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link copied', { description: 'Anyone with the link opens this rack.' })
  } catch {
    toast.message('Copy this link', { description: url, duration: 20000 })
  }
}

/** Opens a rack from a share link, once, and removes the link from the address bar. */
export function loadFromHash() {
  if (!location.hash.startsWith(HASH_KEY)) return
  const r = fromShareHash(location.hash.slice(HASH_KEY.length))
  history.replaceState(null, '', location.pathname + location.search)
  if (!r.ok) {
    toast.error('That link could not be opened. Your rack is unchanged.', { description: r.error })
    return
  }
  useStore.getState().load(r.layout)
  undoToast('Opened the rack from the link')
}
