import { Mesh, Vector3, type Object3D, type OrthographicCamera, type Raycaster } from 'three'
import { getFactoryComponent, machineWidth, type PlacedMachine } from './factoryComponents.ts'

export function pickMachine(raycaster: Raycaster, scene: Object3D): string | null {
  const meshes: Object3D[] = []
  scene.updateMatrixWorld(true)
  scene.traverse((object) => {
    if (object instanceof Mesh && typeof object.userData.machineId === 'string') meshes.push(object)
  })
  return raycaster.intersectObjects(meshes, false)[0]?.object.userData.machineId ?? null
}

export type MachineClick = { machineId: string; time: number; x: number; y: number }

export function isDoubleMachineClick(previous: MachineClick | null, current: MachineClick): boolean {
  return previous !== null && previous.machineId === current.machineId &&
    current.time - previous.time >= 0 && current.time - previous.time <= 400 &&
    Math.hypot(current.x - previous.x, current.y - previous.y) <= 5
}

export type CameraFocus = { position: Vector3; target: Vector3; zoom: number }

export function getMachineFocus(machine: PlacedMachine, camera: OrthographicCamera, orbitTarget: Vector3, width: number, height: number): CameraFocus {
  const dimensions = [machineWidth(machine.componentType, machine.length), ...getFactoryComponent(machine.componentType).dimensions.slice(1)]
  const target = new Vector3(...machine.position).add(new Vector3(0, dimensions[1] / 2, 0))
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
