export const FLOOR_SIZE = 100

export const FACTORY_COMPONENTS = [
  { type: 'raw-material', name: 'Raw material supply', shape: 'hopper', description: 'Resizable material deposit', color: '#a4773e', dimensions: [6, 2.6, 5] },
  { type: 'conveyor-belt', name: 'Conveyor belt', shape: 'conveyor', description: 'Extendable transfer line', color: '#378568', dimensions: [4, 1, 2.4] },
  { type: 'workstation', name: 'Workstation', shape: 'workstation', description: 'Resizable platform for machine groups', color: '#a9bec8', dimensions: [18, 0.5, 14] },
  { type: 'cutting-machine', name: 'Cutting machine', shape: 'cutter', description: 'Guarded cutting cell', color: '#3973b8', dimensions: [6, 3.4, 4] },
  { type: 'forming-machine', name: 'Forming machine', shape: 'press', description: 'Hydraulic forming press', color: '#b67e3c', dimensions: [6, 3.4, 4] },
  { type: 'inspection-machine', name: 'Inspection machine', shape: 'scanner', description: 'Scanning inspection gate', color: '#378b91', dimensions: [6, 3.4, 4] },
  { type: 'finished-goods', name: 'Finished goods', shape: 'output', description: 'Resizable finished-goods bin', color: '#647d9b', dimensions: [6, 2.6, 5] },
] as const

export type FactoryComponent = (typeof FACTORY_COMPONENTS)[number]
export type FactoryComponentType = FactoryComponent['type']
export type FloorPosition = [number, number, number]

export type PlacedMachine = {
  id: string
  componentType: FactoryComponentType
  position: FloorPosition
  length?: number // conveyors, deposits and workstations: extent along the flow direction
  breadth?: number // deposits and workstations: extent across the flow direction
  rotation?: number // quarter turns about Y; 0 flows toward +X
  angle?: number // free-angle conveyor heading in radians; overrides quarter turns
  groupId?: string // explicit user grouping, in addition to physical port connections
  locked?: boolean
  workstationId?: string // machine mounted on a workstation platform
}

export const WORKSTATION_HEIGHT = 0.5

export function getFactoryComponent(type: FactoryComponentType): FactoryComponent {
  return FACTORY_COMPONENTS.find((component) => component.type === type)!
}

export function machineWidth(type: FactoryComponentType, length?: number): number {
  return length && (type === 'conveyor-belt' || isResizableAreaType(type)) ? length : getFactoryComponent(type).dimensions[0]
}

export function machineDepth(type: FactoryComponentType, breadth?: number): number {
  return breadth && isResizableAreaType(type) ? breadth : getFactoryComponent(type).dimensions[2]
}

export function isStorageType(type: FactoryComponentType): boolean {
  return type === 'raw-material' || type === 'finished-goods'
}

export function isResizableAreaType(type: FactoryComponentType): boolean {
  return type === 'workstation' || isStorageType(type)
}

// Flow direction in [x, z] per quarter turn, matching three.js rotation.y.
export const DIRECTIONS = [[1, 0], [0, -1], [-1, 0], [0, 1]] as const

/** [extent along X, extent along Z] after rotation. */
export function footprint(type: FactoryComponentType, length?: number, rotation = 0, breadth?: number): [number, number] {
  const width = machineWidth(type, length)
  const depth = machineDepth(type, breadth)
  return rotation % 2 ? [depth, width] : [width, depth]
}

export function machineFootprint(machine: Pick<PlacedMachine, 'componentType' | 'length' | 'breadth' | 'rotation' | 'angle'>): [number, number] {
  if (machine.componentType !== 'conveyor-belt' || machine.angle === undefined) return footprint(machine.componentType, machine.length, machine.rotation ?? 0, machine.breadth)
  const width = machineWidth(machine.componentType, machine.length)
  const depth = machineDepth(machine.componentType)
  const c = Math.abs(Math.cos(machine.angle))
  const s = Math.abs(Math.sin(machine.angle))
  return [width * c + depth * s, width * s + depth * c]
}

export function fitsFloor(x: number, z: number, width: number, depth: number): boolean {
  return Math.abs(x) + width / 2 <= FLOOR_SIZE / 2 && Math.abs(z) + depth / 2 <= FLOOR_SIZE / 2
}

export type EditorMode =
  | { mode: 'navigate' }
  | { mode: 'placement'; componentType: FactoryComponentType }
