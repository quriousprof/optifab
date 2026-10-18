import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { changedOperations, disruptedOperations } from '../src/api.ts'

const baseline = JSON.parse(readFileSync(new URL('../../docs/baseline-schedule.json', import.meta.url), 'utf8'))

test('failing F1 at minute 6 cancels exactly J1-forming and J5-forming', () => {
  assert.deepEqual([...disruptedOperations(baseline, ['F1'], 6)].sort(), ['J1-forming', 'J5-forming'])
})

test('failing F2 cancels J3-forming and J4-forming; finished work is untouched', () => {
  assert.deepEqual([...disruptedOperations(baseline, ['F2'], 6)].sort(), ['J3-forming', 'J4-forming'])
  assert.equal(disruptedOperations(baseline, ['F1'], 100).size, 0)
})

test('changedOperations reports moved or retimed operations only', () => {
  const moved = { ...baseline, operations: baseline.operations.map((op) => op.operationId === 'J1-forming' ? { ...op, machineId: 'F3', start: 6, end: 13 } : op) }
  assert.deepEqual([...changedOperations(baseline, moved)], ['J1-forming'])
  assert.equal(changedOperations(baseline, baseline).size, 0)
})
