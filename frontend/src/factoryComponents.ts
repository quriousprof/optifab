export const FLOOR_SIZE = 100

export const FACTORY_COMPONENTS = [
  { type: 'conveyor-belt', name: 'Conveyor Belt', shape: 'box', description: 'Green box', color: '#378568', dimensions: [6, 1, 2] },
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
}

export function getFactoryComponent(type: FactoryComponentType): FactoryComponent {
  return FACTORY_COMPONENTS.find((component) => component.type === type)!
}

export type EditorMode =
  | { mode: 'navigate' }
  | { mode: 'placement'; componentType: FactoryComponentType }
