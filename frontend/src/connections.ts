import { DIRECTIONS, WORKSTATION_HEIGHT, fitsFloor, footprint, machineFootprint, isResizableAreaType, machineDepth, machineWidth, type FactoryComponentType, type FloorPosition, type PlacedMachine } from './factoryComponents.ts'
import { floorPoint, getSnappedFloorPosition } from './placement.ts'
import { Plane, Vector3, type Raycaster } from 'three'
import { beltEnds, beltPoint, closestBeltPoint, tangentAngle } from './conveyorPath.ts'

// Lock and key: a machine's flow end is an "out" key and its opposite end an "in" lock.
// Only out meets in, and the two may not face each other, so material flows one way along a line.
export const SNAP_DISTANCE = 2
export const MIN_LENGTH = 2
export const MAX_LENGTH = 100
export const MAX_STORAGE_SIZE = 40
const BEND = 1 // half a conveyor's width: a turn happens inside one corner tile this far from each belt end

type Machine = Pick<PlacedMachine, 'componentType' | 'position' | 'length' | 'breadth' | 'rotation' | 'angle' | 'entryAngle' | 'exitAngle' | 'workstationId'>
type Point = [number, number]

const dir = (m: Pick<Machine, 'rotation'>) => DIRECTIONS[(m.rotation ?? 0) % 4]
const direction = (m: Pick<Machine, 'rotation' | 'angle'>): Point => m.angle === undefined ? [...dir(m)] : [Math.cos(m.angle), -Math.sin(m.angle)]
type Heading = Pick<Machine, 'rotation'>

/**
 * Offset from A's out-port to the in-port of a piece B that continues it: zero when straight,
 * one tile diagonal around a right-angle bend (a curved corner tile fills the gap), none when B faces back at A.
 */
function link(a: Heading, b: Heading): Point | null {
  const [ax, az] = dir(a)
  const [bx, bz] = dir(b)
  const dot = ax * bx + az * bz
  if (dot > 0) return [0, 0]
  return dot === 0 ? [BEND * (ax + bx), BEND * (az + bz)] : null
}

function mated(a: Machine, b: Machine, machines: PlacedMachine[]): boolean {
  if (a.componentType === 'workstation' || b.componentType === 'workstation') return false
  if (a.componentType === 'finished-goods' || b.componentType === 'raw-material') return false
  const l = a.angle === undefined && b.angle === undefined ? link(a, b) : [0, 0] as Point
  const out = ports(a).out
  if (l === null || !same([out[0] + l[0], out[1] + l[1]], ports(b).in)) return false
  const da = direction(a), db = direction(b)
  if (da[0] * db[0] + da[1] * db[1] < -0.95) return false
  if (a.workstationId === b.workstationId) return true
  if (a.workstationId && b.workstationId) return false
  // A raised belt joins a floor belt only at the workstation edge, in a straight line.
  if (l[0] || l[1]) return false
  const hosted = a.workstationId ? a : b
  return hostedPortAtEdge(hosted, hosted === a ? 'out' : 'in', machines)
}

function hostedPortAtEdge(hosted: Machine, side: 'in' | 'out', machines: PlacedMachine[]): boolean {
  const host = machines.find((machine) => machine.id === hosted.workstationId)
  if (!host || host.componentType !== 'workstation') return false
  const [width, depth] = footprint('workstation', host.length, host.rotation ?? 0, host.breadth)
  const port = ports(hosted)[side]
  const x = Math.abs(port[0] - host.position[0]), z = Math.abs(port[1] - host.position[2])
  return (Math.abs(x - width / 2) < 1e-4 && z + machineDepth('conveyor-belt') / 2 <= depth / 2 + 1e-4) ||
    (Math.abs(z - depth / 2) < 1e-4 && x + machineDepth('conveyor-belt') / 2 <= width / 2 + 1e-4)
}

function ports(m: Machine): { in: Point; out: Point } {
  if (m.componentType === 'conveyor-belt') {
    const { start, end } = beltEnds(m)
    return { in: start, out: end }
  }
  const [dx, dz] = direction(m)
  const half = machineWidth(m.componentType, m.length) / 2
  return { in: [m.position[0] - dx * half, m.position[2] - dz * half], out: [m.position[0] + dx * half, m.position[2] + dz * half] }
}

const same = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4

function onBelt(point: Point, belt: Machine): boolean {
  if (belt.componentType !== 'conveyor-belt') return false
  const nearest = closestBeltPoint(belt, point)
  const margin = 0.05 / machineWidth('conveyor-belt', belt.length)
  return nearest.t > margin && nearest.t < 1 - margin && nearest.distance < 0.08
}

