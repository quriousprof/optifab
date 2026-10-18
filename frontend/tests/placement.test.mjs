import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OrthographicCamera, Raycaster, Vector2, Vector3 } from 'three'
import { FACTORY_COMPONENTS, FLOOR_SIZE, footprint } from '../src/factoryComponents.ts'
import { getSnappedFloorPosition, isPlacementClick, isPlacementPointer, trackPlacementDrag } from '../src/placement.ts'

function rayAt(x, z) {
  return new Raycaster(new Vector3(x, 30, z), new Vector3(0, -1, 0))
}

test('all component types snap positive and negative coordinates to whole units', () => {
  for (const component of FACTORY_COMPONENTS) {
    assert.deepEqual(getSnappedFloorPosition(rayAt(12.6, -8.6), component.type), [13, 0, -9])
    assert.deepEqual(getSnappedFloorPosition(rayAt(-0.5, 0.5), component.type), [0, 0, 1])
  }
})

test('raycasting matches the floor under an isometric orthographic pointer', () => {
  const camera = new OrthographicCamera(-80, 80, 50, -50, 0.1, 10000)
  camera.position.set(60, 60, 60)
  camera.lookAt(0, 0, 0)
  camera.zoom = 2
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  const screenPoint = new Vector3(11.2, 0, -7.8).project(camera)
  const raycaster = new Raycaster()
  const pointer = new Vector2(screenPoint.x, screenPoint.y)
  raycaster.setFromCamera(pointer, camera)
  assert.deepEqual(getSnappedFloorPosition(raycaster, 'cutting-machine'), [11, 0, -8])

  // Keep the same screen pointer while panning the camera along the floor.
  camera.position.x += 10
  camera.updateMatrixWorld()
  raycaster.setFromCamera(pointer, camera)
  assert.deepEqual(getSnappedFloorPosition(raycaster, 'cutting-machine'), [21, 0, -8])
})

test('placement rejects the infinite backdrop and machine footprints beyond the floor', () => {
  const edge = FLOOR_SIZE / 2
  assert.equal(getSnappedFloorPosition(rayAt(edge + 1, 0), 'conveyor-belt'), null)
  assert.equal(getSnappedFloorPosition(rayAt(edge - 0.4, 0), 'conveyor-belt'), null) // rounds to 50, so it would overhang
  assert.equal(getSnappedFloorPosition(rayAt(edge - 1, 0), 'conveyor-belt'), null)
  assert.deepEqual(getSnappedFloorPosition(rayAt(edge - 2, 0), 'conveyor-belt'), [48, 0, 0])
  assert.equal(getSnappedFloorPosition(rayAt(edge - 1, 0), 'conveyor-belt', [6, 2]), null)
  assert.equal(getSnappedFloorPosition(rayAt(0, -edge + 1), 'cutting-machine'), null)
})

test('a rotated deposit uses its resized breadth and length for floor bounds', () => {
  assert.deepEqual(footprint('raw-material', 12, 1, 8), [8, 12])
  assert.deepEqual(footprint('finished-goods', 10, 0, 7), [10, 7])
})

test('rays parallel to or pointing away from the floor have no preview', () => {
  assert.equal(getSnappedFloorPosition(new Raycaster(new Vector3(0, 10, 0), new Vector3(1, 0, 0)), 'forming-machine'), null)
  assert.equal(getSnappedFloorPosition(new Raycaster(new Vector3(0, 10, 0), new Vector3(0, 1, 0)), 'forming-machine'), null)
})

const pointer = (changes = {}) => ({
  pointerId: 1, clientX: 200, clientY: 300, button: 0, isPrimary: true,
  shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...changes,
})
const gesture = () => ({ pointerId: 1, clientX: 200, clientY: 300, dragged: false })

test('an unmodified primary click places; right-click and camera modifiers do not', () => {
  assert.equal(isPlacementClick(gesture(), pointer()), true)
  for (const changes of [{ button: 2 }, { button: 1 }, { shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { isPrimary: false }]) {
    assert.equal(isPlacementPointer(pointer(changes)), false)
    assert.equal(isPlacementClick(gesture(), pointer(changes)), false)
  }
})

test('camera drags never place, even if the pointer returns to the starting pixel', () => {
  const drag = gesture()
  trackPlacementDrag(drag, pointer({ clientX: 240 }))
  trackPlacementDrag(drag, pointer())
  assert.equal(isPlacementClick(drag, pointer()), false)
  assert.equal(isPlacementClick(gesture(), pointer({ clientY: 340 })), false)
})

test('tiny pointer jitter is accepted, but canceled or different pointer gestures are not', () => {
  assert.equal(isPlacementClick(gesture(), pointer({ clientX: 202, clientY: 301 })), true)
  assert.equal(isPlacementClick(null, pointer()), false)
  assert.equal(isPlacementClick(gesture(), pointer({ pointerId: 2 })), false)
})
