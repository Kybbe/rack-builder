import { useMemo, useState } from 'react'
import { Edges, Html, Instance, Instances, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import monoFont from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff?url'
import type { Rack, UnitSystem } from '../domain/types'
import { rackGeometry } from '../domain/geometry'
import { HOLE_OFFSETS_MM, U_MM, formatU } from '../domain/units'
import type { SceneTheme } from './sceneTheme'

interface Props {
  rack: Rack
  theme: SceneTheme
  units: UnitSystem
}

const POST_D = 22

export function RackFrame({ rack, theme, units }: Props) {
  const g = rackGeometry(rack)
  const [hoverU, setHoverU] = useState<number | null>(null)
  const innerH = rack.heightU * U_MM
  const postX = g.openingW / 2 + g.railW / 2
  const postZ = rack.depthMm / 2 - POST_D / 2
  const midY = g.u1Y + innerH / 2
  const beamY = [g.u1Y - g.capMm / 2, g.u1Y + innerH + g.capMm / 2]

  const holes = useMemo(() => {
    const out: [number, number, number][] = []
    for (let u = 0; u < rack.heightU; u++)
      for (const off of HOLE_OFFSETS_MM)
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            out.push([sx * postX, g.u1Y + u * U_MM + off, sz * (rack.depthMm / 2 + 0.2)])
    return out
  }, [rack.heightU, rack.depthMm, postX, g.u1Y])

  const labelEvery = rack.heightU > 30 ? 2 : 1
  const onRuler = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const u = Math.floor((e.point.y * 1000 - g.u1Y) / U_MM) + 1
    setHoverU(u >= 1 && u <= rack.heightU ? u : null)
  }

  const frameMat = <meshStandardMaterial color={theme.frame} roughness={0.7} metalness={0.3} />

  return (
    <group>
      {/* four posts */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * postX, midY, sz * postZ]}>
            <boxGeometry args={[g.railW, innerH, POST_D]} />
            {frameMat}
            <Edges color={theme.edge} threshold={15} />
          </mesh>
        )),
      )}
      {/* top and bottom frames */}
      {beamY.map((y) => (
        <group key={y} position={[0, y, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={`x${s}`} position={[0, 0, s * postZ]}>
              <boxGeometry args={[g.outerW, g.capMm, POST_D]} />
              {frameMat}
              <Edges color={theme.edge} threshold={15} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`z${s}`} position={[s * (g.outerW / 2 - g.railW / 2), 0, 0]}>
              <boxGeometry args={[g.railW, g.capMm, rack.depthMm - POST_D * 2]} />
              {frameMat}
              <Edges color={theme.edge} threshold={15} />
            </mesh>
          ))}
        </group>
      ))}
      {/* mounting holes */}
      <Instances limit={holes.length} key={holes.length}>
        <boxGeometry args={[6, 6, 1]} />
        <meshBasicMaterial color={theme.background} />
        {holes.map((p, i) => (
          <Instance key={i} position={p} />
        ))}
      </Instances>
      {/* U numbers on the left front rail, and the strip that reacts to hovering */}
      {Array.from({ length: rack.heightU }, (_, i) => i + 1)
        .filter((u) => u % labelEvery === 0 || u === 1)
        .map((u) => (
          <Text
            key={u}
            font={monoFont}
            fontSize={11}
            color={hoverU === u ? theme.accent : theme.text}
            anchorX="right"
            anchorY="middle"
            position={[-g.outerW / 2 - 8, g.u1Y + (u - 0.5) * U_MM, rack.depthMm / 2]}
          >
            {u}
          </Text>
        ))}
      <mesh
        position={[-g.outerW / 2 - 20, midY, rack.depthMm / 2]}
        onPointerMove={onRuler}
        onPointerOut={() => setHoverU(null)}
      >
        <planeGeometry args={[46, innerH]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hoverU !== null && (
        <group position={[0, g.u1Y + (hoverU - 0.5) * U_MM, rack.depthMm / 2 + 1]}>
          <mesh>
            <planeGeometry args={[g.panelW, U_MM]} />
            <meshBasicMaterial color={theme.accent} transparent opacity={0.12} depthWrite={false} />
          </mesh>
          <Html
            position={[-g.panelW / 2, U_MM / 2, 0]}
            center={false}
            zIndexRange={[20, 0]}
            className="scene-tip-anchor"
          >
            <div className="scene-tip" role="tooltip">
              <strong>U{hoverU}</strong>
              <span>{formatU(1, units)}</span>
              <span className="scene-tip__sub">
                {(((hoverU - 1) * U_MM) / (units === 'mm' ? 10 : 25.4)).toFixed(1)}{' '}
                {units === 'mm' ? 'cm' : 'in'} from the bottom rail
              </span>
            </div>
          </Html>
        </group>
      )}
      {/* enclosure */}
      {rack.style === 'enclosed' &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * (g.outerW / 2 + 1), midY, 0]}>
            <boxGeometry args={[1.5, innerH + g.capMm * 2, rack.depthMm]} />
            <meshStandardMaterial color={theme.frame} transparent opacity={0.22} depthWrite={false} />
            <Edges color={theme.edge} threshold={15} />
          </mesh>
        ))}
      {rack.style === 'enclosed' && (
        <mesh position={[0, g.u1Y + innerH + g.capMm + 1, 0]}>
          <boxGeometry args={[g.outerW, 1.5, rack.depthMm]} />
          <meshStandardMaterial color={theme.frame} transparent opacity={0.22} depthWrite={false} />
          <Edges color={theme.edge} threshold={15} />
        </mesh>
      )}
      {rack.style === 'wall' && (
        <mesh position={[0, midY, -rack.depthMm / 2 - 2]}>
          <boxGeometry args={[g.outerW + 60, innerH + g.capMm * 2 + 60, 3]} />
          <meshStandardMaterial color={theme.frame} transparent opacity={0.3} depthWrite={false} />
          <Edges color={theme.edge} threshold={15} />
        </mesh>
      )}
      {/* wheels or feet */}
      {rack.style !== 'wall' &&
        [-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => {
            const x = sx * (g.outerW / 2 - 16)
            const z = sz * (rack.depthMm / 2 - 16)
            return rack.casters ? (
              <group key={`${sx}${sz}`} position={[x, 0, z]}>
                <mesh position={[0, 22, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[22, 22, 16, 24]} />
                  <meshStandardMaterial color={theme.cadDetail} roughness={0.9} />
                  <Edges color={theme.edge} threshold={30} />
                </mesh>
                <mesh position={[0, 50, 0]}>
                  <boxGeometry args={[30, 12, 30]} />
                  {frameMat}
                  <Edges color={theme.edge} threshold={15} />
                </mesh>
              </group>
            ) : (
              <mesh key={`${sx}${sz}`} position={[x, 6, z]}>
                <cylinderGeometry args={[11, 13, 12, 20]} />
                <meshStandardMaterial color={theme.cadDetail} roughness={0.9} />
              </mesh>
            )
          }),
        )}
    </group>
  )
}