/** A diverter leaves a belt's spine; a merge feeds another belt's spine. */
function feeds(a: Machine, b: Machine, machines: PlacedMachine[]): boolean {
  if (mated(a, b, machines)) return true
  if (a.workstationId !== b.workstationId) return false
  // Incoming branches may share an outlet before a downstream trunk is drawn.
  if (a.componentType === 'conveyor-belt' && b.componentType === 'conveyor-belt' && same(ports(a).out, ports(b).out) &&
    Math.cos(tangentAngle(a, 1) - tangentAngle(b, 1)) > 0.95) return true
  if (a.componentType === 'conveyor-belt' && onBelt(ports(b).in, a)) return true
  return b.componentType === 'conveyor-belt' && onBelt(ports(a).out, b)
}

/** Visible sorting plates at branch and merge points, deduplicated for multi-way fans. */
export function conveyorJunctions(machines: PlacedMachine[]) {
  const junctions: { center: Point; angle: number; workstationId?: string; ids: string[] }[] = []
  const belts = machines.filter((m) => m.componentType === 'conveyor-belt')
  for (const a of belts) for (const b of belts) {
    if (a === b || a.workstationId !== b.workstationId || !feeds(a, b, machines)) continue
    const branchesFromA = onBelt(ports(b).in, a)
    const mergesIntoB = onBelt(ports(a).out, b)
    const point = branchesFromA ? ports(b).in : mergesIntoB ? ports(a).out :
      a.angle !== undefined || b.angle !== undefined ? ports(a).out : null
    if (!point) continue
    let joint = junctions.find((candidate) => candidate.workstationId === a.workstationId && same(candidate.center, point))
    if (!joint) {
      const spine = mergesIntoB && !branchesFromA ? b : a
      joint = { center: point, angle: tangentAngle(spine, closestBeltPoint(spine, point).t), workstationId: a.workstationId, ids: [] }
      junctions.push(joint)
    }
    if (!joint.ids.includes(a.id)) joint.ids.push(a.id)
    if (!joint.ids.includes(b.id)) joint.ids.push(b.id)
  }
  return junctions
}

/** Which ports of `m` currently mate with another machine (derived from positions, so nothing to keep in sync). */
export function connectedPorts(m: PlacedMachine, machines: PlacedMachine[]) {
  const others = machines.filter((o) => o.id !== m.id)
  return { in: others.some((o) => feeds(o, m, machines)), out: others.some((o) => feeds(m, o, machines)) }
}

/** Every component linked through touching ports or an explicit user group. Mounting alone does not group a machine with its workstation. */
export function linkedAssembly(id: string, machines: PlacedMachine[]): Set<string> {
  const members = new Set(machines.some((machine) => machine.id === id) ? [id] : [])
  for (const currentId of members) {
    const current = machines.find((machine) => machine.id === currentId)!
    for (const other of machines) {
      if (members.has(other.id)) continue
      if ((current.groupId && current.groupId === other.groupId) || feeds(current, other, machines) || feeds(other, current, machines)) members.add(other.id)
    }
  }
  return members
}

/** A platform carries its mounted machines when dragged, though they remain separately selectable. */
export function movementAssembly(id: string, machines: PlacedMachine[]): Set<string> {
  const members = linkedAssembly(id, machines)
  for (const currentId of members) {
    const current = machines.find((machine) => machine.id === currentId)
    if (current?.componentType !== 'workstation') continue
    for (const child of machines.filter((machine) => machine.workstationId === currentId)) {
      for (const linkedId of linkedAssembly(child.id, machines)) members.add(linkedId)
    }
  }
  return members
}

export function assemblyLocked(ids: Set<string>, machines: PlacedMachine[]): boolean {
  return machines.some((machine) => ids.has(machine.id) && machine.locked)
}

/** Translate a whole assembly by one snapped delta, refusing moves across the floor edge. */
export function translateAssembly(machines: PlacedMachine[], ids: Set<string>, draggedId: string, target: FloorPosition, detach = false): PlacedMachine[] | null {
  const dragged = machines.find((machine) => machine.id === draggedId)
  if (!dragged || !ids.has(draggedId) || assemblyLocked(ids, machines)) return null
  const dx = target[0] - dragged.position[0]
  const dz = target[2] - dragged.position[2]
  if (!dx && !dz) return null
  const moved = machines.map((machine) => ids.has(machine.id) ? { ...machine, position: [machine.position[0] + dx, 0, machine.position[2] + dz] as FloorPosition } : machine)
  return moved.every((machine) => {
    if (!ids.has(machine.id)) return true
    const [width, depth] = machineFootprint(machine)
    return fitsFloor(machine.position[0], machine.position[2], width, depth) &&
      (detach || !machine.workstationId || workstationContains(machine, moved) === machine.workstationId)
  }) && (detach || preservesSurfaceTransitions(machines, moved)) ? moved : null
}

