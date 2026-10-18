import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Raycaster, Vector3 } from 'three'
import { assemblyLocked, connectedPorts, cornerTiles, linkedAssembly, mergeConveyors, conveyorRun, layConveyor, movementAssembly, resizeConveyor, resizeConveyorLayout, resizeStorage, resolvePlacementTarget, rotateMachine, snapToConnections, translateAssembly, workstationForFootprint } from '../src/connections.ts'

const belt = { id: 'b', componentType: 'conveyor-belt', position: [0, 0, 0], length: 6 } // ports at x=-3 (in) / x=3 (out)
const cnc = { id: 'c', componentType: 'cutting-machine', position: [6, 0, 0] } // width 6: in-port at x=3

test('a candidate snaps its in-port onto a nearby out-port', () => {
  assert.deepEqual(snapToConnections('cutting-machine', undefined, 0, [6, 0, 1], [belt]), [6, 0, 0])
  assert.deepEqual(snapToConnections('cutting-machine', undefined, 0, [20, 0, 0], [belt]), [20, 0, 0])
})

test('out-to-out does not snap, and ports may not face each other', () => {
  assert.deepEqual(snapToConnections('cutting-machine', undefined, 0, [1.5, 0, 0], [belt]), [1.5, 0, 0])
  assert.deepEqual(snapToConnections('cutting-machine', undefined, 2, [5, 0, 0], [belt]), [5, 0, 0])
})

