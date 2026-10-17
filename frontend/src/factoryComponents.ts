export const FLOOR_SIZE = 100

export const FACTORY_COMPONENTS = [
  { type: 'conveyor-belt', name: 'Conveyor Belt', shape: 'box', description: 'Green box', color: '#378568', dimensions: [2, 1, 2] },
  { type: 'assembly-robot', name: 'Assembly Robot', shape: 'cylinder', description: 'Red cylinder', color: '#c55753', dimensions: [3, 4, 3] },
  { type: 'cnc-milling-machine', name: 'CNC Milling Machine', shape: 'box', description: 'Blue box', color: '#3973b8', dimensions: [4, 3, 4] },
] as const

export type FactoryComponent = (typeof FACTORY_COMPONENTS)[number]
export type FactoryComponentType = FactoryComponent['type']
export type FloorPosition = [number, number, number]

export type PlacedMachine = {
  id: string
  componentType: FactoryComponentType
  position: FloorPosition
  length?: number // conveyors only: extent along its flow direction
  rotation?: number // quarter turns about Y; 0 flows toward +X
}

export function getFactoryComponent(type: FactoryComponentType): FactoryComponent {
  return FACTORY_COMPONENTS.find((component) => component.type === type)!
}

export function machineWidth(type: FactoryComponentType, length?: number): number {
  return type === 'conveyor-belt' && length ? length : getFactoryComponent(type).dimensions[0]
}

// Flow direction in [x, z] per quarter turn, matching three.js rotation.y.
export const DIRECTIONS = [[1, 0], [0, -1], [-1, 0], [0, 1]] as const

/** [extent along X, extent along Z] after rotation. */
export function footprint(type: FactoryComponentType, length?: number, rotation = 0): [number, number] {
  const width = machineWidth(type, length)
  const depth = getFactoryComponent(type).dimensions[2]
  return rotation % 2 ? [depth, width] : [width, depth]
}

export function fitsFloor(x: number, z: number, width: number, depth: number): boolean {
  return Math.abs(x) + width / 2 <= FLOOR_SIZE / 2 && Math.abs(z) + depth / 2 <= FLOOR_SIZE / 2
}

export type EditorMode =
  | { mode: 'navigate' }
  | { mode: 'placement'; componentType: FactoryComponentType }
