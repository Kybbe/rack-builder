import { useEffect, useMemo, useRef, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { toast } from 'sonner'
import { tapHandlers } from './touch'
import { isCoarse, narrowNow } from '../ui/useNarrow'
import { useStore } from '../state/store'
import {
  CABLE_NAME,
  WALL,
  cableLengthText,
  cableReport,
  compatiblePorts,
  measure,
  portsOf,
  type CableRow,
  type Port,
  type PortKind,
  type Vec3,
} from '../domain/cables'
import { rackGeometry } from '../domain/geometry'
import type { Rack, UnitSystem } from '../domain/types'
import type { SceneTheme } from './sceneTheme'

const SIZE: Record<PortKind, [number, number]> = {
  rj45: [12, 10],
  sfp: [13, 9],
  outlet: [22, 22],
  inlet: [20, 16],
}
/** Default outer diameter per kind of cable, in mm. */
export const CABLE_DIAMETER = { ethernet: 5.5, sfp: 4.5, power: 7.5 } as const

/** Corner points turned into a path with rounded bends. Every cable keeps to the plane the route gives it. */
function cablePath(points: Vec3[]): THREE.Vector3[] {
  const pts = points.map((p) => new THREE.Vector3(p.x, p.y, p.z))
  const out: THREE.Vector3[] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!
    const c = pts[i]!
    const b = pts[i + 1]!
    const r = Math.min(14, a.distanceTo(c) / 2, b.distanceTo(c) / 2)
    const p0 = c.clone().add(a.clone().sub(c).setLength(r))
    const p1 = c.clone().add(b.clone().sub(c).setLength(r))
    out.push(...new THREE.QuadraticBezierCurve3(p0, c, p1).getPoints(5))
  }
  out.push(pts[pts.length - 1]!)
  return out
}

