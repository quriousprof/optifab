import assert from 'node:assert/strict'
import { test } from 'node:test'
import { connectedPorts, linkedAssembly } from '../src/connections.ts'
import { fitsFloor, machineFootprint } from '../src/factoryComponents.ts'
import { presetLayout } from '../src/presetLayout.ts'

test('preset has the nine labelled machines plus both docks', () => {
  const layout = presetLayout()
  const labels = layout.filter((m) => m.label).map((m) => m.label).sort()
  assert.deepEqual(labels, ['C1', 'C2', 'C3', 'C4', 'F1', 'F2', 'F3', 'I1', 'I2'])
  assert.equal(layout.filter((m) => m.componentType === 'raw-material').length, 1)
  assert.equal(layout.filter((m) => m.componentType === 'finished-goods').length, 1)
})

test('everything is one connected line from the input dock to the output dock', () => {
  const layout = presetLayout()
  assert.equal(linkedAssembly('preset-raw', layout).size, layout.length)
  assert.equal(layout.filter((m) => m.componentType === 'conveyor-belt').length, 16)
  for (const belt of layout.filter((m) => m.componentType === 'conveyor-belt')) {
    const ports = connectedPorts(belt, layout)
    assert.ok(ports.in && ports.out, `${belt.id} is joined at both ends`)
  }
})

test('preset sits on the floor without overlapping machines', () => {
  const layout = presetLayout()
  const boxes = layout.filter((m) => m.componentType !== 'conveyor-belt').map((m) => {
    const [w, d] = machineFootprint(m)
    assert.ok(fitsFloor(m.position[0], m.position[2], w, d))
    return { x: m.position[0], z: m.position[2], w, d }
  })
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
    assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2, 'machines overlap')
  }
})
