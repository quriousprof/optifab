import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Raycaster, Vector3 } from 'three'
import { beltEnds, beltPoint, beltTangent, closestBeltPoint, tangentAngle } from '../src/conveyorPath.ts'
import { alignMerges, assemblyLocked, connectedPorts, conveyorJunctions, cornerTiles, linkedAssembly, mergeConveyors, conveyorRun, layConveyor, layConveyorRun, layDirectionalConveyorRun, movementAssembly, resizeConveyor, resizeConveyorLayout, resizeStorage, resolvePlacementTarget, rotateMachine, snapToConnections, surfaceTransitions, translateAssembly, workstationForFootprint } from '../src/connections.ts'

const belt = { id: 'b', componentType: 'conveyor-belt', position: [0, 0, 0], length: 6 } // ports at x=-3 (in) / x=3 (out)
const cnc = { id: 'c', componentType: 'cutting-machine', position: [6, 0, 0] } // width 6: in-port at x=3

test('three incoming belts share one exact output merge and can be extended downstream', () => {
  const trunk = { ...belt, id: 'center', length: 24, position: [0, 0, 0], angle: 0 }
  const machines = [trunk]
  const outlet = beltEnds(trunk).end
  for (const [index, origin] of [[-12, -12], [-12, 12]].entries()) {
    const piece = layDirectionalConveyorRun(origin, [outlet[0] - 0.5, outlet[1] + 0.3], machines, 0)[0]
    const incoming = { id: `incoming-${index}`, componentType: 'conveyor-belt', ...piece }
    const end = beltEnds(incoming).end
    assert.ok(Math.hypot(end[0] - outlet[0], end[1] - outlet[1]) < 1e-8)
    assert.ok(beltTangent(incoming, 1)[0] > 0.999999)
    machines.push(incoming)
  }
  assert.equal(linkedAssembly('center', machines).size, 3)
  const extension = { id: 'downstream', componentType: 'conveyor-belt', ...layDirectionalConveyorRun(outlet, [30, 0], machines, 0)[0] }
  machines.push(extension)
  assert.equal(linkedAssembly('downstream', machines).size, 4)
  assert.equal(connectedPorts(extension, machines).in, true)
  const moved = translateAssembly(machines, linkedAssembly('center', machines), 'center', [0, 0, 3])
  assert.ok(moved)
  assert.equal(linkedAssembly('downstream', moved).size, 4)
})

test('converging on a workstation retains the shared arrival tangent', () => {
  const host = { id: 'deck', componentType: 'workstation', position: [0, 0, 0], length: 40, breadth: 30 }
  const trunk = { ...belt, id: 'center', length: 20, position: [0, 0, 0], angle: 0, workstationId: 'deck' }
  const piece = layDirectionalConveyorRun([-10, -10], [9.7, 0.2], [host, trunk], 0, 'deck')[0]
  const incoming = { id: 'incoming', componentType: 'conveyor-belt', ...piece }
  assert.ok(Math.abs(piece.exitAngle) < 1e-8)
  assert.equal(piece.workstationId, 'deck')
  assert.equal(linkedAssembly('center', [host, trunk, incoming]).size, 2)
})

test('endpoint sockets win over nearby interiors and support three seamless fan branches', () => {
  const trunk = { ...belt, length: 20, position: [-10, 0, 0], angle: 0 }
  const machines = [trunk]
  for (const [index, target] of [[20, -12], [24, 0], [20, 12]].entries()) {
    const piece = layDirectionalConveyorRun([-0.8, 0.3], target, machines, 0)[0]
    const branch = { id: `fan-${index}`, componentType: 'conveyor-belt', ...piece }
    assert.ok(Math.hypot(...beltEnds(branch).start) < 1e-8)
    assert.ok(beltTangent(branch, 0)[0] > 0.999999)
    machines.push(branch)
  }
  assert.equal(linkedAssembly(trunk.id, machines).size, 4)
})

test('a continuation shares the exact curved endpoint and tangent', () => {
  const first = { id: 'curve', componentType: 'conveyor-belt', position: [0, 0, 0], length: 18, angle: -0.5, entryAngle: 0, exitAngle: -0.8 }
  const endpoint = beltEnds(first).end
  const laid = layDirectionalConveyorRun([endpoint[0] - 0.5, endpoint[1] - 0.2], [25, 22], [first], 0)[0]
  const next = { id: 'next', componentType: 'conveyor-belt', ...laid }
  assert.ok(Math.hypot(beltEnds(next).start[0] - endpoint[0], beltEnds(next).start[1] - endpoint[1]) < 1e-8)
  const a = beltTangent(first, 1), b = beltTangent(next, 0)
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-8)
  assert.equal(connectedPorts(next, [first, next]).in, true)
})

