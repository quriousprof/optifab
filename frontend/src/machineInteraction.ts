import { Box3, Mesh, Vector3, type Camera, type Object3D, type OrthographicCamera, type Raycaster } from 'three'
import { WORKSTATION_HEIGHT, getFactoryComponent, machineDepth, machineWidth, type PlacedMachine } from './factoryComponents.ts'

export function shouldStartMarquee(event: Pick<PointerEvent, 'pointerType' | 'button' | 'isPrimary' | 'shiftKey' | 'altKey'>, placing: boolean, hitMachine: boolean): boolean {
  return !placing && !hitMachine && event.pointerType !== 'touch' && event.button === 0 && event.isPrimary && !event.shiftKey && !event.altKey
}

export function pickMachine(raycaster: Raycaster, scene: Object3D): string | null {
  const meshes: Object3D[] = []
  scene.updateMatrixWorld(true)
  scene.traverse((object) => {
    if (object instanceof Mesh && typeof object.userData.machineId === 'string') meshes.push(object)
  })
  return raycaster.intersectObjects(meshes, false)[0]?.object.userData.machineId ?? null
}

/** Select any machine whose projected geometry intersects the screen-space marquee. */
export function machinesInRectangle(scene: Object3D, camera: Camera, viewport: { left: number; top: number; width: number; height: number }, rectangle: { left: number; top: number; right: number; bottom: number }): string[] {
  const bounds = new Map<string, { left: number; top: number; right: number; bottom: number }>()
  scene.updateMatrixWorld(true)
  camera.updateMatrixWorld()
  scene.traverse((object) => {
    if (!(object instanceof Mesh) || typeof object.userData.machineId !== 'string' || !object.visible) return
    const geometry = object.geometry
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return
    const box = new Box3().copy(geometry.boundingBox).applyMatrix4(object.matrixWorld)
    const id = object.userData.machineId as string
    const projected = bounds.get(id) ?? { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new Vector3(x, y, z).project(camera)
      const screenX = viewport.left + (point.x + 1) * viewport.width / 2
      const screenY = viewport.top + (1 - point.y) * viewport.height / 2
      projected.left = Math.min(projected.left, screenX); projected.right = Math.max(projected.right, screenX)
      projected.top = Math.min(projected.top, screenY); projected.bottom = Math.max(projected.bottom, screenY)
    }
    bounds.set(id, projected)
  })
  return [...bounds].filter(([, box]) => box.left <= rectangle.right && box.right >= rectangle.left && box.top <= rectangle.bottom && box.bottom >= rectangle.top).map(([id]) => id)
}

export function explicitSelection(ids: string[], machines: PlacedMachine[]): Set<string> {
  const selected = new Set(ids)
  const groups = new Set(machines.filter((machine) => selected.has(machine.id) && machine.groupId).map((machine) => machine.groupId))
  for (const machine of machines) if (machine.groupId && groups.has(machine.groupId)) selected.add(machine.id)
  return selected
}

export type MachineClick = { machineId: string; time: number; x: number; y: number }

export function isDoubleMachineClick(previous: MachineClick | null, current: MachineClick): boolean {
  return previous !== null && previous.machineId === current.machineId &&
    current.time - previous.time >= 0 && current.time - previous.time <= 400 &&
    Math.hypot(current.x - previous.x, current.y - previous.y) <= 5
}

export type CameraFocus = { position: Vector3; target: Vector3; zoom: number }

export function getMachineFocus(machine: PlacedMachine, camera: OrthographicCamera, orbitTarget: Vector3, width: number, height: number): CameraFocus {
  const dimensions = [machineWidth(machine.componentType, machine.length), getFactoryComponent(machine.componentType).dimensions[1], machineDepth(machine.componentType, machine.breadth)]
  const target = new Vector3(...machine.position).add(new Vector3(0, dimensions[1] / 2 + (machine.workstationId ? WORKSTATION_HEIGHT : 0), 0))
  const offset = camera.position.clone().sub(orbitTarget)
  return {
    target,
    position: target.clone().add(offset),
    zoom: Math.min(80, Math.max(12, Math.min(width * 0.35, height * 0.28) / Math.max(...dimensions))),
  }
}

export function advanceCameraFocus(camera: OrthographicCamera, target: Vector3, goal: CameraFocus, delta: number): boolean {
  const alpha = 1 - Math.exp(-8 * Math.max(0, delta))
  camera.position.lerp(goal.position, alpha)
  target.lerp(goal.target, alpha)
  camera.zoom += (goal.zoom - camera.zoom) * alpha
  const complete = camera.position.distanceToSquared(goal.position) < 0.0001 &&
    target.distanceToSquared(goal.target) < 0.0001 && Math.abs(camera.zoom - goal.zoom) < 0.01
  if (complete) {
    camera.position.copy(goal.position)
    target.copy(goal.target)
    camera.zoom = goal.zoom
  }
  camera.updateProjectionMatrix()
  return complete
}
