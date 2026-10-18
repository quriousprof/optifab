import { useEffect, useMemo, type ReactNode } from 'react'
import type { MachineStatus } from './api'
import { Edges, Html } from '@react-three/drei'
import { CatmullRomCurve3, EdgesGeometry, Vector3 } from 'three'
import { getFactoryComponent, machineDepth, machineWidth, type FactoryComponentType, type FloorPosition, type PlacedMachine } from './factoryComponents'
import { beltEnds, beltPoint, beltTangent, beltTrimParameter, type BeltPath } from './conveyorPath'
import { beltCoverage, rampHeight, sweepBelt, sweepRamp } from './conveyorGeometry'

const noRaycast = () => {}
// Floor pad colour per machine state; the label tag repeats the state in text.
const STATUS_COLOR: Record<MachineStatus, string> = { idle: '#9aa9b3', processing: '#2f9e5f', failed: '#d23b32', blocked: '#e0a019' }
type Point = [number, number, number]

function BoxPart({ at, size, color, ghost, machineId, metalness = 0.18, emissive }: {
  at: Point; size: Point; color: string; ghost: boolean; machineId?: string; metalness?: number; emissive?: string
}) {
  return <mesh position={at} castShadow={!ghost} receiveShadow={!ghost} raycast={ghost ? noRaycast : undefined} userData={machineId ? { machineId } : {}}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} roughness={0.52} metalness={metalness} emissive={emissive} emissiveIntensity={emissive ? 0.28 : 0}
      transparent={ghost} opacity={ghost ? 0.35 : 1} depthWrite={!ghost} />
  </mesh>
}

function CylinderPart({ at, radius, height, color, ghost, machineId, rotation }: {
  at: Point; radius: number; height: number; color: string; ghost: boolean; machineId?: string; rotation?: Point
}) {
  return <mesh position={at} rotation={rotation} castShadow={!ghost} receiveShadow={!ghost} raycast={ghost ? noRaycast : undefined} userData={machineId ? { machineId } : {}}>
    <cylinderGeometry args={[radius, radius, height, 24]} />
    <meshStandardMaterial color={color} roughness={0.48} metalness={0.3} transparent={ghost} opacity={ghost ? 0.35 : 1} depthWrite={!ghost} />
  </mesh>
}

