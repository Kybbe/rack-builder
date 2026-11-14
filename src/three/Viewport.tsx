import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  Html,
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei'
import * as THREE from 'three'
import { toast } from 'sonner'
import { useStore, type ViewPreset } from '../state/store'
import { report } from '../ui/feedback'
import { dropTarget, rackGeometry } from '../domain/geometry'
import { HOLE_SHIFT_MM } from '../domain/placement'
import { U_MM, formatLength, uToMm } from '../domain/units'
import type { Rack, UnitSystem } from '../domain/types'
import { RackFrame } from './RackFrame'
import { Device } from './Device'
import { Cables } from './Cables'
import { MM, bridge, pointOnRack } from './bridge'
import { lastPressWasTouch, pressAction } from './touch'
import { isCoarse, useNarrow } from '../ui/useNarrow'
import { SCENE, type SceneTheme } from './sceneTheme'

type Controls = { target: THREE.Vector3; update: () => void; object: THREE.Camera }

const DIRS: Record<ViewPreset, [number, number, number]> = {
  iso: [0.62, 0.32, 1],
  front: [0, 0, 1],
  rear: [0, 0, -1],
  side: [1, 0, 0],
  top: [0, 1, 0.001],
}

function Rig({ rack }: { rack: Rack }) {
  const view = useStore((s) => s.view)
  const projection = useStore((s) => s.projection)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const g = rackGeometry(rack)
  const extent = Math.max(g.totalH, g.outerW, rack.depthMm) * MM
  // Re-frame when the view button is pressed or the rack changes size, not on every render.
  const key = `${view.nonce}|${view.preset}|${projection}|${rack.standard}|${rack.heightU}|${rack.depthMm}|${rack.casters}`

  useEffect(() => {
    bridge.camera = camera
    bridge.el = gl.domElement
  }, [camera, gl])

  useEffect(() => {
    if (!controls) return
    const target = new THREE.Vector3(0, (g.totalH * MM) / 2, 0)
    const dir = new THREE.Vector3(...DIRS[view.preset]).normalize()
    // The field of view is measured top to bottom, so on a tall narrow screen the sides are cut off
    // unless the camera stands further back. The window is used rather than the canvas, which changes
    // height as the phone sheet opens and closes.
    const aspect = Math.min(size.width / size.height, window.innerWidth / window.innerHeight)
    const back = Math.max(1, 0.6 / aspect)
    camera.position.copy(target).addScaledVector(dir, (extent * 2.4 + 0.25) * back)
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = (Math.min(size.width, size.height) / (extent * 1.5)) * 1
      camera.updateProjectionMatrix()
    }
    controls.target.copy(target)
    controls.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controls, camera])
  return null
}

function Dimensions({ rack, theme, units }: { rack: Rack; theme: SceneTheme; units: UnitSystem }) {
  const g = rackGeometry(rack)
  const x = g.outerW / 2 + 34
  const top = g.u1Y + rack.heightU * U_MM
  const zf = rack.depthMm / 2
  const other: UnitSystem = units === 'mm' ? 'in' : 'mm'
  const label = (mm: number, lead?: string) => (
    <div className="dim-label">
      {lead && <b>{lead}</b>}
      <span>{formatLength(mm, units)}</span>
      <i>{formatLength(mm, other)}</i>
    </div>
  )
  const tick = (a: [number, number, number], b: [number, number, number]) => (
    <Line points={[a, b]} color={theme.text} lineWidth={1} />
  )
  return (
    <group>
      {tick([x, g.u1Y, zf], [x, top, zf])}
      {tick([x - 6, g.u1Y, zf], [x + 6, g.u1Y, zf])}
      {tick([x - 6, top, zf], [x + 6, top, zf])}
      <Html position={[x + 10, (g.u1Y + top) / 2, zf]} zIndexRange={[10, 0]}>
        {label(uToMm(rack.heightU), `${rack.heightU}U`)}
      </Html>
      {tick([-g.panelW / 2, top + 46, zf], [g.panelW / 2, top + 46, zf])}
      {tick([-g.panelW / 2, top + 40, zf], [-g.panelW / 2, top + 52, zf])}
      {tick([g.panelW / 2, top + 40, zf], [g.panelW / 2, top + 52, zf])}
      <Html position={[0, top + 58, zf]} center zIndexRange={[10, 0]}>
        {label(g.panelW, `${rack.standard}"`)}
      </Html>
      {tick([x, g.baseY, -zf], [x, g.baseY, zf])}
      {tick([x - 6, g.baseY, -zf], [x + 6, g.baseY, -zf])}
      {tick([x - 6, g.baseY, zf], [x + 6, g.baseY, zf])}
      <Html position={[x + 10, g.baseY, 0]} zIndexRange={[10, 0]}>
        {label(rack.depthMm, 'depth')}
      </Html>
    </group>
  )
}