/** Corner tiles: wherever one piece turns a right angle into another. `from`/`to` are the flow directions. */
export function cornerTiles(machines: PlacedMachine[]) {
  const tiles: { center: Point; from: Point; to: Point; ids: [string, string] }[] = []
  for (const a of machines) {
    for (const b of machines) {
      const [ax, az] = dir(a)
      const [bx, bz] = dir(b)
      if (a === b || a.angle !== undefined || b.angle !== undefined || ax * bx + az * bz !== 0 || !mated(a, b, machines)) continue
      const out = ports(a).out
      tiles.push({ center: [out[0] + ax * BEND, out[1] + az * BEND], from: [ax, az], to: [bx, bz], ids: [a.id, b.id] })
    }
  }
  return tiles
}

/** Sloped visual joints where a conveyor crosses between a workstation deck and the floor. */
export function surfaceTransitions(machines: PlacedMachine[]) {
  const transitions: { center: Point; rotation: number; fromHeight: number; toHeight: number; ids: [string, string] }[] = []
  for (const a of machines) for (const b of machines) {
    if (a === b || a.workstationId === b.workstationId || !mated(a, b, machines)) continue
    if (a.componentType !== 'conveyor-belt' && b.componentType !== 'conveyor-belt') continue
    transitions.push({
      center: ports(a).out,
      rotation: a.angle === undefined ? a.rotation ?? 0 : a.angle * 2 / Math.PI,
      fromHeight: a.workstationId ? WORKSTATION_HEIGHT : 0,
      toHeight: b.workstationId ? WORKSTATION_HEIGHT : 0,
      ids: [a.id, b.id],
    })
  }
  return transitions
}

function preservesSurfaceTransitions(before: PlacedMachine[], after: PlacedMachine[]): boolean {
  const required = surfaceTransitions(before)
  if (!required.length) return true
  const present = surfaceTransitions(after)
  return required.every((joint) => present.some((candidate) => candidate.ids[0] === joint.ids[0] && candidate.ids[1] === joint.ids[1]))
}

/** Ids of the clicked conveyor plus every conveyor chained to it, in either direction. */
export function conveyorRun(id: string, machines: PlacedMachine[]): Set<string> {
  const belts = machines.filter((m) => m.componentType === 'conveyor-belt')
  const run = new Set(belts.some((m) => m.id === id) ? [id] : [])
  for (const current of run) {
    const a = belts.find((m) => m.id === current)!
    for (const b of belts) {
      if (!run.has(b.id) && (feeds(a, b, machines) || feeds(b, a, machines))) run.add(b.id)
    }
  }
  return run
}

/** Fuse end-to-end conveyors on the same line into one longer belt. `preferId` survives when it is part of a merge. */
export function mergeConveyors(machines: PlacedMachine[], preferId?: string): PlacedMachine[] {
  const belts = machines.filter((m) => m.componentType === 'conveyor-belt')
  for (const a of belts) {
    for (const b of belts) {
      if (a === b || a.angle !== undefined || b.angle !== undefined || a.workstationId !== b.workstationId || (a.rotation ?? 0) !== (b.rotation ?? 0) || !same(ports(a).out, ports(b).in)) continue
      if (assemblyLocked(linkedAssembly(a.id, machines), machines) || assemblyLocked(linkedAssembly(b.id, machines), machines)) continue
      const length = machineWidth(a.componentType, a.length) + machineWidth(b.componentType, b.length)
      if (length > MAX_LENGTH) continue
      const [dx, dz] = dir(a)
      const start = ports(a).in
      const groupId = a.groupId ?? b.groupId
      const merged: PlacedMachine = { ...a, id: b.id === preferId ? b.id : a.id, ...(groupId ? { groupId } : {}), length, position: [start[0] + dx * length / 2, 0, start[1] + dz * length / 2] }
      const rest = machines.filter((m) => m !== a && m !== b).map((m) => b.groupId && m.groupId === b.groupId ? { ...m, groupId } : m)
      return mergeConveyors([...rest, merged], preferId)
    }
  }
  return machines
}

/** Mirror of a split: belts converging on one node arrive tangent to the trunk that leaves it. */
export function alignMerges(machines: PlacedMachine[]): PlacedMachine[] {
  const belts = machines.filter((m) => m.componentType === 'conveyor-belt')
  const updates = new Map<string, PlacedMachine>()
  for (const trunk of belts) {
    const node = ports(trunk).in
    const incoming = belts.filter((m) => m !== trunk && m.workstationId === trunk.workstationId && same(ports(m).out, node))
    if (incoming.length < 2) continue // a plain chain keeps the downstream belt's inherited entry tangent
    const { entryAngle: _, ...straight } = trunk
    const angle = tangentAngle(straight, 0)
    updates.set(trunk.id, straight)
    for (const m of incoming) updates.set(m.id, { ...m, exitAngle: angle })
  }
  return updates.size ? machines.map((m) => updates.get(m.id) ?? m) : machines
}

