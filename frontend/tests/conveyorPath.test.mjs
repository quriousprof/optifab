import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { beltPoint, beltTangent } from '../src/conveyorPath.ts'
import { beltCoverage, sweepBelt } from '../src/conveyorGeometry.ts'

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