function CurvedConveyor({ length, angle, entryAngle, exitAngle, color, ghost, machineId, transitionIn, transitionOut, position, neighbors, highlighted }: {
  highlighted: boolean; length: number; angle: number; entryAngle?: number; exitAngle?: number; color: string; ghost: boolean; machineId?: string; transitionIn: boolean; transitionOut: boolean; position: FloorPosition; neighbors: PlacedMachine[]
}) {
  const path: BeltPath = { position: [0, 0, 0], length, angle: 0,
    entryAngle: entryAngle === undefined ? undefined : entryAngle - angle,
    exitAngle: exitAngle === undefined ? undefined : exitAngle - angle }
  const from = transitionIn ? beltTrimParameter(path, 'start') : 0
  const to = transitionOut ? beltTrimParameter(path, 'end') : 1
  const worldPath: BeltPath = { position, length, angle, entryAngle, exitAngle }
  const coverage = useMemo(() => {
    const ends = beltEnds(worldPath)
    return neighbors.map((peer) => {
      const other = beltEnds(peer)
      const sharedMouth = Math.hypot(ends.start[0] - other.start[0], ends.start[1] - other.start[1]) < 0.01 ||
        Math.hypot(ends.end[0] - other.end[0], ends.end[1] - other.end[1]) < 0.01
      return { rail: beltCoverage(peer, 1.1), slat: sharedMouth ? beltCoverage(peer, 2.0) : () => false }
    })
  }, [neighbors, length, angle, entryAngle, exitAngle, position[0], position[2]])
  const railVisible = (side: number) => (t: number) => {
    const [x, z] = beltPoint(worldPath, t)
    const [dx, dz] = beltTangent(worldPath, t)
    // Probe just outside the rail: coincident outer edges remain, interior dividers disappear.
    const point: [number, number] = [x - dz * side * 1.15, z + dx * side * 1.15]
    return !coverage.some((peer) => peer.rail(point))
  }
  const shapes = useMemo(() => ({
    base: sweepBelt(path, from, to, 2.2, 0.085, 0.635),
    bed: sweepBelt(path, from, to, 2.08, 0.625, 0.715),
    leftRail: sweepBelt(path, from, to, 0.12, 0.61, 0.93, -1.04, railVisible(-1)),
    rightRail: sweepBelt(path, from, to, 0.12, 0.61, 0.93, 1.04, railVisible(1)),
    // Outline hugs the curved strip; the sweep's only hard creases are its outer edges and end caps.
    outline: new EdgesGeometry(sweepBelt(path, from, to, 2.5, 0.0, 1.0), 30),
  }), [length, angle, entryAngle, exitAngle, from, to, position[0], position[2], neighbors])
  useEffect(() => () => { Object.values(shapes).forEach((geometry) => geometry.dispose()) }, [shapes])
  const material = (colorValue: string) => <meshStandardMaterial color={colorValue} roughness={0.52} metalness={0.18} transparent={ghost} opacity={ghost ? 0.35 : 1} depthWrite={!ghost} />
  const pick = ghost ? noRaycast : undefined
  const data = machineId ? { machineId } : {}
  const slats = Math.min(48, Math.max(3, Math.ceil(length / 0.65)))
  return <>
    <mesh geometry={shapes.base} castShadow={!ghost} receiveShadow={!ghost} raycast={pick} userData={data}>{material('#334b50')}</mesh>
    <mesh geometry={shapes.bed} receiveShadow={!ghost} raycast={pick} userData={data}>{material('#576f70')}</mesh>
    <mesh geometry={shapes.leftRail} castShadow={!ghost} raycast={pick} userData={data}>{material(color)}</mesh>
    <mesh geometry={shapes.rightRail} castShadow={!ghost} raycast={pick} userData={data}>{material(color)}</mesh>
    {highlighted && <lineSegments geometry={shapes.outline} raycast={noRaycast}><lineBasicMaterial color="#29edff" toneMapped={false} depthTest={false} /></lineSegments>}
    {Array.from({ length: slats }, (_, index) => {
      const t = from + (to - from) * (index + 0.5) / slats
      const worldPoint = beltPoint(worldPath, t)
      if (coverage.some((peer) => peer.slat(worldPoint))) return null
      const [x, z] = beltPoint(path, t)
      const [dx, dz] = beltTangent(path, t)
      return <mesh key={index} position={[x, 0.735, z]} rotation={[0, Math.atan2(-dz, dx), 0]} raycast={pick} userData={data}>
        <boxGeometry args={[0.08, 0.04, 1.72]} />
        {material('#b5c6c6')}
      </mesh>
    })}
  </>
}

/** Curved corner tile between two connected conveyors. */
export function CornerMesh({ center, from, to, highlighted, elevation = 0 }: { center: [number, number]; from: [number, number]; to: [number, number]; highlighted: boolean; elevation?: number }) {
  const pivot = [center[0] - from[0] + to[0], center[1] - from[1] + to[1]]
  const start = Math.atan2(from[0] - to[0], from[1] - to[1]) - Math.PI / 4
  const rail = (radius: number) => new CatmullRomCurve3(Array.from({ length: 13 }, (_, index) => {
    const angle = start + index * Math.PI / 24
    return new Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius)
  }))
  return <group position={[pivot[0], elevation, pivot[1]]}>
    <mesh position={[0, 0.36, 0]} castShadow receiveShadow raycast={noRaycast}>
      <cylinderGeometry args={[2.12, 2.12, 0.55, 32, 1, false, start, Math.PI / 2]} />
      <meshStandardMaterial color="#334b50" roughness={0.62} metalness={0.18} />
      {highlighted && <Edges color="#29edff" lineWidth={1.8} toneMapped={false} depthTest={false} raycast={noRaycast} />}
    </mesh>
    <mesh position={[0, 0.67, 0]} receiveShadow raycast={noRaycast}>
      <cylinderGeometry args={[1.94, 1.94, 0.09, 32, 1, false, start, Math.PI / 2]} />
      <meshStandardMaterial color="#576f70" roughness={0.6} metalness={0.16} />
    </mesh>
    {[0.13, 2.05].map((radius) => <mesh key={radius} position={[0, 0.77, 0]} castShadow raycast={noRaycast}>
      <tubeGeometry args={[rail(radius), 24, 0.09, 8, false]} />
      <meshStandardMaterial color="#378568" roughness={0.5} />
    </mesh>)}
    {Array.from({ length: 5 }, (_, index) => {
      const angle = start + (index + 0.5) * Math.PI / 10
      return <mesh key={index} position={[Math.sin(angle) * 1.04, 0.73, Math.cos(angle) * 1.04]} rotation={[0, angle, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.07, 0.04, 1.7]} />
        <meshStandardMaterial color="#b5c6c6" roughness={0.55} />
      </mesh>
    })}
  </group>
}

