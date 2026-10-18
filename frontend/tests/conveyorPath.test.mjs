import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { beltPoint, beltTangent, beltTrimParameter } from '../src/conveyorPath.ts'
import { beltCoverage, rampHeight, sweepBelt, sweepRamp } from '../src/conveyorGeometry.ts'

test('curved conveyor strip has a pickable top face along its entire bend', () => {
  const path = { position: [0, 0, 0], length: 10, angle: 0, entryAngle: -Math.PI / 3 }
  const geometry = sweepBelt(path, 0, 1, 2.2, 0.085, 0.635)
  const mesh = new Mesh(geometry, new MeshBasicMaterial())
  mesh.updateMatrixWorld()
  for (const t of [0.1, 0.4, 0.7, 0.9]) {
    const [x, z] = beltPoint(path, t)
    const hit = new Raycaster(new Vector3(x, 5, z), new Vector3(0, -1, 0)).intersectObject(mesh)[0]
    assert.ok(hit, `missing top face at ${t}`)
    assert.ok(hit.face.normal.y > 0.9)
  }
  const [dx, dz] = beltTangent(path, 0)
  assert.ok(Math.abs(Math.atan2(-dz, dx) + Math.PI / 3) < 1e-6)
  geometry.dispose()
  mesh.material.dispose()
})

test('overlapping branch strips can open an interior rail while keeping its exterior edge', () => {
  const trunk = { position: [10, 0, 0], length: 20, angle: 0 }
  const covers = beltCoverage(trunk, 1.1)
  assert.equal(covers([10, 0.7]), true)
  assert.equal(covers([10, 1.15]), false)
  const full = sweepBelt(trunk, 0, 1, 0.12, 0.61, 0.93, 1.04)
  const open = sweepBelt(trunk, 0, 1, 0.12, 0.61, 0.93, 1.04, (t) => t < 0.3 || t > 0.7)
  assert.ok(open.index.count < full.index.count)
  assert.ok(open.index.count > 0)
  full.dispose(); open.dispose()
})

test('workstation ramp meets both belt surfaces with flat end tangents', () => {
  const geometry = sweepRamp(0.5, 0, 2.2, 0.085, 0.635)
  const positions = geometry.getAttribute('position')
  assert.ok(Math.abs(positions.getY(0) - (0.5 + 0.635)) < 1e-6)
  assert.ok(Math.abs(positions.getY(20 * 4) - 0.635) < 1e-6)
  assert.equal(rampHeight(0.5, 0, 0), 0.25)
  assert.ok(Math.abs(positions.getY(4) - positions.getY(0)) < 0.004)
  assert.ok(Math.abs(positions.getY(20 * 4) - positions.getY(19 * 4)) < 0.004)
  geometry.dispose()
})

test('curved belt ends reserve one world unit for a workstation ramp', () => {
  const path = { position: [0, 0, 0], length: 10, angle: 0, entryAngle: -Math.PI / 3, exitAngle: Math.PI / 4 }
  for (const side of ['start', 'end']) {
    const t = beltTrimParameter(path, side)
    const at = beltPoint(path, t), end = beltPoint(path, side === 'start' ? 0 : 1)
    assert.ok(Math.abs(Math.hypot(at[0] - end[0], at[1] - end[1]) - 1) < 1e-5)
  }
})
