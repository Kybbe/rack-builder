import { toast } from 'sonner'
import type { Issue, Side } from '../domain/types'
import { useStore } from '../state/store'
import { getItem } from '../catalog'

interface Result {
  ok: boolean
  errors: Issue[]
  warnings: Issue[]
}

/**
 * Tells the user why something was refused. When the only problem is a missing shelf, the message carries a button
 * that mounts a shelf (at the unit they aimed for, if given) and puts the device on it.
 */
export function report(r: Result, ctx: { itemId?: string; side?: Side; u?: number } = {}): boolean {
  if (r.ok) {
    if (r.warnings[0]) toast.warning(r.warnings[0].message)
    return true
  }
  const first = r.errors[0]
  const item = ctx.itemId ? getItem(ctx.itemId) : undefined
  if (first?.code === 'needs-shelf' && item?.mount === 'shelf') {
    toast.error(first.message, {
      duration: 9000,
      action: {
        label: 'Add a shelf',
        onClick: () => {
          const res = useStore.getState().addOnNewShelf(item.id, ctx.side ?? 'front', ctx.u)
          if (!res.ok) toast.error(res.errors[0]?.message ?? 'No room for a shelf.')
          else toast.success(`${item.name} is on a new shelf`)
        },
      },
    })
    return false
  }
  toast.error(first?.message ?? 'That does not fit there.')
  return false
}
