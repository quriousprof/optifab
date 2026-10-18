import { alignMerges, layDirectionalConveyorRun, mergeConveyors } from './connections.ts'
import type { FactoryComponentType, PlacedMachine } from './factoryComponents.ts'

// Six-job scenario on the 3D grid: dock -> 4 cutting -> 3 forming -> 2 inspection -> dock.
// Spacing is wider than docs/six-job-scenario.json because the machine models are 6 x 4 units.
const COLUMN_X = { raw: -27, cutting: -15, forming: 0, inspection: 15, finished: 27 }
const MACHINE_HALF_WIDTH = 3 // machines and docks are 6 units long; ports sit at x ± 3

type Node = { key: string; type: FactoryComponentType; label?: string; x: number; z: number }

const NODES: Node[] = [
  { key: 'raw', type: 'raw-material', x: COLUMN_X.raw, z: 0 },
  ...[-9, -3, 3, 9].map((z, i): Node => ({ key: `C${i + 1}`, type: 'cutting-machine', label: `C${i + 1}`, x: COLUMN_X.cutting, z })),
  ...[-6, 0, 6].map((z, i): Node => ({ key: `F${i + 1}`, type: 'forming-machine', label: `F${i + 1}`, x: COLUMN_X.forming, z })),
  ...[-3, 3].map((z, i): Node => ({ key: `I${i + 1}`, type: 'inspection-machine', label: `I${i + 1}`, x: COLUMN_X.inspection, z })),
  { key: 'finished', type: 'finished-goods', x: COLUMN_X.finished, z: 0 },
]

// Belts follow the physical neighbours; which machine a job uses is the optimizer's decision, not the layout's.
const LINKS: [string, string][] = [
  ['raw', 'C1'], ['raw', 'C2'], ['raw', 'C3'], ['raw', 'C4'],
  ['C1', 'F1'], ['C2', 'F1'], ['C2', 'F2'], ['C3', 'F2'], ['C3', 'F3'], ['C4', 'F3'],
  ['F1', 'I1'], ['F2', 'I1'], ['F2', 'I2'], ['F3', 'I2'],
  ['I1', 'finished'], ['I2', 'finished'],
]

/** The nine-machine factory with input and output docks, joined by conveyors. Labels match the backend IDs. */
export function presetLayout(): PlacedMachine[] {
  const machines: PlacedMachine[] = NODES.map(({ key, type, label, x, z }) => ({
    id: `preset-${key}`, componentType: type, position: [x, 0, z], ...(label ? { label } : {}),
  }))
  const at = Object.fromEntries(NODES.map((node) => [node.key, node]))
  const belts: PlacedMachine[] = []
  for (const [from, to] of LINKS) {
    const start: [number, number] = [at[from].x + MACHINE_HALF_WIDTH, at[from].z]
    const end: [number, number] = [at[to].x - MACHINE_HALF_WIDTH, at[to].z]
    const [piece] = layDirectionalConveyorRun(start, end, [...machines, ...belts], 0) ?? []
    if (!piece) throw new Error(`Preset belt ${from} -> ${to} does not fit the floor`)
    belts.push({ id: `preset-${from}-${to}`, componentType: 'conveyor-belt', ...piece })
  }
  return alignMerges(mergeConveyors([...machines, ...belts]))
}
