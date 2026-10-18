import assert from 'node:assert/strict'
import { test } from 'node:test'
import { connectedPorts, linkedAssembly } from '../src/connections.ts'
import { fitsFloor, machineFootprint } from '../src/factoryComponents.ts'
import { PRESET_FLOOR, presetLayout } from '../src/presetLayout.ts'

test('preset has the nine labelled machines plus both docks', () => {
  const layout = presetLayout()
  const labels = layout.filter((m) => m.label).map((m) => m.label).sort()
  assert.deepEqual(labels, ['C1', 'C2', 'C3', 'C4', 'F1', 'F2', 'F3', 'I1', 'I2'])
  assert.equal(layout.filter((m) => m.componentType === 'raw-material').length, 1)
  assert.equal(layout.filter((m) => m.componentType === 'finished-goods').length, 1)
})

test('everything is one connected line from the input dock to the output dock', () => {
  const layout = presetLayout()
  const raw = layout.find((m) => m.componentType === 'raw-material')
  const linked = linkedAssembly(raw.id, layout)
  for (const belt of layout.filter((m) => m.componentType === 'conveyor-belt')) {
    assert.ok(linked.has(belt.id), `${belt.id} is reachable from the input dock`)
    const ports = connectedPorts(belt, layout)
    assert.ok(ports.in && ports.out, `${belt.id} is joined at both ends`)
  }
  assert.ok(linked.has(layout.find((m) => m.componentType === 'finished-goods').id))
})

test('preset sits on the floor', () => {
  for (const m of presetLayout()) {
    const [w, d] = machineFootprint(m)
    assert.ok(fitsFloor(m.position[0], m.position[2], w, d, PRESET_FLOOR), `${m.id} is off the floor`)
  }
})