test('finishing near an input snaps the complete endpoint and arrival tangent', () => {
  const destination = { ...belt, position: [12, 0, 7], length: 10, angle: -0.3, entryAngle: -0.6 }
  const input = beltEnds(destination).start
  const feed = { id: 'feed', componentType: 'conveyor-belt', ...layDirectionalConveyorRun([-12, -5], [input[0] + 0.7, input[1] - 0.4], [destination], 0)[0] }
  const end = beltEnds(feed).end
  assert.ok(Math.hypot(end[0] - input[0], end[1] - input[1]) < 1e-8)
  const incoming = beltTangent(feed, 1), outgoing = beltTangent(destination, 0)
  assert.ok(Math.hypot(incoming[0] - outgoing[0], incoming[1] - outgoing[1]) < 1e-8)
  assert.equal(connectedPorts(feed, [feed, destination]).out, true)
})

test('free-angle belts fan from the middle of one trunk and stay linked', () => {
  const trunk = { ...belt, length: 12 }
  const a = { id: 'a', componentType: 'conveyor-belt', ...layDirectionalConveyorRun([0, 0], [6, 6], [trunk], 0)[0] }
  const b = { id: 'fan-b', componentType: 'conveyor-belt', ...layDirectionalConveyorRun([2, 0], [7, -5], [trunk, a], 0)[0] }
  const machines = [trunk, a, b]
  assert.ok(Math.abs(a.angle + Math.PI / 4) < 1e-6)
  assert.ok(Math.abs(a.entryAngle) < 1e-6)
  assert.deepEqual(beltEnds(a).start.map((value) => Math.round(value) || 0), [0, 0])
  const [firstDx, firstDz] = beltTangent(a, 0)
  assert.ok(firstDx > 0.99 && Math.abs(firstDz) < 0.01)
  assert.ok(Math.abs(beltPoint(a, 0.5)[1] - 3) > 0.2) // the belt actually bends; it is not a straight chord
  assert.deepEqual(connectedPorts(trunk, machines), { in: false, out: true })
  assert.deepEqual(connectedPorts(a, machines), { in: true, out: false })
  assert.deepEqual([...conveyorRun('b', machines)].sort(), ['a', 'b', 'fan-b'])
  assert.deepEqual(conveyorJunctions(machines).map((joint) => joint.center.map((value) => Math.round(value * 1000) / 1000 || 0)), [[0, 0], [2, 0]])
  assert.equal(linkedAssembly('fan-b', machines).size, 3)
  const moved = translateAssembly(machines, linkedAssembly('fan-b', machines), 'a', [a.position[0] + 2, 0, a.position[2] + 3])
  assert.ok(moved)
  assert.equal(linkedAssembly('fan-b', moved).size, 3)
})

test('a new fan can branch from the curved portion of another belt', () => {
  const trunk = { ...belt, length: 12 }
  const first = { id: 'first', componentType: 'conveyor-belt', ...layDirectionalConveyorRun([0, 0], [6, 6], [trunk], 0)[0] }
  const origin = beltPoint(first, 0.6)
  const second = { id: 'second', componentType: 'conveyor-belt', ...layDirectionalConveyorRun(origin, [11, 8], [trunk, first], 0)[0] }
  const nearest = closestBeltPoint(first, beltEnds(second).start)
  assert.ok(nearest.distance < 0.02)
  assert.equal(connectedPorts(second, [trunk, first, second]).in, true)
  assert.ok(second.entryAngle !== undefined)
})

test('a diagonal feed can converge onto a belt spine', () => {
  const trunk = { ...belt, length: 12 }
  const feed = { id: 'feed', componentType: 'conveyor-belt', ...layDirectionalConveyorRun([0, 8], [1, 0.4], [trunk], 0)[0] }
  assert.deepEqual(connectedPorts(feed, [trunk, feed]), { in: false, out: true })
  assert.ok(Math.abs(feed.exitAngle) < 1e-6)
  assert.ok(beltTangent(feed, 1)[0] > 0.99)
  assert.deepEqual(connectedPorts(trunk, [trunk, feed]), { in: true, out: false })
  assert.equal(conveyorJunctions([trunk, feed]).length, 1)
})

test('resizing a trunk keeps its mid-belt branches attached without shifting them', () => {
  const trunk = { ...belt, length: 12 }
  const branch = { id: 'branch', componentType: 'conveyor-belt', ...layDirectionalConveyorRun([0, 0], [6, 6], [trunk], 0)[0] }
  const grown = resizeConveyorLayout('b', [trunk, branch], 14)
  assert.deepEqual(grown.find((m) => m.id === 'branch').position, branch.position)
  assert.equal(connectedPorts(branch, grown).in, true)
  assert.equal(resizeConveyorLayout('b', [trunk, branch], 4), null)
})

