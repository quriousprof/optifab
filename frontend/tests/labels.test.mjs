import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoLabel, relabel } from '../src/factoryComponents.ts'

const machine = (id, componentType, label) => ({ id, componentType, position: [0, 0, 0], ...(label && { label }) })

test('autoLabel assigns the lowest free stage ID and keeps existing labels', () => {
  const labelled = autoLabel([
    machine('a', 'forming-machine', 'F2'),
    machine('b', 'forming-machine'),
    machine('c', 'forming-machine'),
    machine('d', 'cutting-machine'),
    machine('e', 'conveyor-belt'),
  ])
  assert.deepEqual(labelled.map((m) => m.label), ['F2', 'F1', 'F3', 'C1', undefined])
})

test('relabel swaps with the machine that held the ID', () => {
  const swapped = relabel([machine('a', 'forming-machine', 'F1'), machine('b', 'forming-machine', 'F2')], 'b', 'F1')
  assert.deepEqual(swapped.map((m) => m.label), ['F2', 'F1'])
})