/** Pull a candidate position onto the nearest compatible port within SNAP_DISTANCE. */
export function snapToConnections(type: FactoryComponentType, length: number | undefined, rotation: number, position: FloorPosition, others: Machine[]): FloorPosition {
  const [dx, dz] = DIRECTIONS[rotation % 4]
  const half = machineWidth(type, length) / 2
  let best = position
  let bestDistance = SNAP_DISTANCE
  const me = { rotation }
  for (const other of others) {
    const before = other.componentType === 'finished-goods' || type === 'raw-material' ? null : other.angle === undefined ? link(other, me) : [0, 0] as Point // other continues into us
    if (before) {
      const out = ports(other).out
      const center = [out[0] + before[0] + dx * half, out[1] + before[1] + dz * half]
      const d = Math.hypot(position[0] - center[0], position[2] - center[1])
      if (d < bestDistance) { bestDistance = d; best = [center[0], 0, center[1]] }
    }
    const after = type === 'finished-goods' || other.componentType === 'raw-material' ? null : other.angle === undefined ? link(me, other) : [0, 0] as Point // we continue into other
    if (after) {
      const inn = ports(other).in
      const center = [inn[0] - after[0] - dx * half, inn[1] - after[1] - dz * half]
      const d = Math.hypot(position[0] - center[0], position[2] - center[1])
      if (d < bestDistance) { bestDistance = d; best = [center[0], 0, center[1]] }
    }
  }
  return best
}

const fits = (type: FactoryComponentType, length: number | undefined, rotation: number, [x, , z]: FloorPosition, breadth?: number) => {
  const [ex, ez] = footprint(type, length, rotation, breadth)
  return fitsFloor(x, z, ex, ez)
}

/** Floor position under the ray, grid-snapped, then port-snapped when that still fits on the floor. */
export function resolvePlacement(raycaster: Raycaster, type: FactoryComponentType, length: number | undefined, rotation: number, machines: PlacedMachine[], excludeId?: string, breadth?: number): FloorPosition | null {
  const base = getSnappedFloorPosition(raycaster, type, footprint(type, length, rotation, breadth))
  if (!base) return null
  const snapped = snapToConnections(type, length, rotation, base, machines.filter((m) =>
    m.id !== excludeId && (!m.workstationId || hostedPortAtEdge(m, 'in', machines) || hostedPortAtEdge(m, 'out', machines))))
  return fits(type, length, rotation, snapped, breadth) ? snapped : base
}

export type PlacementTarget = { position: FloorPosition; workstationId?: string }
const workstationPlane = new Plane(new Vector3(0, 1, 0), -WORKSTATION_HEIGHT)

export function workstationAtPoint([x, z]: Point, machines: PlacedMachine[]): PlacedMachine | undefined {
  return machines.find((machine) => {
    if (machine.componentType !== 'workstation') return false
    const [width, depth] = footprint('workstation', machine.length, machine.rotation ?? 0, machine.breadth)
    return Math.abs(x - machine.position[0]) <= width / 2 && Math.abs(z - machine.position[2]) <= depth / 2
  })
}

export function workstationForFootprint(type: FactoryComponentType, length: number | undefined, rotation: number, position: FloorPosition, machines: PlacedMachine[], breadth?: number): string | undefined {
  if (type === 'workstation') return undefined
  const [itemWidth, itemDepth] = footprint(type, length, rotation, breadth)
  return machines.find((host) => {
    if (host.componentType !== 'workstation') return false
    const [hostWidth, hostDepth] = footprint('workstation', host.length, host.rotation ?? 0, host.breadth)
    return Math.abs(position[0] - host.position[0]) + itemWidth / 2 <= hostWidth / 2 &&
      Math.abs(position[2] - host.position[2]) + itemDepth / 2 <= hostDepth / 2
  })?.id
}

function workstationContains(machine: Machine, machines: PlacedMachine[]): string | undefined {
  if (machine.componentType === 'workstation') return undefined
  if (machine.componentType === 'conveyor-belt') {
    return machines.find((host) => {
      if (host.componentType !== 'workstation') return false
      const [width, depth] = footprint('workstation', host.length, host.rotation ?? 0, host.breadth)
      return Array.from({ length: 13 }, (_, index) => beltPoint(machine, index / 12)).every(([x, z]) =>
        Math.abs(x - host.position[0]) <= width / 2 + 1e-4 && Math.abs(z - host.position[2]) <= depth / 2 + 1e-4)
    })?.id
  }
  const [itemWidth, itemDepth] = machineFootprint(machine)
  return machines.find((host) => {
    if (host.componentType !== 'workstation') return false
    const [hostWidth, hostDepth] = footprint('workstation', host.length, host.rotation ?? 0, host.breadth)
    return Math.abs(machine.position[0] - host.position[0]) + itemWidth / 2 <= hostWidth / 2 + 1e-4 &&
      Math.abs(machine.position[2] - host.position[2]) + itemDepth / 2 <= hostDepth / 2 + 1e-4
  })?.id
}

