import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react'
import { Edges, useGLTF, useTexture } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { CatalogItem, Configurable, Placement, Rack } from '../domain/types'
import { rackGeometry } from '../domain/geometry'
import { bottomMm, driveGrid, effectiveStandard, resolvePlacement } from '../domain/placement'
import { shelfLayout } from '../domain/shelf'
import { RACK_STANDARDS, U_MM } from '../domain/units'
import { getItem } from '../catalog'
import models from '../catalog/models.json'
import elevations from '../catalog/elevations.json'
import { featureRects, type Rect } from '../domain/features'
import type { SceneTheme } from './sceneTheme'
import type { Look } from '../state/store'

interface ModelEntry {
  itemId: string
  file: string
}
const MODEL_BY_ITEM = new Map((models as ModelEntry[]).map((m) => [m.itemId, m.file]))
interface Elevation {
  itemId: string
  front?: string
  rear?: string
}
/** Front and rear photos from the NetBox device-type library (CC0), shown in the realistic look. */
const PHOTO_BY_ITEM = new Map((elevations as Elevation[]).map((e) => [e.itemId, e]))
/** Whether the realistic look of this item differs from the CAD look. */
export const hasModel = (itemId: string) => MODEL_BY_ITEM.has(itemId) || PHOTO_BY_ITEM.has(itemId)