/** Short raised-to-floor conveyor joint, drawn across a connected pair's common port. */
export function TransitionMesh({ center, rotation, fromHeight, toHeight, highlighted, ghost = false }: { center: [number, number]; rotation: number; fromHeight: number; toHeight: number; highlighted: boolean; ghost?: boolean }) {
  const shapes = useMemo(() => {
    const base = sweepRamp(fromHeight, toHeight, 2.2, 0.085, 0.635)
    return {
      base,
      bed: sweepRamp(fromHeight, toHeight, 2.08, 0.625, 0.715),
      leftRail: sweepRamp(fromHeight, toHeight, 0.12, 0.61, 0.93, -1.04),
      rightRail: sweepRamp(fromHeight, toHeight, 0.12, 0.61, 0.93, 1.04),
      outline: new EdgesGeometry(base, 30),
    }
  }, [fromHeight, toHeight])
  useEffect(() => () => { Object.values(shapes).forEach((geometry) => geometry.dispose()) }, [shapes])
  const material = (color: string) => <meshStandardMaterial color={color} roughness={0.52} metalness={0.18} transparent={ghost} opacity={ghost ? 0.35 : 1} depthWrite={!ghost} />
  return <group position={[center[0], 0, center[1]]} rotation={[0, rotation * Math.PI / 2, 0]}>
    <mesh geometry={shapes.base} castShadow={!ghost} receiveShadow={!ghost} raycast={noRaycast}>{material('#334b50')}</mesh>
    <mesh geometry={shapes.bed} receiveShadow={!ghost} raycast={noRaycast}>{material('#576f70')}</mesh>
    <mesh geometry={shapes.leftRail} castShadow={!ghost} raycast={noRaycast}>{material('#378568')}</mesh>
    <mesh geometry={shapes.rightRail} castShadow={!ghost} raycast={noRaycast}>{material('#378568')}</mesh>
    {[-0.62, 0, 0.62].map((x) => <mesh key={x} position={[x, rampHeight(fromHeight, toHeight, x) + 0.735, 0]} raycast={noRaycast}>
      <boxGeometry args={[0.08, 0.04, 1.72]} />
      {material('#b5c6c6')}
    </mesh>)}
    {highlighted && <lineSegments geometry={shapes.outline} raycast={noRaycast}><lineBasicMaterial color="#29edff" toneMapped={false} depthTest={false} /></lineSegments>}
  </group>
}