/** Prefer the top of a workstation when the pointer is over its deck. */
export function resolvePlacementTarget(raycaster: Raycaster, type: FactoryComponentType, length: number | undefined, rotation: number, machines: PlacedMachine[], breadth?: number): PlacementTarget | null {
  if (type !== 'workstation') {
    const hit = raycaster.ray.intersectPlane(workstationPlane, new Vector3())
    const host = hit && workstationAtPoint([hit.x, hit.z], machines)
    if (host && hit) {
      const x = Math.round(hit.x) || 0
      const z = Math.round(hit.z) || 0
      const inside = (position: FloorPosition) => workstationForFootprint(type, length, rotation, position, [host], breadth) === host.id
      const base: FloorPosition = [x, 0, z]
      const candidate = snapToConnections(type, length, rotation, base, machines.filter((machine) => machine.workstationId === host.id))
      const position = inside(candidate) ? candidate : base
      return inside(position) ? { position, workstationId: host.id } : null
    }
  }
  const position = resolvePlacement(raycaster, type, length, rotation, machines, undefined, breadth)
  return position ? { position } : null
}

export type Laid = { position: FloorPosition; length: number; rotation: number; angle?: number; entryAngle?: number; exitAngle?: number; workstationId?: string }

const halfGrid = (value: number) => Math.round(value * 2) / 2

/** End sockets win over nearby belt interiors, so repeated drags share one exact node. */
export function conveyorSocket(raw: Point, machines: PlacedMachine[], side: 'in' | 'out', workstationId?: string): { point: Point; machineId: string; angle: number } | null {
  let best: ReturnType<typeof conveyorSocket> = null
  let distance = SNAP_DISTANCE
  for (const m of machines) {
    if (m.componentType === 'workstation' || (side === 'out' && m.componentType === 'finished-goods') || (side === 'in' && m.componentType === 'raw-material')) continue
    if (m.workstationId !== workstationId && !(workstationId === undefined && m.workstationId && hostedPortAtEdge(m, side, machines))) continue
    const point = ports(m)[side]
    const d = Math.hypot(point[0] - raw[0], point[1] - raw[1])
    if (d < distance) {
      distance = d
      best = { point, machineId: m.id, angle: m.componentType === 'conveyor-belt' ? tangentAngle(m, side === 'out' ? 1 : 0) : (m.rotation ?? 0) * Math.PI / 2 }
    }
  }
  return best
}

export function conveyorStart(raw: Point, machines: PlacedMachine[], workstationId?: string): Point {
  const socket = conveyorSocket(raw, machines, 'out', workstationId)
  if (socket) return socket.point
  let best: Point = raw
  let distance = 1.3
  for (const m of machines) {
    if (m.componentType !== 'conveyor-belt' || m.workstationId !== workstationId) continue
    const nearest = closestBeltPoint(m, raw)
    if (nearest.distance < distance) { best = nearest.point; distance = nearest.distance }
  }
  return best
}

function destinationSocket(raw: Point, source: Point, machines: PlacedMachine[], workstationId?: string) {
  const candidates = machines.filter((m) => Math.hypot(ports(m).in[0] - source[0], ports(m).in[1] - source[1]) >= MIN_LENGTH)
  const input = conveyorSocket(raw, candidates, 'in', workstationId)
  const output = conveyorSocket(raw, candidates.filter((m) => m.componentType === 'conveyor-belt' &&
    Math.hypot(ports(m).out[0] - source[0], ports(m).out[1] - source[1]) >= MIN_LENGTH), 'out', workstationId)
  if (!input) return output
  if (!output) return input
  return Math.hypot(raw[0] - output.point[0], raw[1] - output.point[1]) < Math.hypot(raw[0] - input.point[0], raw[1] - input.point[1]) ? output : input
}

function conveyorEnd(raw: Point, source: Point, machines: PlacedMachine[], workstationId?: string): Point {
  const socket = destinationSocket(raw, source, machines, workstationId)
  if (socket) return socket.point
  let best: Point = [halfGrid(raw[0]), halfGrid(raw[1])]
  let distance = 1.15
  for (const m of machines) {
    if (m.workstationId !== workstationId || m.componentType !== 'conveyor-belt') continue
    const nearest = closestBeltPoint(m, raw)
    if (nearest.distance < distance && Math.hypot(nearest.point[0] - source[0], nearest.point[1] - source[1]) >= MIN_LENGTH) {
      best = nearest.point; distance = nearest.distance
    }
  }
  return best
}