function CableTube({
  row,
  color,
  selected,
  onSelect,
}: {
  row: CableRow
  color: string
  selected: boolean
  onSelect: () => void
}) {
  const radius = (row.cable.diameterMm ?? CABLE_DIAMETER[row.kind]) / 2
  const geometry = useMemo(() => {
    const path = cablePath(row.points)
    const curve = new THREE.CatmullRomCurve3(path, false, 'catmullrom', 0)
    return new THREE.TubeGeometry(curve, path.length * 3, radius * (selected ? 1.35 : 1), 8)
  }, [row.points, radius, selected])
  useEffect(() => () => geometry.dispose(), [geometry])
  const grip = useMemo(() => {
    if (!isCoarse()) return null
    const path = cablePath(row.points)
    const curve = new THREE.CatmullRomCurve3(path, false, 'catmullrom', 0)
    return new THREE.TubeGeometry(curve, path.length * 2, Math.max(radius * 3, 10), 6)
  }, [row.points, radius])
  useEffect(() => () => grip?.dispose(), [grip])
  return (
    <mesh geometry={geometry} {...tapHandlers<ThreeEvent<PointerEvent>>(onSelect)}>
      <meshStandardMaterial color={color} roughness={0.6} />
      {grip && (
        // A cable is a few millimetres thick: far too thin to hit with a finger.
        <mesh geometry={grip} {...tapHandlers<ThreeEvent<PointerEvent>>(onSelect)}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </mesh>
  )
}

function mid(points: Vec3[]): [number, number, number] {
  const p = points[Math.floor(points.length / 2)] ?? points[0]!
  return [p.x, p.y, p.z]
}

export function Cables({ rack, theme, units }: { rack: Rack; theme: SceneTheme; units: UnitSystem }) {
  const placements = useStore((s) => s.placements)
  const cables = useStore((s) => s.cables)
  const routing = useStore((s) => s.cableRouting)
  const active = useStore((s) => s.tab === 'cables')
  const pending = useStore((s) => s.pendingPort)
  const coarse = isCoarse()
  const selectedId = useStore((s) => s.selectedCableId)
  const [hover, setHover] = useState<string | null>(null)
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null)

  const report = useMemo(
    () => cableReport(rack, placements, cables, { routing }),
    [rack, placements, cables, routing],
  )
  const ports = useMemo(() => (active ? portsOf(rack, placements) : []), [active, rack, placements])
  const fits = useMemo(
    () => (pending ? compatiblePorts(ports, cables, pending) : null),
    [pending, ports, cables],
  )
  const used = useMemo(() => {
    const m = new Map<string, CableRow>()
    for (const r of report.rows) {
      m.set(r.from.id, r)
      if (r.to !== WALL) m.set(r.to.id, r)
    }
    return m
  }, [report])

  const g = rackGeometry(rack)
  const wall: Vec3 = { x: -g.outerW / 2, y: g.baseY + 30, z: g.rearZ - 25 }
  const from = pending ? ports.find((p) => p.id === pending) : undefined
  const over = hover ? ports.find((p) => p.id === hover) : undefined
  const preview =
    from && hover && hover !== pending && (hover === WALL ? from.kind === 'inlet' : over && fits?.has(hover))
      ? measure(rack, from, hover === WALL ? WALL : over!, routing)
      : null

  const click = (id: string) => () => {
    const st = useStore.getState()
    const before = st.cables.length
    const r = st.clickPort(id)
    if (!r.ok) return void toast.error(r.error)
    const now = useStore.getState()
    if (now.cables.length > before) {
      // On a phone the selection takes over the sheet; wiring several ports in a row must not.
      if (narrowNow()) now.selectCable(null)
      const row = cableReport(now.rack, now.placements, now.cables, { routing: now.cableRouting }).rows.at(-1)
      if (row)
        toast.success(
          row.lengthMm
            ? `${CABLE_NAME[row.kind]} plugged in: use ${cableLengthText(row.lengthMm, units)}`
            : `${CABLE_NAME[row.kind]} plugged in, but it is longer than any stock length`,
          { description: `The run needs ${cableLengthText(row.requiredMm, units)} with slack.` },
        )
    }
  }
  // Leaving a port is only believed after a moment, so the highlight does not blink while the pointer
  // crosses the hairline between two ports or trembles on an edge.
  const hoverOn = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (leave.current) clearTimeout(leave.current)
    leave.current = null
    setHover(id)
    document.body.style.cursor = 'pointer'
  }
  const hoverOffNow = () => {
    if (leave.current) clearTimeout(leave.current)
    leave.current = null
    setHover(null)
    document.body.style.cursor = ''
  }
  const hoverOff = () => {
    if (leave.current) clearTimeout(leave.current)
    leave.current = setTimeout(hoverOffNow, 90)
  }
  useEffect(() => {
    if (!active) hoverOffNow()
    return hoverOffNow
  }, [active])

  const portColor = (p: Port) => {
    if (p.id === pending || p.id === hover) return { color: theme.accent, opacity: 1 }
    const row = used.get(p.id)
    if (fits)
      return fits.has(p.id) ? { color: theme.accent, opacity: 0.55 } : { color: theme.edge, opacity: 0.1 }
    if (row) return { color: row.cable.color ?? theme.cable[row.kind], opacity: 0.95 }
    return { color: theme.edge, opacity: 0.4 }
  }

  return (
    <group>
      {report.rows.map((row) => {
        const selected = row.cable.id === selectedId
        const color = selected
          ? theme.accent
          : row.status === 'ok'
            ? (row.cable.color ?? theme.cable[row.kind])
            : theme.danger
        return (
          <group key={row.cable.id}>
            <CableTube
              row={row}
              color={color}
              selected={selected}
              onSelect={() => useStore.getState().selectCable(row.cable.id)}
            />
            {selected && (
              <Html position={mid(row.points)} center pointerEvents="none" zIndexRange={[30, 0]}>
                <div className={`cable-label${row.status === 'ok' ? '' : ' cable-label--bad'}`}>
                  <b>{row.lengthMm ? cableLengthText(row.lengthMm, units) : 'No stock length'}</b>
                  <span>
                    {row.status === 'too-short' ? 'too short: ' : ''}needs{' '}
                    {cableLengthText(row.requiredMm, units)}
                  </span>
                </div>
              </Html>
            )}
          </group>
        )
      })}

      {active &&
        ports.map((p) => {
          const [w, h] = SIZE[p.kind]
          const c = portColor(p)
          const sign = p.facing === 'front' ? 1 : -1
          return (
            <group key={p.id} position={[p.pos.x, p.pos.y, p.pos.z]}>
              <mesh position={[0, 0, sign * 1.5]} raycast={() => null}>
                <boxGeometry args={[w, h, 3]} />
                <meshBasicMaterial
                  color={c.color}
                  transparent
                  opacity={c.opacity}
                  depthWrite={c.opacity > 0.3}
                />
              </mesh>
              {/* The part that takes the pointer: larger than the socket and well in front of the device,
                  so the device behind it can never win the click. */}
              <mesh
                position={[0, 0, sign * 7]}
                {...tapHandlers<ThreeEvent<PointerEvent>>(click(p.id))}
                onPointerOver={hoverOn(p.id)}
                onPointerOut={hoverOff}
              >
                <boxGeometry args={[w + 3, h + (coarse ? 6 : 1.6), 14]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          )
        })}

      {active && (
        <group position={[wall.x, wall.y, wall.z]}>
          <mesh
            {...tapHandlers<ThreeEvent<PointerEvent>>(click(WALL))}
            onPointerOver={hoverOn(WALL)}
            onPointerOut={hoverOff}
          >
            <boxGeometry args={[46, 46, 10]} />
            <meshBasicMaterial
              color={hover === WALL || from?.kind === 'inlet' ? theme.accent : theme.edge}
              transparent
              opacity={hover === WALL ? 1 : from?.kind === 'inlet' ? 0.6 : 0.35}
            />
          </mesh>
          {from?.kind === 'inlet' && hover !== WALL && (
            <Html position={[0, 40, 0]} center pointerEvents="none" zIndexRange={[10, 0]}>
              <div className="dim-label">
                <span>wall socket</span>
              </div>
            </Html>
          )}
        </group>
      )}

      {preview && (
        <Line
          points={preview.points.map((p) => [p.x, p.y, p.z] as [number, number, number])}
          color={theme.accent}
          lineWidth={2}
          dashed
          dashSize={8}
          gapSize={6}
        />
      )}

      {active && hover && (over || hover === WALL) && (
        <Html
          position={over ? [over.pos.x, over.pos.y + 14, over.pos.z] : [wall.x, wall.y - 40, wall.z]}
          center
          pointerEvents="none"
          zIndexRange={[40, 0]}
        >
          <div className="port-tip">
            <b>{over ? `${over.device} · ${over.label}` : 'Wall socket'}</b>
            {preview ? (
              <span>
                needs {cableLengthText(preview.requiredMm, units)}
                {preview.suggestedMm ? ` → use ${cableLengthText(preview.suggestedMm, units)}` : ''}
              </span>
            ) : over && used.has(over.id) ? (
              <span>has a cable: click to select it</span>
            ) : pending && hover !== pending ? (
              <span>does not fit this cable</span>
            ) : !pending ? (
              <span>click to start a cable</span>
            ) : null}
          </div>
        </Html>
      )}
    </group>
  )
}
