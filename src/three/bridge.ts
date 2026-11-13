import * as THREE from 'three'
import type { Rack, Side } from '../domain/types'
import { rackGeometry } from '../domain/geometry'

/** The scene is modelled in millimetres and drawn in metres. */
export const MM = 0.001

/** Lets DOM drag events ask the 3D scene where the pointer is. Set by the Canvas once it exists. */
export const bridge: { camera: THREE.Camera | null; el: HTMLElement | null } = { camera: null, el: null }

const raycaster = new THREE.Raycaster()
const plane = new THREE.Plane()
const hit = new THREE.Vector3()

/** The point under the pointer on the face of the rack the camera is looking at. */
export function pointOnRack(
  clientX: number,
  clientY: number,
  rack: Rack,
): { yMm: number; side: Side } | null {
  const { camera, el } = bridge
  if (!camera || !el) return null
  const rect = el.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(ndc, camera)
  const g = rackGeometry(rack)
  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  // Looking towards -z means we see the front of the rack.
  const side: Side = dir.z <= 0 ? 'front' : 'rear'
  const z = (side === 'front' ? g.frontZ : g.rearZ) * MM
  plane.set(new THREE.Vector3(0, 0, 1), -z)
  if (!raycaster.ray.intersectPlane(plane, hit)) return null
  return { yMm: hit.y / MM, side }
}
