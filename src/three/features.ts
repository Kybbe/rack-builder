import type { FrontFeature } from '../domain/types'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
  tone: 'hole' | 'bay' | 'screen' | 'led' | 'sfp' | 'handle'
}

/** Turns the feature list of a device into rectangles on its face. Origin: centre of the face, in mm. */
export function featureRects(features: FrontFeature[], faceW: number, faceH: number): Rect[] {
  const out: Rect[] = []
  const left = -faceW / 2
  for (const f of features) {
    if (f.type === 'handles') {
      for (const s of [-1, 1])
        out.push({ x: s * (faceW / 2 + 9), y: 0, w: 5, h: faceH * 0.6, tone: 'handle' })
      continue
    }
    const x0 = left + f.x * faceW
    if (f.type === 'leds') {
      for (let i = 0; i < f.count; i++) out.push({ x: x0 + i * 7, y: 0, w: 3, h: 3, tone: 'led' })
      continue
    }
    const w = f.w * faceW
    const cx = x0 + w / 2
    switch (f.type) {
      case 'ports':
      case 'keystones':
      case 'outlets': {
        const rows = f.type === 'ports' ? (f.rows ?? 1) : f.count > 24 ? 2 : 1
        const cols = Math.ceil(f.count / rows)
        const pitch = w / cols
        const maxH = f.type === 'outlets' ? 30 : 12
        const ph = Math.min(maxH, (faceH * 0.72) / rows - 2)
        const pw = Math.min(pitch * 0.82, f.type === 'outlets' ? 30 : 15)
        for (let i = 0; i < f.count; i++) {
          const c = i % cols
          const r = Math.floor(i / cols)
          out.push({
            x: x0 + pitch * (c + 0.5),
            y: (rows - 1) * (ph + 2) * 0.5 - r * (ph + 2),
            w: pw,
            h: ph,
            tone: f.type === 'ports' && f.kind === 'sfp' ? 'sfp' : 'hole',
          })
        }
        break
      }
      case 'bays': {
        const rows = f.vertical ? 1 : f.rows
        const cols = Math.ceil(f.count / rows)
        const pitchX = w / cols
        const pitchY = (faceH * 0.86) / rows
        for (let i = 0; i < f.count; i++) {
          const c = i % cols
          const r = Math.floor(i / cols)
          out.push({
            x: x0 + pitchX * (c + 0.5),
            y: (rows - 1) * pitchY * 0.5 - r * pitchY,
            w: pitchX - 1.6,
            h: pitchY - 1.6,
            tone: 'bay',
          })
        }
        break
      }
      case 'screen':
        out.push({ x: cx, y: 0, w, h: faceH * (f.h ?? 0.6), tone: 'screen' })
        break
      case 'vent': {
        const n = Math.max(3, Math.floor(w / 6))
        for (let i = 0; i < n; i++)
          out.push({ x: x0 + (w / n) * (i + 0.5), y: 0, w: 2.2, h: faceH * 0.55, tone: 'hole' })
        break
      }
      case 'brush':
        out.push({ x: cx, y: 0, w, h: faceH * 0.42, tone: 'hole' })
        break
    }
  }
  return out
}