function anchorTangent(point: Point, machines: PlacedMachine[], workstationId: string | undefined, side: 'in' | 'out'): number | undefined {
  for (const m of machines) {
    if (m.workstationId !== workstationId || m.componentType !== 'conveyor-belt') continue
    const nearest = closestBeltPoint(m, point)
    if (nearest.distance < 0.08) return tangentAngle(m, nearest.t)
  }
  for (const m of machines) {
    if (m.workstationId !== workstationId || m.componentType === 'workstation') continue
    if (same(ports(m)[side], point)) return m.angle ?? (m.rotation ?? 0) * Math.PI / 2
  }
  return undefined
}

/** Draw at the cursor's actual heading, with a half-unit endpoint grid for stable preview. */
export function layDirectionalConveyorRun(start: Point, rawCursor: Point, machines: PlacedMachine[], idleRotation: number, workstationId?: string): Laid[] | null {
  const source = conveyorStart(start, machines, workstationId)
  const cursor = conveyorEnd(rawCursor, source, machines, workstationId)
  let dx = cursor[0] - source[0], dz = cursor[1] - source[1]
  let reach = Math.hypot(dx, dz)
  if (reach < 0.5) { [dx, dz] = [...DIRECTIONS[idleRotation % 4]]; reach = machineWidth('conveyor-belt') }
  const ux = dx / (Math.hypot(dx, dz) || 1), uz = dz / (Math.hypot(dx, dz) || 1)
  const angle = Math.atan2(-uz, ux)
  const entryAngle = conveyorSocket(source, machines, 'out', workstationId)?.angle ?? anchorTangent(source, machines, workstationId, 'out')
  const exitAngle = destinationSocket(cursor, source, machines, workstationId)?.angle ?? anchorTangent(cursor, machines, workstationId, 'in')
  const length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, reach))
  const make = (from: number, extent: number, host?: string, entry?: number, exit?: number): Laid => ({
    position: [source[0] + ux * (from + extent / 2), 0, source[1] + uz * (from + extent / 2)],
    length: extent, rotation: idleRotation, angle,
    ...(entry === undefined ? {} : { entryAngle: entry }), ...(exit === undefined ? {} : { exitAngle: exit }),
    ...(host ? { workstationId: host } : {}),
  })
  if (!workstationId) {
    const piece = make(0, length, undefined, entryAngle, exitAngle)
    const [w, d] = machineFootprint({ componentType: 'conveyor-belt', ...piece })
    return fitsFloor(piece.position[0], piece.position[2], w, d) ? [piece] : null
  }
  const host = machines.find((m) => m.id === workstationId && m.componentType === 'workstation')
  if (!host) return null
  const [w, d] = footprint('workstation', host.length, host.rotation ?? 0, host.breadth)
  const exits = [ux > 1e-6 ? (host.position[0] + w / 2 - source[0]) / ux : ux < -1e-6 ? (host.position[0] - w / 2 - source[0]) / ux : Infinity,
    uz > 1e-6 ? (host.position[2] + d / 2 - source[1]) / uz : uz < -1e-6 ? (host.position[2] - d / 2 - source[1]) / uz : Infinity]
  const edge = Math.min(...exits.filter((value) => value >= 0))
  const deckLength = Math.min(length, edge)
  const pieces: Laid[] = []
  if (deckLength > 0.1) {
    const piece = make(0, deckLength, workstationId, entryAngle, deckLength === length ? exitAngle : undefined)
    pieces.push(piece)
  }
  const floorLength = length - deckLength
  if (floorLength >= MIN_LENGTH) {
    const piece = make(deckLength, floorLength, undefined, undefined, exitAngle)
    const [fw, fd] = machineFootprint({ componentType: 'conveyor-belt', ...piece })
    if (!fitsFloor(piece.position[0], piece.position[2], fw, fd)) return null
    pieces.push(piece)
  }
  return pieces.length ? pieces : null
}

/**
 * Lay a conveyor from `start` toward `cursor`, along whichever axis the cursor is further on.
 * The start snaps to a nearby output and the end to an input on the same line, like pipe-laying tools.
 */
