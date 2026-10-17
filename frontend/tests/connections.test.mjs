import assert from 'node:assert/strict'
import { test } from 'node:test'
import { connectedPorts, cornerTiles, mergeConveyors, conveyorRun, layConveyor, resizeConveyor, rotateMachine, snapToConnections } from '../src/connections.ts'

const belt = { id: 'b', componentType: 'conveyor-belt', position: [0, 0, 0], length: 6 } // ports at x=-3 (in) / x=3 (out)
const cnc = { id: 'c', componentType: 'cnc-milling-machine', position: [5, 0, 0] } // width 4: in-port at x=3

test('a candidate snaps its in-port onto a nearby out-port', () => {
  assert.deepEqual(snapToConnections('cnc-milling-machine', undefined, 0, [6, 0, 1], [belt]), [5, 0, 0])
  assert.deepEqual(snapToConnections('cnc-milling-machine', undefined, 0, [20, 0, 0], [belt]), [20, 0, 0])
})

test('out-to-out does not snap, and ports may not face each other', () => {
  assert.deepEqual(snapToConnections('cnc-milling-machine', undefined, 0, [1.5, 0, 0], [belt]), [1.5, 0, 0])
  assert.deepEqual(snapToConnections('cnc-milling-machine', undefined, 2, [5, 0, 0], [belt]), [5, 0, 0])
})

test('a perpendicular machine snaps around a corner tile', () => {
  // belt out-port (3,0); the corner tile is centred (4,0); a belt turning toward +Z starts at (4,1)
  assert.deepEqual(snapToConnections('cnc-milling-machine', undefined, 3, [4, 0, 2.5], [belt]), [4, 0, 3])
})

test('right-angle belts report a connection and a corner tile', () => {
  const turn = { id: 't', componentType: 'conveyor-belt', position: [4, 0, 2], rotation: 3, length: 2 } // in-port (4,1)
  assert.deepEqual(connectedPorts(belt, [belt, turn]), { in: false, out: true })
  assert.deepEqual(connectedPorts(turn, [belt, turn]), { in: true, out: false })
  assert.deepEqual(cornerTiles([belt, turn]).map(({ center, ids }) => ({ center, ids })), [{ center: [4, 0], ids: ['b', 't'] }])
  assert.deepEqual([...conveyorRun('t', [belt, turn])].sort(), ['b', 't'])
  assert.equal(mergeConveyors([belt, turn]).length, 2) // a turn never fuses
})

test('mated ports are reported on both machines', () => {
  assert.deepEqual(connectedPorts(belt, [belt, cnc]), { in: false, out: true })
  assert.deepEqual(connectedPorts(cnc, [belt, cnc]), { in: true, out: false })
})

test('resizing keeps the connected end fixed and respects limits', () => {
  assert.equal(resizeConveyor(belt, [belt], 10).position[0], 2) // start stays at -3
  assert.equal(resizeConveyor(belt, [belt, cnc], 10).position[0], -2) // output end stays at 3
  assert.equal(resizeConveyor(belt, [belt], 1000).length, 6) // 100 long would leave the floor, so it is refused
  assert.equal(resizeConveyor(belt, [belt], 40).length, 40)
})

test('laying drags out a conveyor along the dominant axis', () => {
  assert.deepEqual(layConveyor([0, 0], [8, 2], [], 0), { position: [4, 0, 0], length: 8, rotation: 0 })
  assert.deepEqual(layConveyor([0, 0], [1, -5], [], 0), { position: [0, 0, -2.5], length: 5, rotation: 1 })
  assert.deepEqual(layConveyor([0, 0], [0, 0], [], 3), { position: [0, 0, 1], length: 2, rotation: 3 })
})

test('laying starts at a nearby output and ends at an aligned input', () => {
  const laid = layConveyor([4, 1], [8, 0], [belt, { ...cnc, position: [12, 0, 0] }], 0) // belt out at 3; cnc in at 10
  assert.deepEqual(laid, { position: [6.5, 0, 0], length: 7, rotation: 0 })
})

test('rotating respects the floor', () => {
  assert.equal(rotateMachine(belt).rotation, 1)
  assert.equal(rotateMachine({ ...belt, position: [0, 0, 48] }).rotation, undefined) // turned, it would reach z=51
})

test('selecting a conveyor selects its whole chain, but not machines or unlinked belts', () => {
  const b2 = { id: 'b2', componentType: 'conveyor-belt', position: [5, 0, 0], length: 4 } // in at 3 mates belt's out
  const far = { id: 'far', componentType: 'conveyor-belt', position: [30, 0, 30], length: 2 }
  assert.deepEqual([...conveyorRun('b2', [belt, b2, cnc, far])].sort(), ['b', 'b2'])
  assert.deepEqual([...conveyorRun('far', [belt, b2, far])], ['far'])
  assert.equal(conveyorRun('c', [belt, cnc]).size, 0)
})

test('end-to-end conveyors on one line fuse into a single belt', () => {
  const a = { id: 'a', componentType: 'conveyor-belt', position: [0, 0, 0], length: 4 }
  const b = { id: 'b', componentType: 'conveyor-belt', position: [3, 0, 0], length: 2 } // in at 2, a's out
  const merged = mergeConveyors([a, b, cnc])
  assert.equal(merged.length, 2)
  assert.deepEqual(merged.find((m) => m.componentType === 'conveyor-belt'), { id: 'a', componentType: 'conveyor-belt', position: [1, 0, 0], length: 6 })
  assert.equal(mergeConveyors([a, b], 'b')[0].id, 'b')
  const corner = { ...b, id: 'k', rotation: 3, position: [2, 0, 1] } // mates a but turns, so stays separate
  assert.equal(mergeConveyors([a, corner]).length, 2)
})

test('laying from an output turns a corner when dragged sideways', () => {
  assert.deepEqual(layConveyor([3, 0], [4, 8], [belt], 0), { position: [4, 0, 4.5], length: 7, rotation: 3 })
})