export function MachineMesh({ componentType, position, ghost = false, machineId, selected = false, highlighted = false, locked = false, mounted = false, transitionIn = false, transitionOut = false, groupSize = 1, onDelete, length, breadth, rotation = 0, angle, entryAngle, exitAngle, neighbors = [], ports, label, displayLabel, status, details }: {
  componentType: FactoryComponentType
  position: FloorPosition
  ghost?: boolean
  machineId?: string
  selected?: boolean
  highlighted?: boolean
  locked?: boolean
  mounted?: boolean
  transitionIn?: boolean
  transitionOut?: boolean
  groupSize?: number
  onDelete?: () => void
  length?: number
  breadth?: number
  rotation?: number
  angle?: number
  entryAngle?: number
  exitAngle?: number
  neighbors?: PlacedMachine[]
  ports?: { in: boolean; out: boolean }
  label?: string // backend machine ID, e.g. F1
  displayLabel?: string
  status?: MachineStatus // from FactoryState.machineStates[label]
  details?: ReactNode // digital-twin controls rendered in the selection card
}) {
  const component = getFactoryComponent(componentType)
  const [, height] = component.dimensions
  const width = machineWidth(componentType, length)
  const depth = machineDepth(componentType, breadth)
  const hasInspector = componentType === 'cutting-machine' || componentType === 'forming-machine' || componentType === 'inspection-machine'
  const part = (at: Point, size: Point, color: string, metalness?: number, emissive?: string) =>
    <BoxPart at={at} size={size} color={color} ghost={ghost} machineId={machineId} metalness={metalness} emissive={emissive} />
  const cylinder = (at: Point, radius: number, partHeight: number, color: string, partRotation?: Point) =>
    <CylinderPart at={at} radius={radius} height={partHeight} color={color} ghost={ghost} machineId={machineId} rotation={partRotation} />

  return <group position={position} rotation={[0, angle ?? rotation * Math.PI / 2, 0]} name={`${ghost ? 'Preview' : 'Component'}: ${component.name}`}>
    {componentType === 'conveyor-belt' ?
      <CurvedConveyor length={width} angle={angle ?? rotation * Math.PI / 2} entryAngle={entryAngle} exitAngle={exitAngle} color={component.color} ghost={ghost} machineId={machineId} transitionIn={transitionIn} transitionOut={transitionOut} position={position} neighbors={neighbors} highlighted={(selected || highlighted) && !ghost} /> : componentType === 'workstation' ? <>
      {part([0, 0.23, 0], [width, 0.46, depth], '#8399a5', 0.26)}
      {part([0, 0.48, 0], [width - 0.24, 0.04, depth - 0.24], '#c7d6dc', 0.2)}
      {[-1, 1].map((side) => <BoxPart key={side} at={[0, 0.5, side * (depth / 2 - 0.17)]} size={[width - 0.6, 0.025, 0.08]} color="#eef5f6" ghost={ghost} machineId={machineId} />)}
    </> : <>
      {part([0, 0.16, 0], [width - 0.15, 0.32, depth - 0.15], '#354b57', 0.3)}
      {part([0, 0.37, 0], [width - 0.28, 0.12, depth - 0.28], '#aebdc5', 0.48)}
      {!['raw-material', 'finished-goods'].includes(componentType) && part([0, 0.55, 0], [width - 1.4, 0.16, 1.2], '#667d86', 0.35)}
      {(['in', 'out'] as const).filter((side) => componentType !== 'raw-material' || side === 'out').filter((side) => componentType !== 'finished-goods' || side === 'in').map((side) => {
        const x = (side === 'in' ? -1 : 1) * (width / 2 - 0.53)
        return <group key={side}>
          {part([x, 0.54, 0], [0.92, 0.19, 1.28], '#687d85', 0.35)}
          {[-0.38, 0, 0.38].map((z) => <BoxPart key={z} at={[x, 0.65, z]} size={[0.64, 0.035, 0.055]} color="#c3d1d4" ghost={ghost} machineId={machineId} />)}
        </group>
      })}
      <group scale={[1.2, 1.15, 1.2]}>
      {componentType === 'cutting-machine' && <>
        {part([0, 1.1, 0], [2.18, 1.23, 1.9], component.color, 0.35)}
        {part([0, 1.12, -0.99], [1.32, 0.62, 0.09], '#223946', 0.4)}
        {part([0, 1.15, -1.06], [0.96, 0.38, 0.035], '#80b5c6', 0.2)}
        {part([0, 1.79, 0], [2.33, 0.17, 2.03], '#263f50', 0.5)}
        {cylinder([0, 0.83, 0], 0.44, 0.12, '#d9e4e9', [Math.PI / 2, 0, 0])}
      </>}
      {componentType === 'forming-machine' && <>
        {part([0, 0.88, 0], [2.1, 0.33, 1.84], '#536772', 0.55)}
        {[-0.88, 0.88].flatMap((x) => [-0.74, 0.74].map((z) =>
          <BoxPart key={`${x}:${z}`} at={[x, 1.72, z]} size={[0.17, 1.67, 0.17]} color="#d8e0e2" ghost={ghost} machineId={machineId} metalness={0.65} />))}
        {part([0, 2.6, 0], [2.25, 0.43, 1.85], component.color, 0.4)}
        {cylinder([0, 1.94, 0], 0.27, 0.9, '#ccd7db')}
        {part([0, 1.34, 0], [0.88, 0.2, 0.72], '#d9e2e4', 0.65)}
      </>}
      {componentType === 'inspection-machine' && <>
        {[-0.8, 0.8].map((z) => <BoxPart key={z} at={[0, 1.45, z]} size={[0.22, 1.95, 0.28]} color={component.color} ghost={ghost} machineId={machineId} />)}
        {part([0, 2.46, 0], [1.95, 0.28, 1.86], '#3d6269', 0.4)}
        {part([0, 2.31, 0], [1.26, 0.05, 0.1], '#9be5df', 0.2, '#4ccbc4')}
        {part([0, 0.82, 0], [2.04, 0.11, 1.28], '#dae5e6', 0.5)}
      </>}
      </group>
      {componentType === 'raw-material' && <>
        {part([-0.3, 0.67, 0], [width - 1.55, 0.16, depth - 0.55], '#7b6548')}
        {[-1, 1].map((side) => <BoxPart key={side} at={[-0.3, 1.12, side * (depth / 2 - 0.28)]} size={[width - 1.55, 0.94, 0.13]} color={component.color} ghost={ghost} machineId={machineId} />)}
        {part([-width / 2 + 0.42, 1.12, 0], [0.13, 0.94, depth - 0.55], component.color)}
        {[0, 1, 2].map((index) => <BoxPart key={index} at={[-0.28, 0.83 + index * 0.18, 0]} size={[width - 2.1, 0.11, depth - 1.35]} color="#c8b495" ghost={ghost} machineId={machineId} />)}
      </>}
      {componentType === 'finished-goods' && <>
        {part([0.3, 0.68, 0], [width - 1.55, 0.13, depth - 0.55], '#597184')}
        {[-1, 1].map((side) => <BoxPart key={side} at={[0.3, 1.07, side * (depth / 2 - 0.28)]} size={[width - 1.55, 0.8, 0.12]} color={component.color} ghost={ghost} machineId={machineId} />)}
        {part([width / 2 - 0.42, 1.07, 0], [0.12, 0.8, depth - 0.55], component.color)}
        {[[-0.6, -0.65], [0.3, 0.45], [1.2, -0.15]].map(([x, z], index) => <BoxPart key={index} at={[x, 0.96, z]} size={[0.72, 0.38, 0.76]} color="#b9ced2" ghost={ghost} machineId={machineId} />)}
      </>}
    </>}
    {!ghost && ports && componentType !== 'workstation' && (['in', 'out'] as const).filter((side) => !(componentType === 'conveyor-belt' && ports?.[side])).filter((side) => componentType !== 'raw-material' || side === 'out').filter((side) => componentType !== 'finished-goods' || side === 'in').map((side) =>
      <mesh key={side} position={[(side === 'in' ? -1 : 1) * (width / 2 - 0.06), 0.57, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.2, 0.35, 0.58]} />
        <meshStandardMaterial color={ports[side] ? '#2fd16b' : side === 'in' ? '#e8a33d' : '#2d8cff'} />
      </mesh>)}
    {status && !ghost && <mesh position={[0, 0.03, 0]} raycast={noRaycast}>
      <boxGeometry args={[width + 0.5, 0.06, depth + 0.5]} />
      <meshBasicMaterial color={STATUS_COLOR[status]} />
    </mesh>}
    {(displayLabel || label) && (!selected || !hasInspector) && !ghost && <Html position={[0, height + 0.4, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
      <span className="machine-label" data-status={status} title={displayLabel || label}><span className="machine-label-text">{displayLabel || label}</span>{status && status !== 'idle' && <small>{status}</small>}</span>
    </Html>}
    {(selected || highlighted) && !ghost && <>
      {componentType !== 'conveyor-belt' && <mesh position={[0, height / 2, 0]} raycast={noRaycast}>
        <boxGeometry args={[width + 0.3, height + 0.3, depth + 0.3]} />
        <meshBasicMaterial visible={false} />
        <Edges color="#29edff" lineWidth={1.8} toneMapped={false} depthTest={false} raycast={noRaycast} />
      </mesh>}
      {selected && hasInspector && <Html position={[0, height + 0.8, 0]} center zIndexRange={[5, 0]} wrapperClass="machine-status-anchor" style={{ pointerEvents: 'none' }}>
        <section className="machine-status-card" aria-label={`${component.name} details`}>
          {!locked && <button type="button" className="machine-status-delete" aria-label={`Delete ${groupSize > 1 ? 'selected components' : component.name}`} title="Delete" onClick={onDelete}>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 2 8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>}
          <h2>{displayLabel || component.name}</h2>
          {details}
          <p>{locked ? `${groupSize} ${groupSize === 1 ? 'component' : 'components'} locked. Unlock in the sidebar to edit.` : groupSize > 1 ? `${groupSize} components selected. Drag one to move the selection.` : mounted ? 'Drag to reposition on the workstation. Alt-drag to take it off.' : 'Orange marks input; blue marks output. Join ends to build a line.'}</p>
        </section>
      </Html>}
    </>}
  </group>
}