function Ghost({ rack, theme }: { rack: Rack; theme: SceneTheme }) {
  const ghost = useStore((s) => s.ghost)
  if (!ghost) return null
  const g = rackGeometry(rack)
  const h = ghost.heightU * U_MM
  const color = ghost.ok ? theme.accent : theme.danger
  const z = ghost.side === 'front' ? g.frontZ : g.rearZ
  const sign = ghost.side === 'front' ? 1 : -1
  const reason = ghost.issues[0]?.message
  return (
    <group
      position={[0, g.u1Y + (ghost.u - 1) * U_MM + HOLE_SHIFT_MM[ghost.hole ?? 0] + h / 2, z - sign * 28]}
    >
      <mesh>
        <boxGeometry args={[g.panelW, h, 60]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(g.panelW, h, 60)]} />
        <lineBasicMaterial color={color} />
      </lineSegments>
      <Html position={[g.panelW / 2 + 14, 0, sign * 30]} zIndexRange={[30, 0]}>
        <div className={`ghost-label${ghost.ok ? '' : ' ghost-label--bad'}`}>
          <b>
            {ghost.kind === 'shelf'
              ? `On shelf, U${ghost.u}`
              : ghost.heightU > 1
                ? `U${ghost.u}–U${ghost.u + ghost.heightU - 1}`
                : `U${ghost.u}`}
            {ghost.hole ? ` +${ghost.hole} hole${ghost.hole > 1 ? 's' : ''}` : ''}
          </b>
          {reason && <span>{reason}</span>}
        </div>
      </Html>
    </group>
  )
}

function Scene() {
  const rack = useStore((s) => s.rack)
  const placements = useStore((s) => s.placements)
  const selectedId = useStore((s) => s.selectedId)
  const look = useStore((s) => s.look)
  const units = useStore((s) => s.units)
  const themeName = useStore((s) => s.theme)
  const projection = useStore((s) => s.projection)
  const showDimensions = useStore((s) => s.showDimensions)
  const moving = useStore((s) => s.drag?.moveId)
  const narrow = useNarrow()
  const theme = SCENE[themeName]
  const pending = useRef<{ id: string; itemId: string; x: number; y: number } | null>(null)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null
  // While a device is held, the camera must not move: the press belongs to the device, not to orbiting.
  const [holding, setHolding] = useState(false)
  const hold = (on: boolean) => {
    if (controls) controls.enabled = !on
    setHolding(on)
  }
  const holdRef = useRef(hold)
  holdRef.current = hold

  // Dragging a device that is already in the rack: starts after a few pixels so a plain click still selects.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const st = useStore.getState()
      const p = pending.current
      if (p && !st.drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5) {
        st.setDrag({ itemId: p.itemId, moveId: p.id })
      }
      const drag = useStore.getState().drag
      if (!drag?.moveId && !drag?.held) return
      const pt = pointOnRack(e.clientX, e.clientY, st.rack)
      st.setGhost(
        pt ? dropTarget(st.rack, st.placements, drag, pt.yMm, pt.side, { holes: st.holeSnap }) : null,
      )
    }
    const onUp = () => {
      pending.current = null
      holdRef.current(false)
      const st = useStore.getState()
      const { ghost, drag } = st
      if (!drag?.moveId && !drag?.held) return
      st.setDrag(null)
      if (!ghost) return
      const r = st.drop(ghost, drag)
      if (drag.held)
        report(r.ok ? { ...r, warnings: ghost.issues } : r, {
          itemId: drag.itemId,
          side: ghost.side,
          u: ghost.u,
        })
      else if (!r.ok && r.errors[0]) toast.error(r.errors[0].message)
    }
    // The browser took the gesture away (a scroll, a system gesture): nothing is dropped.
    const onCancel = () => {
      pending.current = null
      holdRef.current(false)
      const st = useStore.getState()
      if (st.drag?.moveId || st.drag?.held) st.setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [])

  const gridSize = useMemo(() => Math.max(2, rackGeometry(rack).totalH * MM * 3), [rack])

  return (
    <>
      <color attach="background" args={[theme.background]} />
      {projection === 'perspective' ? (
        <PerspectiveCamera makeDefault fov={32} near={0.01} far={60} />
      ) : (
        <OrthographicCamera makeDefault near={-50} far={60} />
      )}
      <OrbitControls
        makeDefault
        enabled={!moving && !holding}
        enableDamping
        dampingFactor={0.12}
        minDistance={0.15}
        maxDistance={20}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: -1 as unknown as THREE.MOUSE,
        }}
      />
      <Rig rack={rack} />
      <ambientLight intensity={look === 'cad' ? 1.5 : 0.9} />
      <directionalLight position={[2, 4, 3]} intensity={look === 'cad' ? 0.9 : 1.6} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} />
      <Grid
        args={[gridSize, gridSize]}
        cellSize={0.05}
        sectionSize={0.25}
        cellColor={theme.grid}
        sectionColor={theme.gridMajor}
        cellThickness={1}
        sectionThickness={1}
        fadeDistance={gridSize * 1.6}
        fadeStrength={1.5}
        infiniteGrid
        position={[0, -0.0005, 0]}
      />
      <group scale={MM}>
        <RackFrame rack={rack} theme={theme} units={units} />
        {placements.map((p) => (
          <Device
            key={p.id}
            placement={p}
            rack={rack}
            theme={theme}
            look={look}
            selected={selectedId === p.id}
            dimmed={moving === p.id}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              if (e.button !== 0) return
              if (pressAction({ pointerType: e.pointerType, selected: selectedId === p.id }) === 'orbit')
                return
              e.stopPropagation()
              useStore.getState().select(p.id)
              hold(true)
              pending.current = { id: p.id, itemId: p.itemId, x: e.clientX, y: e.clientY }
            }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              // A finger selects on tap; its press may have been the start of orbiting.
              if (!lastPressWasTouch()) return
              e.stopPropagation()
              useStore.getState().select(p.id)
            }}
            onContextMenu={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              useStore.getState().select(p.id)
            }}
          />
        ))}
        <Cables rack={rack} theme={theme} units={units} />
        <Ghost rack={rack} theme={theme} />
        {showDimensions && <Dimensions rack={rack} theme={theme} units={units} />}
      </group>
      {!narrow && (
        <GizmoHelper alignment="bottom-right" margin={[56, 64]}>
          <GizmoViewport axisColors={[theme.text, theme.text, theme.text]} labelColor={theme.background} />
        </GizmoHelper>
      )}
    </>
  )
}