test('diagonal drag can cross a workstation edge with connected raised and floor pieces', () => {
  const host = { id: 'host', componentType: 'workstation', position: [0, 0, 0] }
  const pieces = layDirectionalConveyorRun([0, 0], [16, 8], [host], 0, 'host')
  assert.equal(pieces.length, 2)
  assert.equal(pieces[0].workstationId, 'host')
  assert.equal(pieces[1].workstationId, undefined)
  const machines = [host, ...pieces.map((piece, index) => ({ id: `p${index}`, componentType: 'conveyor-belt', ...piece }))]
  assert.equal(surfaceTransitions(machines).length, 1)
})

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

test('one drag lays a connected conveyor across a workstation edge', () => {
  const host = { id: 'ws', componentType: 'workstation', position: [0, 0, 0] }
  const cutter = { ...cnc, position: [-4, 0, 0], workstationId: 'ws' } // output at x=-1
  const pieces = layConveyorRun([-1, 0], [19, 0], [host, cutter], 0, 'ws')
  assert.deepEqual(pieces, [
    { position: [4, 0, 0], length: 10, rotation: 0, workstationId: 'ws' },
    { position: [14, 0, 0], length: 10, rotation: 0 },
  ])
  const [deck, floor] = pieces.map((piece, index) => ({ id: `belt-${index}`, componentType: 'conveyor-belt', ...piece }))
  const machines = [host, cutter, deck, floor]
  assert.deepEqual(connectedPorts(deck, machines), { in: true, out: true })
  assert.deepEqual(connectedPorts(floor, machines), { in: true, out: false })
  assert.deepEqual([...linkedAssembly('c', machines)].sort(), ['belt-0', 'belt-1', 'c'])
  assert.deepEqual(surfaceTransitions(machines), [{ center: [9, 0], rotation: 0, fromHeight: 0.5, toHeight: 0, ids: ['belt-0', 'belt-1'] }])
  assert.equal(mergeConveyors(machines).length, 4)
  assert.equal(connectedPorts(deck, [host, deck, { ...floor, position: [8, 0, 0] }]).out, false)
  assert.deepEqual(layConveyorRun([9, 0], [19, 0], [host, deck], 0), [{ position: [14, 0, 0], length: 10, rotation: 0 }])
  assert.equal(resizeStorage(host, machines, 'length', 20), host) // would strand the edge joint
  assert.equal(resizeStorage(host, machines, 'breadth', 20).breadth, 20)
  assert.equal(translateAssembly(machines, linkedAssembly('belt-0', machines), 'belt-0', [5, 0, 0]), null)
  assert.deepEqual(translateAssembly(machines, movementAssembly('ws', machines), 'ws', [1, 0, 0]).map((machine) => machine.position), [[1, 0, 0], [-3, 0, 0], [5, 0, 0], [15, 0, 0]])
})

test('a floor conveyor can feed a workstation only at its incoming edge', () => {
  const host = { id: 'ws', componentType: 'workstation', position: [0, 0, 0] }
  const floor = { id: 'floor', componentType: 'conveyor-belt', position: [-12, 0, 0], length: 6 }
  const deck = { id: 'deck', componentType: 'conveyor-belt', position: [-6, 0, 0], length: 6, workstationId: 'ws' }
  assert.deepEqual(connectedPorts(deck, [host, floor, deck]), { in: true, out: false })
  assert.deepEqual(surfaceTransitions([host, floor, deck])[0], { center: [-9, 0], rotation: 0, fromHeight: 0, toHeight: 0.5, ids: ['floor', 'deck'] })
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

test('converging branches arrive tangent to the trunk leaving the merge node', () => {
  const belt = (id, from, to, extra = {}) => ({ id, componentType: 'conveyor-belt', position: [(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2],
    length: Math.hypot(to[0] - from[0], to[1] - from[1]), rotation: 0, angle: Math.atan2(-(to[1] - from[1]), to[0] - from[0]), ...extra })
  const machines = alignMerges([
    belt('upper', [0, -6], [10, 0], { exitAngle: 0.3 }),
    belt('lower', [0, 6], [10, 0], { exitAngle: -1.2 }),
    belt('trunk', [10, 0], [20, 0], { entryAngle: 0.5 }),
  ])
  const trunk = machines.find((m) => m.id === 'trunk')
  assert.equal(trunk.entryAngle, undefined)
  for (const id of ['upper', 'lower']) assert.ok(Math.abs(tangentAngle(machines.find((m) => m.id === id), 1) - tangentAngle(trunk, 0)) < 1e-9)
  const chain = [belt('a', [0, 0], [10, 0]), belt('b', [10, 0], [20, 5], { entryAngle: 0 })]
  assert.equal(alignMerges(chain), chain)
})