/** A photo on a face, as tall as the face and as wide as the picture's own shape makes it. */
function Photo({
  file,
  maxW,
  h,
  z,
  back,
}: {
  file: string
  maxW: number
  h: number
  z: number
  back?: boolean
}) {
  const tex = useTexture(`${import.meta.env.BASE_URL}${file}`, (t) => {
    t.colorSpace = THREE.SRGBColorSpace
  })
  const img = tex.image as { width: number; height: number }
  const w = Math.min(maxW, (h * img.width) / img.height)
  return (
    <mesh position={[0, 0, z]} rotation={[0, back ? Math.PI : 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  )
}

/** The photos of a device when it has them, else (and while they load) the drawn details. */
function Faces({
  itemId,
  drawn,
  real,
  front,
  rear,
}: {
  itemId: string
  drawn: ReactNode
  real: boolean
  front: { maxW: number; h: number; z: number }
  rear?: { maxW: number; h: number; z: number }
}) {
  const e = real ? PHOTO_BY_ITEM.get(itemId) : undefined
  if (!e?.front) return <>{drawn}</>
  return (
    <ModelBoundary fallback={drawn}>
      <Suspense fallback={drawn}>
        <Photo file={e.front} {...front} />
        {e.rear && rear && <Photo file={e.rear} {...rear} back />}
      </Suspense>
    </ModelBoundary>
  )
}

interface Paint {
  theme: SceneTheme
  look: Look
  selected: boolean
  /** A colour the user picked for this device. */
  color?: string
}

function bodyColor(item: CatalogItem, p: Paint, face = false) {
  if (p.color) return p.color
  if (p.look === 'cad') return face ? p.theme.cadFace : p.theme.cadBody
  return item.color ?? '#2a2c30'
}

function Outline({ p }: { p: Paint }) {
  return (
    <Edges
      color={p.selected ? p.theme.accent : p.look === 'cad' ? p.theme.edge : p.theme.frame}
      threshold={15}
      lineWidth={p.selected ? 2 : 1}
    />
  )
}

function toneColor(tone: Rect['tone'], p: Paint): { color: string; emissive?: string } {
  const cad = p.look === 'cad'
  switch (tone) {
    case 'led':
      return cad ? { color: p.theme.edge } : { color: '#49d17d', emissive: '#49d17d' }
    case 'screen':
      return cad ? { color: p.theme.cadDetail } : { color: '#0c1622', emissive: '#1d3147' }
    case 'bay':
      return { color: cad ? p.theme.cadBody : '#3b3e44' }
    case 'sfp':
      return { color: cad ? p.theme.cadDetail : '#8f949c' }
    case 'handle':
      return { color: cad ? p.theme.cadFace : '#55595f' }
    default:
      return { color: cad ? p.theme.cadDetail : '#0d0e10' }
  }
}

/** Details on the face of a device. z is the surface they sit on. */
function Face({ rects, z, p }: { rects: Rect[]; z: number; p: Paint }) {
  return (
    <group position={[0, 0, z]}>
      {rects.map((r, i) => {
        const c = toneColor(r.tone, p)
        const depth = r.tone === 'handle' ? 14 : r.tone === 'bay' ? 1.2 : 0.8
        return (
          <mesh key={i} position={[r.x, r.y, depth / 2]}>
            <boxGeometry args={[r.w, r.h, depth]} />
            <meshStandardMaterial
              color={c.color}
              emissive={c.emissive ?? '#000000'}
              emissiveIntensity={c.emissive ? 0.7 : 0}
              roughness={0.6}
            />
            {(r.tone === 'bay' || r.tone === 'handle' || p.look === 'cad') && r.w > 4 && (
              <Edges color={p.look === 'cad' ? p.theme.edge : p.theme.frame} threshold={15} />
            )}
          </mesh>
        )
      })}
    </group>
  )
}

/** A spinning fan seen along its axis (local z). */
function FanUnit({ size, p, flow }: { size: number; p: Paint; flow: 1 | -1 }) {
  const blades = useRef<THREE.Group>(null)
  const arrow = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z -= dt * 5 * flow
    if (arrow.current) arrow.current.position.z = flow * (22 + ((performance.now() / 40) % 18))
  })
  const dark = p.look === 'cad' ? p.theme.cadDetail : '#0d0e10'
  return (
    <group>
      <mesh>
        <boxGeometry args={[size, size, 25]} />
        <meshStandardMaterial color={p.look === 'cad' ? p.theme.cadBody : '#1c1d20'} roughness={0.8} />
        <Outline p={p} />
      </mesh>
      {[13, -13].map((z) => (
        <mesh key={z} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[size / 2 - 3, size / 2 - 3, 0.6, 40]} />
          <meshStandardMaterial color={dark} roughness={0.9} />
        </mesh>
      ))}
      <group ref={blades} position={[0, 0, 13.6]}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} rotation={[0, 0, (i / 7) * Math.PI * 2]} position={[0, 0, 0]}>
            <boxGeometry args={[size * 0.4, size * 0.13, 0.8]} />
            <meshStandardMaterial color={p.look === 'cad' ? p.theme.edge : '#6b7078'} />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[size * 0.16, size * 0.16, 1.4, 24]} />
          <meshStandardMaterial color={p.look === 'cad' ? p.theme.cadFace : '#2b2d31'} />
        </mesh>
      </group>
      {/* which way the air goes */}
      <group ref={arrow} rotation={[flow === 1 ? Math.PI / 2 : -Math.PI / 2, 0, 0]}>
        <mesh>
          <coneGeometry args={[size * 0.11, size * 0.22, 12]} />
          <meshBasicMaterial color={p.theme.text} transparent opacity={0.75} />
        </mesh>
      </group>
    </group>
  )
}