export function layConveyor(start: Point, cursor: Point, machines: PlacedMachine[], idleRotation: number): Laid | null {
  const source = machines.filter((m) => m.componentType !== 'finished-goods' && m.componentType !== 'workstation').map((m) => ({ m, p: ports(m).out }))
    .filter(({ p }) => Math.hypot(p[0] - start[0], p[1] - start[1]) < SNAP_DISTANCE)
    .sort((a, b) => Math.hypot(a.p[0] - start[0], a.p[1] - start[1]) - Math.hypot(b.p[0] - start[0], b.p[1] - start[1]))[0]
  const o = source?.p ?? start
  const dx = cursor[0] - o[0]
  const dz = cursor[1] - o[1]
  const idle = Math.hypot(dx, dz) < 0.5
  const alongX = Math.abs(dx) >= Math.abs(dz)
  const rotation = idle ? idleRotation % 4 : alongX ? (dx > 0 ? 0 : 2) : (dz > 0 ? 3 : 1)
  const [ux, uz] = DIRECTIONS[rotation]
  const bend = source && link(source.m, { rotation }) // straight on, or around a corner tile; null when facing back
  const s: Point = source && bend ? [o[0] + bend[0], o[1] + bend[1]] : start
  const reach = (cursor[0] - s[0]) * ux + (cursor[1] - s[1]) * uz
  let length = idle ? machineWidth('conveyor-belt') : Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.round(reach)))

  for (const m of machines) { // end snap: an input ahead of us (straight or around a bend), within reach of the cursor
    if (m.componentType === 'raw-material') continue
    const l = link({ rotation }, m)
    if (!l) continue
    const pin = ports(m).in
    const target: Point = [pin[0] - l[0], pin[1] - l[1]]
    const along = (target[0] - s[0]) * ux + (target[1] - s[1]) * uz
    const off = (target[0] - s[0]) * uz - (target[1] - s[1]) * ux
    if (Math.abs(off) < 1e-4 && along >= MIN_LENGTH && along <= MAX_LENGTH && Math.abs(along - length) <= SNAP_DISTANCE) length = along
  }
  const type = 'conveyor-belt'
  while (length > MIN_LENGTH && !fits(type, length, rotation, [s[0] + ux * length / 2, 0, s[1] + uz * length / 2])) length--
  const position: FloorPosition = [s[0] + ux * length / 2, 0, s[1] + uz * length / 2]
  return fits(type, length, rotation, position) ? { position, length, rotation } : null
}

/** Lay from one support surface, splitting at the workstation edge when the gesture continues onto the floor. */
export function layConveyorRun(start: Point, cursor: Point, machines: PlacedMachine[], idleRotation: number, workstationId?: string): Laid[] | null {
  if (!workstationId) {
    const laid = layConveyor(start, cursor, machines.filter((machine) => !machine.workstationId || hostedPortAtEdge(machine, 'out', machines)), idleRotation)
    return laid ? [laid] : null
  }
  const host = machines.find((machine) => machine.id === workstationId && machine.componentType === 'workstation')
  if (!host) return null
  const laid = layConveyor(start, cursor, machines.filter((machine) => machine.workstationId === workstationId), idleRotation)
  if (!laid) return null
  const [dx, dz] = DIRECTIONS[laid.rotation]
  const source: Point = [laid.position[0] - dx * laid.length / 2, laid.position[2] - dz * laid.length / 2]
  const [width, depth] = footprint('workstation', host.length, host.rotation ?? 0, host.breadth)
  const edge = dx ? host.position[0] + dx * width / 2 : host.position[2] + dz * depth / 2
  const deckLength = Math.max(0, Math.min(laid.length, dx ? (edge - source[0]) * dx : (edge - source[1]) * dz))
  const pieces: Laid[] = []
  if (deckLength > 0.01) {
    const position: FloorPosition = [source[0] + dx * deckLength / 2, 0, source[1] + dz * deckLength / 2]
    if (workstationForFootprint('conveyor-belt', deckLength, laid.rotation, position, [host]) !== workstationId) return null
    pieces.push({ position, length: deckLength, rotation: laid.rotation, workstationId })
  }
  const floorLength = laid.length - deckLength
  if (floorLength >= MIN_LENGTH) {
    const position: FloorPosition = [source[0] + dx * (deckLength + floorLength / 2), 0, source[1] + dz * (deckLength + floorLength / 2)]
    if (!fits('conveyor-belt', floorLength, laid.rotation, position)) return null
    pieces.push({ position, length: floorLength, rotation: laid.rotation })
  }
  return pieces.length ? pieces : null
}

/** Quarter-turn a machine in place; ignored when the turned footprint would leave the floor. */
export function rotateMachine(m: PlacedMachine): PlacedMachine {
  if (m.componentType === 'conveyor-belt' && m.angle !== undefined) {
    const angle = m.angle + Math.PI / 2
    const turned = { ...m, angle,
      ...(m.entryAngle === undefined ? {} : { entryAngle: m.entryAngle + Math.PI / 2 }),
      ...(m.exitAngle === undefined ? {} : { exitAngle: m.exitAngle + Math.PI / 2 }) }
    const [width, depth] = machineFootprint(turned)
    return fitsFloor(m.position[0], m.position[2], width, depth) ? turned : m
  }
  const rotation = ((m.rotation ?? 0) + 1) % 4
  return fits(m.componentType, m.length, rotation, m.position, m.breadth) ? { ...m, rotation } : m
}

