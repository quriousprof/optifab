import { DIRECTIONS, WORKSTATION_HEIGHT, fitsFloor, footprint, isResizableAreaType, machineDepth, machineWidth, type FactoryComponentType, type FloorPosition, type PlacedMachine } from './factoryComponents.ts'
import { floorPoint, getSnappedFloorPosition } from './placement.ts'
import { Plane, Vector3, type Raycaster } from 'three'

// Lock and key: a machine's flow end is an "out" key and its opposite end an "in" lock.
// Only out meets in, and the two may not face each other, so material flows one way along a line.
export const SNAP_DISTANCE = 2
export const MIN_LENGTH = 2
export const MAX_LENGTH = 100
export const MAX_STORAGE_SIZE = 40
const BEND = 1 // half a conveyor's width: a turn happens inside one corner tile this far from each belt end

type Machine = Pick<PlacedMachine, 'componentType' | 'position' | 'length' | 'breadth' | 'rotation' | 'workstationId'>
type Point = [number, number]

const dir = (m: Pick<Machine, 'rotation'>) => DIRECTIONS[(m.rotation ?? 0) % 4]
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
  const l = link(a, b)
  const out = ports(a).out
  if (l === null || !same([out[0] + l[0], out[1] + l[1]], ports(b).in)) return false
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
  const [dx, dz] = dir(hosted)
  const sign = side === 'out' ? 1 : -1
  const edge = dx ? host.position[0] + sign * dx * width / 2 : host.position[2] + sign * dz * depth / 2
  const port = ports(hosted)[side]
  const contact = dx ? port[0] : port[1]
  const across = dx ? port[1] : port[0]
  const hostAcross = dx ? host.position[2] : host.position[0]
  const halfAcross = dx ? depth / 2 : width / 2
  return Math.abs(contact - edge) < 1e-4 && Math.abs(across - hostAcross) + machineDepth('conveyor-belt') / 2 <= halfAcross
}

function ports(m: Machine): { in: Point; out: Point } {
  const [dx, dz] = dir(m)
  const half = machineWidth(m.componentType, m.length) / 2
  return { in: [m.position[0] - dx * half, m.position[2] - dz * half], out: [m.position[0] + dx * half, m.position[2] + dz * half] }
}

const same = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4

/** Which ports of `m` currently mate with another machine (derived from positions, so nothing to keep in sync). */
export function connectedPorts(m: PlacedMachine, machines: PlacedMachine[]) {
  const others = machines.filter((o) => o.id !== m.id)
  return { in: others.some((o) => mated(o, m, machines)), out: others.some((o) => mated(m, o, machines)) }
}

/** Every component linked through touching ports or an explicit user group. Mounting alone does not group a machine with its workstation. */
export function linkedAssembly(id: string, machines: PlacedMachine[]): Set<string> {
  const members = new Set(machines.some((machine) => machine.id === id) ? [id] : [])
  for (const currentId of members) {
    const current = machines.find((machine) => machine.id === currentId)!
    for (const other of machines) {
      if (members.has(other.id)) continue
      if ((current.groupId && current.groupId === other.groupId) || mated(current, other, machines) || mated(other, current, machines)) members.add(other.id)
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
    const [width, depth] = footprint(machine.componentType, machine.length, machine.rotation ?? 0, machine.breadth)
    return fitsFloor(machine.position[0], machine.position[2], width, depth) &&
      (detach || !machine.workstationId || workstationForFootprint(machine.componentType, machine.length, machine.rotation ?? 0, machine.position, moved, machine.breadth) === machine.workstationId)
  }) && (detach || preservesSurfaceTransitions(machines, moved)) ? moved : null
}

/** Corner tiles: wherever one piece turns a right angle into another. `from`/`to` are the flow directions. */
export function cornerTiles(machines: PlacedMachine[]) {
  const tiles: { center: Point; from: Point; to: Point; ids: [string, string] }[] = []
  for (const a of machines) {
    for (const b of machines) {
      const [ax, az] = dir(a)
      const [bx, bz] = dir(b)
      if (a === b || ax * bx + az * bz !== 0 || !mated(a, b, machines)) continue
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
      rotation: a.rotation ?? 0,
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
      if (!run.has(b.id) && (mated(a, b, machines) || mated(b, a, machines))) run.add(b.id)
    }
  }
  return run
}

/** Fuse end-to-end conveyors on the same line into one longer belt. `preferId` survives when it is part of a merge. */
export function mergeConveyors(machines: PlacedMachine[], preferId?: string): PlacedMachine[] {
  const belts = machines.filter((m) => m.componentType === 'conveyor-belt')
  for (const a of belts) {
    for (const b of belts) {
      if (a === b || a.workstationId !== b.workstationId || (a.rotation ?? 0) !== (b.rotation ?? 0) || !same(ports(a).out, ports(b).in)) continue
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

/** Pull a candidate position onto the nearest compatible port within SNAP_DISTANCE. */
export function snapToConnections(type: FactoryComponentType, length: number | undefined, rotation: number, position: FloorPosition, others: Machine[]): FloorPosition {
  const [dx, dz] = DIRECTIONS[rotation % 4]
  const half = machineWidth(type, length) / 2
  let best = position
  let bestDistance = SNAP_DISTANCE
  const me = { rotation }
  for (const other of others) {
    const before = other.componentType === 'finished-goods' || type === 'raw-material' ? null : link(other, me) // other continues into us
    if (before) {
      const out = ports(other).out
      const center = [out[0] + before[0] + dx * half, out[1] + before[1] + dz * half]
      const d = Math.hypot(position[0] - center[0], position[2] - center[1])
      if (d < bestDistance) { bestDistance = d; best = [center[0], 0, center[1]] }
    }
    const after = type === 'finished-goods' || other.componentType === 'raw-material' ? null : link(me, other) // we continue into other
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

export type Laid = { position: FloorPosition; length: number; rotation: number; workstationId?: string }

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
    workstationForFootprint(child.componentType, child.length, child.rotation ?? 0, child.position, [resized], child.breadth) === m.id)
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
  const connected = connectedPorts(m, machines)
  const shift = (length - current) / 2 * (connected.out && !connected.in ? -1 : 1)
  const [dx, dz] = dir(m)
  const position: FloorPosition = [m.position[0] + dx * shift, 0, m.position[2] + dz * shift]
  return fits(m.componentType, length, m.rotation ?? 0, position) ? { ...m, length, position } : m
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
  return updated.every((machine) => fits(machine.componentType, machine.length, machine.rotation ?? 0, machine.position, machine.breadth) &&
    (!machine.workstationId || workstationForFootprint(machine.componentType, machine.length, machine.rotation ?? 0, machine.position, updated, machine.breadth) === machine.workstationId)) &&
    preservesSurfaceTransitions(machines, updated) ? updated : null
}
