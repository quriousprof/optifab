import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getLayout, saveLayout } from '../src/api.ts'

test('layout save and load preserve dimensions and component labels', async () => {
  const originalFetch = globalThis.fetch
  let saved
  globalThis.fetch = async (path, options) => {
    assert.equal(path, '/api/layouts/My%20Factory')
    if (options?.method === 'PUT') saved = JSON.parse(options.body)
    return { ok: true, json: async () => saved }
  }
  try {
    const machines = [
      { id: 'belt', componentType: 'conveyor-belt', position: [4, 0, 0], length: 22.5, angle: 0.4, displayLabel: 'Inbound belt' },
      { id: 'station', componentType: 'workstation', position: [0, 0, 0], length: 25, breadth: 18, displayLabel: 'Cell A' },
      { id: 'cutter', componentType: 'cutting-machine', position: [10, 0, 0], label: 'C1', displayLabel: 'Laser cutter' },
    ]
    const floor = { width: 240, depth: 160 }
    await saveLayout('My Factory', machines, floor)
    const loaded = await getLayout('My Factory')
    assert.deepEqual(loaded.floor, floor)
    assert.deepEqual(loaded.machines.map(({ length, breadth }) => [length, breadth]), [[22.5, 2.4], [25, 18], [6, 4]])
    assert.equal(loaded.machines[0].angle, 0.4)
    assert.equal(loaded.machines[2].label, 'C1')
    assert.deepEqual(loaded.machines.map(({ displayLabel }) => displayLabel), ['Inbound belt', 'Cell A', 'Laser cutter'])
    assert.equal(machines[2].length, undefined)
    const updatedMachines = machines.map((machine, index) => {
      if (index === 0) {
        const { displayLabel, ...unlabelled } = machine
        return unlabelled
      }
      return index === 2 ? { ...machine, displayLabel: 'Cutter renamed' } : machine
    })
    await saveLayout('My Factory', updatedMachines, floor)
    const updated = await getLayout('My Factory')
    assert.equal(updated.machines[0].displayLabel, undefined)
    assert.equal(updated.machines[2].displayLabel, 'Cutter renamed')
    assert.equal(updated.machines[2].label, 'C1')
  } finally {
    globalThis.fetch = originalFetch
  }
})