function ConfiguredBody({
  cfg,
  item,
  rack,
  h,
  panelW,
  depth,
  p,
}: {
  cfg: Configurable
  item: CatalogItem
  rack: Rack
  h: number
  panelW: number
  depth: number
  p: Paint
}) {
  const opening = RACK_STANDARDS[effectiveStandard(item, rack)].openingMm
  if (cfg.kind === 'fanPanel') {
    const pitch = opening / cfg.count
    return (
      <group>
        <mesh position={[0, h / 2, 1.25]}>
          <boxGeometry args={[panelW, h - 0.8, 2.5]} />
          <meshStandardMaterial color={bodyColor(item, p, true)} roughness={0.7} />
          <Outline p={p} />
        </mesh>
        {Array.from({ length: cfg.count }, (_, i) => (
          <group key={i} position={[-opening / 2 + pitch * (i + 0.5), h / 2, -10]}>
            <FanUnit size={cfg.fanSizeMm} p={p} flow={cfg.direction === 'out' ? 1 : -1} />
          </group>
        ))}
      </group>
    )
  }
  if (cfg.kind === 'fanTray') {
    const perRow = Math.max(1, Math.floor(opening / (cfg.fanSizeMm + 8)))
    const rows = Math.ceil(cfg.count / perRow)
    const pitchZ = cfg.fanSizeMm + 8
    return (
      <group>
        <mesh position={[0, h / 2, 1.25]}>
          <boxGeometry args={[panelW, h - 0.8, 2.5]} />
          <meshStandardMaterial color={bodyColor(item, p, true)} roughness={0.7} />
          <Outline p={p} />
        </mesh>
        <mesh position={[0, 4, -depth / 2]}>
          <boxGeometry args={[opening - 4, 2, depth]} />
          <meshStandardMaterial color={bodyColor(item, p)} roughness={0.7} />
          <Outline p={p} />
        </mesh>
        {Array.from({ length: cfg.count }, (_, i) => {
          const row = Math.floor(i / perRow)
          const inRow = Math.min(perRow, cfg.count - row * perRow)
          const pitchX = opening / inRow
          return (
            <group
              key={i}
              position={[
                -opening / 2 + pitchX * ((i % perRow) + 0.5),
                20,
                -14 - pitchZ * (row + 0.5) - (rows > 1 ? 0 : 0),
              ]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <FanUnit size={cfg.fanSizeMm} p={p} flow={cfg.direction === 'up' ? 1 : -1} />
            </group>
          )
        })}
      </group>
    )
  }
  // drive bay: every drive drawn the way it sits, empty slots left dark
  const g = driveGrid(cfg, item, rack)
  const gap = cfg.driveSize === '3.5' ? 4 : 2
  const pitchX = (opening - 10) / g.cols
  const pitchY = h / g.rows
  const slots = g.cols * g.rows
  return (
    <group>
      <mesh position={[0, h / 2, -depth / 2]}>
        <boxGeometry args={[opening - 2, h - 0.8, depth]} />
        <meshStandardMaterial color={bodyColor(item, p)} roughness={0.7} />
        <Outline p={p} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (panelW / 2 - (panelW - opening) / 4), h / 2, 1.25]}>
          <boxGeometry args={[(panelW - opening) / 2, h - 0.8, 2.5]} />
          <meshStandardMaterial color={bodyColor(item, p, true)} roughness={0.7} />
          <Outline p={p} />
        </mesh>
      ))}
      {Array.from({ length: slots }, (_, i) => {
        const c = i % g.cols
        const r = Math.floor(i / g.cols)
        const filled = i < cfg.count
        return (
          <mesh
            key={i}
            position={[-(opening - 10) / 2 + pitchX * (c + 0.5), pitchY * (r + 0.5), filled ? 1 : 0.2]}
          >
            <boxGeometry
              args={[Math.min(g.cellW, pitchX - gap), Math.min(g.cellH, pitchY - gap), filled ? 2 : 0.4]}
            />
            <meshStandardMaterial
              color={
                filled
                  ? p.look === 'cad'
                    ? p.theme.cadFace
                    : '#3b3e44'
                  : p.look === 'cad'
                    ? p.theme.cadDetail
                    : '#0d0e10'
              }
              roughness={0.6}
            />
            {filled && <Edges color={p.look === 'cad' ? p.theme.edge : p.theme.frame} threshold={15} />}
          </mesh>
        )
      })}
    </group>
  )
}

