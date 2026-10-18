import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BoxGeometry, CylinderGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, Raycaster, Scene, Vector3 } from 'three'
import { pickMachine, isDoubleMachineClick, getMachineFocus, advanceCameraFocus } from '../src/machineInteraction.ts'

test('machine picking ignores the ghost and floor and chooses the nearest solid machine', () => {
  const scene = new Scene()
  for (const [id, y] of [[undefined, 8], ['near', 5], ['far', 2]]) {
    const mesh = new Mesh(new BoxGeometry(3, 2, 3), new MeshBasicMaterial())
    mesh.position.y = y
    if (id) mesh.userData.machineId = id
    scene.add(mesh)
  }
  const ray = new Raycaster(new Vector3(0, 20, 0), new Vector3(0, -1, 0))
  assert.equal(pickMachine(ray, scene), 'near')
  ray.ray.origin.x = 10
  assert.equal(pickMachine(ray, scene), null)
})

test('a cylinder is selected by its actual surface, not the corners of its bounding box', () => {
  const scene = new Scene()
  const cylinder = new Mesh(new CylinderGeometry(1.5, 1.5, 4, 32), new MeshBasicMaterial())
  cylinder.userData.machineId = 'robot'
  cylinder.position.y = 2
  scene.add(cylinder)
  const ray = new Raycaster(new Vector3(1.4, 20, 1.4), new Vector3(0, -1, 0))
  assert.equal(pickMachine(ray, scene), null)
  ray.ray.origin.set(0, 20, 0)
  assert.equal(pickMachine(ray, scene), 'robot')
})

test('double-click focus requires consecutive nearby clicks on the same machine', () => {
  const first = { machineId: 'robot', time: 1000, x: 300, y: 400 }
  const second = { ...first, time: 1250, x: 302 }
  assert.equal(isDoubleMachineClick(first, second), true)
  assert.equal(isDoubleMachineClick(null, second), false)
  assert.equal(isDoubleMachineClick(first, { ...second, machineId: 'conveyor' }), false)
  assert.equal(isDoubleMachineClick(first, { ...second, time: 1800 }), false)
  assert.equal(isDoubleMachineClick(first, { ...second, x: 320 }), false)
})

const machine = { id: 'press', componentType: 'forming-machine', position: [12, 0, -8] }
function cameraSetup() {
  const camera = new OrthographicCamera(-720, 720, 450, -450, 0.1, 10000)
  camera.position.set(60, 60, 60)
  camera.zoom = 8
  return { camera, target: new Vector3() }
}

test('focus frames the selected machine while preserving the isometric viewing direction', () => {
  const { camera, target } = cameraSetup()
  const goal = getMachineFocus(machine, camera, target, 1440, 900)
  assert.deepEqual(goal.target.toArray(), [12, 1.7, -8])
  assert.deepEqual(goal.position.clone().sub(goal.target).toArray(), [60, 60, 60])
  assert(goal.zoom > camera.zoom && goal.zoom <= 80)
})

test('camera easing moves smoothly, converges exactly, and is independent of frame rate', () => {
  const a = cameraSetup()
  const b = cameraSetup()
  const goal = getMachineFocus(machine, a.camera, a.target, 1440, 900)
  assert.equal(advanceCameraFocus(a.camera, a.target, goal, 1 / 60), false)
  assert(a.camera.zoom > 8 && a.camera.zoom < goal.zoom)
  for (let i = 1; i < 30; i++) advanceCameraFocus(a.camera, a.target, goal, 1 / 60)
  for (let i = 0; i < 15; i++) advanceCameraFocus(b.camera, b.target, goal, 1 / 30)
  assert(a.camera.position.distanceTo(b.camera.position) < 1e-8)
  assert(Math.abs(a.camera.zoom - b.camera.zoom) < 1e-8)
  let complete = false
  for (let i = 0; i < 120 && !complete; i++) complete = advanceCameraFocus(a.camera, a.target, goal, 1 / 60)
  assert(complete)
  assert.deepEqual(a.camera.position.toArray(), goal.position.toArray())
  assert.deepEqual(a.target.toArray(), goal.target.toArray())
  assert.equal(a.camera.zoom, goal.zoom)
})