test('a perpendicular machine snaps around a corner tile', () => {
  // belt out-port (3,0); the corner tile is centred (4,0); a belt turning toward +Z starts at (4,1)
  assert.deepEqual(snapToConnections('cutting-machine', undefined, 3, [4, 0, 3.5], [belt]), [4, 0, 4])
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

test('raw supply starts a line and finished goods ends it', () => {
  const supply = { id: 'raw', componentType: 'raw-material', position: [-6, 0, 0] } // out at -3
  const output = { id: 'out', componentType: 'finished-goods', position: [6, 0, 0] } // in at 3
  assert.deepEqual(connectedPorts(belt, [supply, belt, output]), { in: true, out: true })
  assert.deepEqual(connectedPorts(supply, [supply, belt]), { in: false, out: true })
  assert.deepEqual(connectedPorts(output, [belt, output]), { in: true, out: false })
  assert.deepEqual(snapToConnections('raw-material', undefined, 0, [6, 0, 0], [belt]), [6, 0, 0])
  assert.deepEqual(snapToConnections('finished-goods', undefined, 0, [-6, 0, 0], [belt]), [-6, 0, 0])
})

test('connected machines and conveyors move as one assembly', () => {
  const supply = { id: 'raw', componentType: 'raw-material', position: [-6, 0, 0] }
  const machines = [supply, belt, cnc]
  const ids = linkedAssembly('c', machines)
  assert.deepEqual([...ids].sort(), ['b', 'c', 'raw'])
  const moved = translateAssembly(machines, ids, 'c', [10, 0, 4])
  assert.deepEqual(moved.map((machine) => machine.position), [[-2, 0, 4], [4, 0, 4], [10, 0, 4]])
  assert.deepEqual([...linkedAssembly('raw', moved)].sort(), ['b', 'c', 'raw'])
  assert.equal(translateAssembly(machines, ids, 'c', [50, 0, 0]), null)
})

test('manual groups link separate pieces and locking blocks assembly movement', () => {
  const a = { id: 'a', componentType: 'workstation', position: [-20, 0, 0], groupId: 'manual' }
  const b = { id: 'b', componentType: 'inspection-machine', position: [20, 0, 0], groupId: 'manual' }
  const grouped = [a, b]
  assert.deepEqual([...linkedAssembly('a', grouped)].sort(), ['a', 'b'])
  assert.equal(assemblyLocked(linkedAssembly('a', [{ ...a, locked: true }, b]), [{ ...a, locked: true }, b]), true)
  assert.equal(translateAssembly([{ ...a, locked: true }, b], linkedAssembly('b', grouped), 'b', [22, 0, 0]), null)
  assert.deepEqual([...linkedAssembly('a', [{ ...a, groupId: undefined }, { ...b, groupId: undefined }])], ['a'])
})

test('mounted machines move independently on a workstation while dragging the deck carries them', () => {
  const station = { id: 'ws', componentType: 'workstation', position: [0, 0, 0] }
  const cutter = { ...cnc, position: [-4, 0, 0], workstationId: 'ws' }
  const inspector = { id: 'i', componentType: 'inspection-machine', position: [4, 0, 0], workstationId: 'ws' }
  const machines = [station, cutter, inspector]
  assert.equal(workstationForFootprint('cutting-machine', undefined, 0, [-4, 0, 0], machines), 'ws')
  assert.equal(workstationForFootprint('cutting-machine', undefined, 0, [8, 0, 0], machines), undefined)
  assert.deepEqual([...linkedAssembly('c', machines)], ['c'])
  assert.deepEqual([...linkedAssembly('ws', machines)], ['ws'])
  assert.deepEqual([...movementAssembly('ws', machines)].sort(), ['c', 'i', 'ws'])
  assert.deepEqual(translateAssembly(machines, linkedAssembly('c', machines), 'c', [-3, 0, 1]).map((machine) => machine.position), [[0, 0, 0], [-3, 0, 1], [4, 0, 0]])
  assert.equal(translateAssembly(machines, linkedAssembly('c', machines), 'c', [-7, 0, 0]), null)
  assert.deepEqual(translateAssembly(machines, movementAssembly('ws', machines), 'ws', [10, 0, 0]).map((machine) => machine.position), [[10, 0, 0], [6, 0, 0], [14, 0, 0]])
  assert.deepEqual(connectedPorts(station, machines), { in: false, out: false })
})

test('placement ray uses the workstation top and refuses footprints beyond its edge', () => {
  const station = { id: 'ws', componentType: 'workstation', position: [0, 0, 0] }
  const ray = new Raycaster(new Vector3(0, 20, 0), new Vector3(0, -1, 0))
  assert.deepEqual(resolvePlacementTarget(ray, 'cutting-machine', undefined, 0, [station]), { position: [0, 0, 0], workstationId: 'ws' })
  ray.ray.origin.x = 8
  assert.equal(resolvePlacementTarget(ray, 'cutting-machine', undefined, 0, [station]), null)
  ray.ray.origin.x = 30
  assert.deepEqual(resolvePlacementTarget(ray, 'cutting-machine', undefined, 0, [station]), { position: [30, 0, 0] })
})

test('workstation length and breadth resize around mounted machines', () => {
  const station = { id: 'ws', componentType: 'workstation', position: [0, 0, 0] }
  const longer = resizeStorage(station, [station], 'length', 24)
  const larger = resizeStorage(longer, [longer], 'breadth', 20)
  assert.equal(larger.length, 24)
  assert.equal(larger.breadth, 20)
  assert.deepEqual(larger.position, [0, 0, 0])
  const cutter = { ...cnc, position: [8, 0, 0], workstationId: 'ws' }
  const inspector = { id: 'i', componentType: 'inspection-machine', position: [0, 0, 7], workstationId: 'ws' }
  assert.equal(resizeStorage(larger, [larger, cutter, inspector], 'length', 18), larger)
  assert.equal(resizeStorage(larger, [larger, cutter, inspector], 'breadth', 14), larger)
  assert.equal(workstationForFootprint('cutting-machine', undefined, 0, cutter.position, [larger]), 'ws')
  const ray = new Raycaster(new Vector3(9, 20, 0), new Vector3(0, -1, 0))
  assert.deepEqual(resolvePlacementTarget(ray, 'cutting-machine', undefined, 0, [larger]), { position: [9, 0, 0], workstationId: 'ws' })
})

test('a locked conveyor does not merge with a newly attached belt', () => {
  const first = { id: 'first', componentType: 'conveyor-belt', position: [0, 0, 0], length: 4, locked: true }
  const next = { id: 'next', componentType: 'conveyor-belt', position: [4, 0, 0], length: 4 }
  assert.equal(mergeConveyors([first, next]).length, 2)
})

test('deposits grow in both dimensions and keep connected feed ends fixed', () => {
  const supply = { id: 'raw', componentType: 'raw-material', position: [-6, 0, 0] }
  const output = { id: 'out', componentType: 'finished-goods', position: [6, 0, 0] }
  const grownSupply = resizeStorage(supply, [supply, belt], 'length', 10)
  const grownOutput = resizeStorage(output, [belt, output], 'length', 10)
  assert.deepEqual(grownSupply.position, [-8, 0, 0])
  assert.deepEqual(grownOutput.position, [8, 0, 0])
  assert.deepEqual(connectedPorts(belt, [grownSupply, belt, grownOutput]), { in: true, out: true })
  const broader = resizeStorage(supply, [supply], 'breadth', 9)
  assert.equal(broader.breadth, 9)
  assert.deepEqual(broader.position, supply.position)
  assert.equal(resizeStorage(broader, [broader], 'breadth', 4).breadth, 5)
  assert.equal(resizeStorage({ ...supply, position: [46, 0, 0] }, [], 'length', 10).length, undefined)
})

test('resizing keeps the connected end fixed and respects limits', () => {
  assert.equal(resizeConveyor(belt, [belt], 10).position[0], 2) // start stays at -3
  assert.equal(resizeConveyor(belt, [belt, cnc], 10).position[0], -2) // output end stays at 3
  assert.equal(resizeConveyor(belt, [belt], 1000).length, 6) // 100 long would leave the floor, so it is refused
  assert.equal(resizeConveyor(belt, [belt], 40).length, 40)
})

test('resizing a laid conveyor carries its downstream connected machines', () => {
  const supply = { id: 'raw', componentType: 'raw-material', position: [-6, 0, 0] }
  const output = { id: 'out', componentType: 'finished-goods', position: [12, 0, 0] }
  const machines = [supply, belt, cnc, output]
  const resized = resizeConveyorLayout('b', machines, 10)
  assert.deepEqual(resized.map((machine) => machine.position), [[-6, 0, 0], [2, 0, 0], [10, 0, 0], [16, 0, 0]])
  assert.deepEqual(connectedPorts(resized[1], resized), { in: true, out: true })
  assert.deepEqual([...linkedAssembly('raw', resized)].sort(), ['b', 'c', 'out', 'raw'])
  assert.equal(resizeConveyorLayout('b', resized, 10), null)
  assert.equal(resizeConveyorLayout('b', [{ ...supply, locked: true }, belt, cnc, output], 10), null)
})

test('resizing refuses to push a downstream machine beyond the floor', () => {
  const edgeSupply = { id: 'raw', componentType: 'raw-material', position: [29, 0, 0] }
  const edgeBelt = { ...belt, position: [35, 0, 0] }
  const edgeCnc = { ...cnc, position: [41, 0, 0] }
  assert.equal(resizeConveyorLayout('b', [edgeSupply, edgeBelt, edgeCnc], 14), null)
})

test('laying drags out a conveyor along the dominant axis', () => {
  assert.deepEqual(layConveyor([0, 0], [8, 2], [], 0), { position: [4, 0, 0], length: 8, rotation: 0 })
  assert.deepEqual(layConveyor([0, 0], [1, -5], [], 0), { position: [0, 0, -2.5], length: 5, rotation: 1 })
  assert.deepEqual(layConveyor([0, 0], [0, 0], [], 3), { position: [0, 0, 2], length: 4, rotation: 3 })
})

test('laying starts at a nearby output and ends at an aligned input', () => {
  const laid = layConveyor([4, 1], [8, 0], [belt, { ...cnc, position: [12, 0, 0] }], 0) // belt out at 3; cutter in at 9
  assert.deepEqual(laid, { position: [6, 0, 0], length: 6, rotation: 0 })
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
  const grouped = mergeConveyors([{ ...a, groupId: 'left' }, { ...b, groupId: 'right' }, { id: 'side', componentType: 'workstation', position: [25, 0, 0], groupId: 'right' }])
  assert.equal(grouped.find((machine) => machine.id === 'side').groupId, 'left')
  assert.equal(grouped.find((machine) => machine.componentType === 'conveyor-belt').groupId, 'left')
  const corner = { ...b, id: 'k', rotation: 3, position: [2, 0, 1] } // mates a but turns, so stays separate
  assert.equal(mergeConveyors([a, corner]).length, 2)
})

test('laying from an output turns a corner when dragged sideways', () => {
  assert.deepEqual(layConveyor([3, 0], [4, 8], [belt], 0), { position: [4, 0, 4.5], length: 7, rotation: 3 })
})