/** A loose device (mini PC, small switch, bare screen) as a box with its front details. */
function LooseBody({ item, upright, p }: { item: CatalogItem; upright: boolean; p: Paint }) {
  const rects = useMemo(
    () => featureRects(item.features, item.widthMm * 0.92, item.heightMm),
    [item.features, item.widthMm, item.heightMm],
  )
  const h = upright ? item.widthMm : item.heightMm
  return (
    <group position={[0, h / 2, -item.depthMm / 2]}>
      <group rotation={[0, 0, upright ? Math.PI / 2 : 0]}>
        <mesh>
          <boxGeometry args={[item.widthMm, item.heightMm, item.depthMm]} />
          <meshStandardMaterial
            color={bodyColor(item, p)}
            roughness={0.55}
            metalness={p.look === 'cad' ? 0 : 0.2}
          />
          <Outline p={p} />
        </mesh>
        <Faces
          itemId={item.id}
          real={p.look === 'real'}
          drawn={<Face rects={rects} z={item.depthMm / 2} p={p} />}
          front={{ maxW: item.widthMm, h: item.heightMm, z: item.depthMm / 2 + 0.2 }}
          rear={{ maxW: item.widthMm, h: item.heightMm, z: -item.depthMm / 2 - 0.2 }}
        />
      </group>
    </group>
  )
}