/** Resize a deposit or workstation along either axis. Keep a deposit's attached feed port fixed. */
export function resizeStorage(m: PlacedMachine, machines: PlacedMachine[], axis: 'length' | 'breadth', requested: number): PlacedMachine {
  if (!isResizableAreaType(m.componentType)) return m
  const minimum = axis === 'length' ? getStorageDefault(m.componentType, 'length') : getStorageDefault(m.componentType, 'breadth')
  const next = Math.min(MAX_STORAGE_SIZE, Math.max(minimum, Math.round(requested)))
  const current = axis === 'length' ? machineWidth(m.componentType, m.length) : machineDepth(m.componentType, m.breadth)
  if (next === current) return m
  let position = m.position
  if (axis === 'length') {
    const connected = connectedPorts(m, machines)
    const keepOutput = m.componentType === 'raw-material' && connected.out
    const keepInput = m.componentType === 'finished-goods' && connected.in
    if (keepOutput || keepInput) {
      const [dx, dz] = dir(m)
      const shift = (next - current) / 2 * (keepOutput ? -1 : 1)
      position = [position[0] + dx * shift, 0, position[2] + dz * shift]
    }
  }
  const resized = { ...m, position, [axis]: next }
  const mountedFit = m.componentType !== 'workstation' || machines.every((child) => child.workstationId !== m.id ||
    workstationContains(child, [resized]) === m.id)
  const connectedFit = m.componentType !== 'workstation' || preservesSurfaceTransitions(machines, machines.map((machine) => machine.id === m.id ? resized : machine))
  return fits(resized.componentType, resized.length, resized.rotation ?? 0, resized.position, resized.breadth) && mountedFit && connectedFit &&
    (!m.workstationId || workstationForFootprint(resized.componentType, resized.length, resized.rotation ?? 0, resized.position, machines, resized.breadth) === m.workstationId) ? resized : m
}

function getStorageDefault(type: FactoryComponentType, axis: 'length' | 'breadth'): number {
  return axis === 'length' ? machineWidth(type) : machineDepth(type)
}

/** Change a conveyor's length, keeping the connected end fixed (the start unless only the output is connected). */
export function resizeConveyor(m: PlacedMachine, machines: PlacedMachine[], requested: number): PlacedMachine {
  const length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.round(requested)))
  const current = machineWidth(m.componentType, m.length)
  if (m.componentType !== 'conveyor-belt' || length === current) return m
  const terminalOut = machines.some((other) => other.id !== m.id && mated(m, other, machines))
  const terminalIn = machines.some((other) => other.id !== m.id && mated(other, m, machines))
  const shift = (length - current) / 2 * (terminalOut && !terminalIn ? -1 : 1)
  const [dx, dz] = direction(m)
  const position: FloorPosition = [m.position[0] + dx * shift, 0, m.position[2] + dz * shift]
  const resized = { ...m, length, position }
  const [width, depth] = machineFootprint(resized)
  return fitsFloor(position[0], position[2], width, depth) ? resized : m
}

/** Resize a laid belt and carry the connected downstream section with its moving output. */
export function resizeConveyorLayout(id: string, machines: PlacedMachine[], requested: number): PlacedMachine[] | null {
  const belt = machines.find((machine) => machine.id === id)
  if (!belt || assemblyLocked(linkedAssembly(id, machines), machines)) return null
  const resized = resizeConveyor(belt, machines, requested)
  if (resized === belt) return null

  const before = ports(belt).out
  const after = ports(resized).out
  const dx = after[0] - before[0]
  const dz = after[1] - before[1]
  const downstream = new Set<string>()
  if (dx || dz) {
    const pending = [belt]
    while (pending.length) {
      const current = pending.pop()!
      for (const next of machines) {
        if (next.id === id || downstream.has(next.id) || !mated(current, next, machines)) continue
        downstream.add(next.id)
        pending.push(next)
      }
    }
  }

  const updated = machines.map((machine) => {
    if (machine.id === id) return resized
    return downstream.has(machine.id)
      ? { ...machine, position: [machine.position[0] + dx, 0, machine.position[2] + dz] as FloorPosition }
      : machine
  })
  const preserved = machines.every((a) => machines.every((b) => {
    if (a === b || !feeds(a, b, machines)) return true
    const nextA = updated.find((item) => item.id === a.id)!
    const nextB = updated.find((item) => item.id === b.id)!
    return feeds(nextA, nextB, updated)
  }))
  return preserved && updated.every((machine) => {
    const [width, depth] = machineFootprint(machine)
    return fitsFloor(machine.position[0], machine.position[2], width, depth) &&
      (!machine.workstationId || workstationContains(machine, updated) === machine.workstationId)
  }) &&
    preservesSurfaceTransitions(machines, updated) ? updated : null
}
