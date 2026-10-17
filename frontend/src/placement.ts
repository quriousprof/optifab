import { Plane, Vector3, type Raycaster } from 'three'
import { FLOOR_SIZE, fitsFloor, footprint, type FactoryComponentType, type FloorPosition } from './factoryComponents.ts'

const floorPlane = new Plane(new Vector3(0, 1, 0), 0)
const DRAG_THRESHOLD = 5

/** Raw [x, z] where the ray meets the floor plane. */
export function floorPoint(raycaster: Raycaster): [number, number] | null {
  const point = raycaster.ray.intersectPlane(floorPlane, new Vector3())
  return point && [point.x, point.z]
}

export function getSnappedFloorPosition(raycaster: Raycaster, type: FactoryComponentType, extent: [number, number] = footprint(type)): FloorPosition | null {
  const point = raycaster.ray.intersectPlane(floorPlane, new Vector3())
  if (!point) return null

  const x = Math.round(point.x) || 0
  const z = Math.round(point.z) || 0
  const halfFloor = FLOOR_SIZE / 2

  // Keep the entire footprint on the finite factory floor, not the infinite backdrop.
  if (Math.abs(point.x) > halfFloor || Math.abs(point.z) > halfFloor ||
    !fitsFloor(x, z, extent[0], extent[1])) return null

  return [x, 0, z]
}

type PlacementPointer = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'button' | 'isPrimary' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>

export type PlacementGesture = {
  pointerId: number
  clientX: number
  clientY: number
  dragged: boolean
}

export function isPlacementPointer(event: PlacementPointer): boolean {
  return event.button === 0 && event.isPrimary && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
}

export function trackPlacementDrag(gesture: PlacementGesture, event: Pick<PlacementPointer, 'clientX' | 'clientY'>): void {
  if (Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) > DRAG_THRESHOLD) gesture.dragged = true
}

export function isPlacementClick(gesture: PlacementGesture | null, event: PlacementPointer): boolean {
  if (!gesture || gesture.pointerId !== event.pointerId || !isPlacementPointer(event)) return false
  trackPlacementDrag(gesture, event)
  return !gesture.dragged
}
