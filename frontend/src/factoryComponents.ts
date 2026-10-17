export const FACTORY_COMPONENTS = [
  { type: 'conveyor-belt', name: 'Conveyor Belt', shape: 'box', description: 'Green box', color: '#378568' },
  { type: 'assembly-robot', name: 'Assembly Robot', shape: 'cylinder', description: 'Red cylinder', color: '#c55753' },
  { type: 'cnc-milling-machine', name: 'CNC Milling Machine', shape: 'box', description: 'Blue box', color: '#3973b8' },
] as const

export type FactoryComponent = (typeof FACTORY_COMPONENTS)[number]
export type FactoryComponentType = FactoryComponent['type']

export type EditorMode =
  | { mode: 'navigate' }
  | { mode: 'placement'; componentType: FactoryComponentType }