export function Viewport() {
  const drag = useStore((s) => s.drag)
  const empty = useStore((s) => s.placements.length === 0)
  const touch = useNarrow() && isCoarse()

  const targetAt = (e: React.DragEvent) => {
    const st = useStore.getState()
    if (!st.drag) return null
    const pt = pointOnRack(e.clientX, e.clientY, st.rack)
    return pt ? dropTarget(st.rack, st.placements, st.drag, pt.yMm, pt.side, { holes: st.holeSnap }) : null
  }

  return (
    <div
      className="viewport"
      data-dragging={drag ? '' : undefined}
      onDragOver={(e) => {
        if (!useStore.getState().drag) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        const t = targetAt(e)
        const prev = useStore.getState().ghost
        if (
          !prev ||
          !t ||
          prev.u !== t.u ||
          prev.hole !== t.hole ||
          prev.ok !== t.ok ||
          prev.side !== t.side ||
          prev.kind !== t.kind ||
          prev.heightU !== t.heightU ||
          prev.issues[0]?.message !== t.issues[0]?.message
        )
          useStore.getState().setGhost(t)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) useStore.getState().setGhost(null)
      }}
      onDrop={(e) => {
        e.preventDefault()
        const st = useStore.getState()
        const src = st.drag
        const t = targetAt(e)
        st.setDrag(null)
        if (!src || !t) return
        const r = st.drop(t, src)
        report(r.ok ? { ...r, warnings: t.issues } : r, { itemId: src.itemId, side: t.side, u: t.u })
      }}
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true }}
        onPointerMissed={(e) => {
          if (e.button !== 0) return
          const st = useStore.getState()
          st.select(null)
          st.selectCable(null)
          st.cancelCable()
        }}
      >
        <Scene />
      </Canvas>
      {empty && !drag && (
        <p className="viewport__hint">
          {touch
            ? 'Add equipment with + in the list below, or press and hold it and drag it in. One finger orbits, two fingers zoom and pan.'
            : 'Drag equipment from the list into the rack. Drag to orbit, scroll to zoom, shift-drag to pan.'}
        </p>
      )}
    </div>
  )
}