/** A real 3D model, squeezed into the catalog dimensions so it can never disagree with the fit checks. */
function GlbBody({ file, size }: { file: string; size: [number, number, number] }) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/${file}`)
  const obj = useMemo(() => {
    const o = scene.clone(true)
    const box = new THREE.Box3().setFromObject(o)
    const s = box.getSize(new THREE.Vector3())
    const c = box.getCenter(new THREE.Vector3())
    const g = new THREE.Group()
    o.position.sub(c)
    g.add(o)
    g.scale.set(size[0] / (s.x || 1), size[1] / (s.y || 1), size[2] / (s.z || 1))
    return g
  }, [scene, size])
  return <primitive object={obj} />
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

interface DeviceProps {
  placement: Placement
  rack: Rack
  theme: SceneTheme
  look: Look
  selected: boolean
  dimmed?: boolean
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void
  onContextMenu?: (e: ThreeEvent<MouseEvent>) => void
}

export function Device({
  placement,
  rack,
  theme,
  look,
  selected,
  dimmed,
  onPointerDown,
  onContextMenu,
}: DeviceProps) {
  const res = resolvePlacement(placement, rack)
  const g = rackGeometry(rack)
  const item = res?.item
  const effLook: Look = placement.cadOnly ? 'cad' : look
  const p: Paint = { theme, look: effLook, selected, ...(placement.color ? { color: placement.color } : {}) }
  const rects = useMemo(
    () =>
      item
        ? featureRects(
            item.features,
            RACK_STANDARDS[effectiveStandard(item, rack)].openingMm - 14,
            (item.heightU ?? 1) * U_MM,
          )
        : [],
    [item, rack],
  )
  if (!res || !item) return null

  const std = effectiveStandard(item, rack)
  const ownPanelW = RACK_STANDARDS[std].panelWidthMm
  const opening = RACK_STANDARDS[std].openingMm
  const h = res.heightU * U_MM
  const bodyW = item.standard === 'both' ? opening - 8 : Math.min(item.widthMm, opening - 2)
  const bodyH = item.configurable || item.standard === 'both' ? h - 2 : Math.min(item.heightMm, h - 0.8)
  const depth = res.depthMm
  const y = g.u1Y + bottomMm(placement)
  const front = placement.side === 'front'
  const cfg = item.configurable ? (placement.config ?? item.configurable) : undefined
  const modelFile = effLook === 'real' ? MODEL_BY_ITEM.get(item.id) : undefined
  const needsAdapter = std === '10' && rack.standard === '19'

  let body: ReactNode
  if (cfg) {
    body = <ConfiguredBody cfg={cfg} item={item} rack={rack} h={h} panelW={ownPanelW} depth={depth} p={p} />
  } else if (item.isShelf) {
    const layout = shelfLayout(placement, rack)
    body = (
      <group>
        <mesh position={[0, 1.5, -depth / 2]}>
          <boxGeometry args={[opening - 4, 2, depth]} />
          <meshStandardMaterial color={bodyColor(item, p)} roughness={0.7} />
          <Outline p={p} />
        </mesh>
        <mesh position={[0, 7, 1.25]}>
          <boxGeometry args={[ownPanelW, 13, 2.5]} />
          <meshStandardMaterial color={bodyColor(item, p, true)} roughness={0.7} />
          <Outline p={p} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (ownPanelW / 2 - (ownPanelW - opening) / 4), U_MM / 2, 1.25]}>
            <boxGeometry args={[(ownPanelW - opening) / 2, U_MM - 0.8, 2.5]} />
            <meshStandardMaterial color={bodyColor(item, p, true)} roughness={0.7} />
            <Outline p={p} />
          </mesh>
        ))}
        {layout.slots.map((s) => {
          const ci = getItem(s.itemId)
          const child = placement.children?.find((c) => c.id === s.childId)
          if (!ci || !child) return null
          return (
            <group key={s.childId} position={[-layout.usableMm / 2 + s.xMm + s.widthMm / 2, 2.5, -6]}>
              <LooseBody item={ci} upright={child.orientation === 'upright'} p={p} />
            </group>
          )
        })}
      </group>
    )
  } else {
    const procedural = (
      <group>
        <mesh position={[0, h / 2, 1.25]}>
          <boxGeometry args={[ownPanelW, h - 0.8, 2.5]} />
          <meshStandardMaterial
            color={bodyColor(item, p, true)}
            roughness={0.6}
            metalness={effLook === 'cad' ? 0 : 0.35}
          />
          <Outline p={p} />
        </mesh>
        {depth > 6 && (
          <mesh position={[0, bodyH / 2 + (h - bodyH) / 2, -depth / 2]}>
            <boxGeometry args={[bodyW, bodyH, depth]} />
            <meshStandardMaterial
              color={bodyColor(item, p)}
              roughness={0.7}
              metalness={effLook === 'cad' ? 0 : 0.3}
            />
            <Outline p={p} />
          </mesh>
        )}
        <group position={[0, h / 2, 0]}>
          <Faces
            itemId={item.id}
            real={effLook === 'real'}
            drawn={<Face rects={rects} z={2.5} p={p} />}
            front={{ maxW: ownPanelW, h: h - 0.8, z: 2.7 }}
            {...(depth > 6 ? { rear: { maxW: bodyW, h: bodyH, z: -depth - 0.2 } } : {})}
          />
        </group>
      </group>
    )
    body = modelFile ? (
      <ModelBoundary fallback={procedural}>
        <Suspense fallback={procedural}>
          <group position={[0, h / 2, -depth / 2 + 1.25]}>
            <GlbBody file={modelFile} size={[ownPanelW, h - 0.8, depth + 2.5]} />
          </group>
          {selected && (
            <mesh position={[0, h / 2, -depth / 2 + 1.25]}>
              <boxGeometry args={[ownPanelW, h, depth + 2.5]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              <Edges color={theme.accent} lineWidth={2} />
            </mesh>
          )}
        </Suspense>
      </ModelBoundary>
    ) : (
      procedural
    )
  }

  return (
    <group
      position={[0, y, front ? g.frontZ : g.rearZ]}
      rotation={[0, front ? 0 : Math.PI, 0]}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      visible={!dimmed}
      userData={{ placementId: placement.id }}
    >
      {body}
      {needsAdapter &&
        [-1, 1].map((s) => {
          const w = (g.panelW - ownPanelW) / 2
          return (
            <mesh key={s} position={[s * (ownPanelW / 2 + w / 2), h / 2, 1.25]}>
              <boxGeometry args={[w, h - 0.8, 2.5]} />
              <meshStandardMaterial color={effLook === 'cad' ? theme.cadBody : '#3a3d42'} roughness={0.7} />
              <Outline p={p} />
            </mesh>
          )
        })}
    </group>
  )
}
