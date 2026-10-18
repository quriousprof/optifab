import { Edges, Html } from '@react-three/drei'
import { CatmullRomCurve3, Vector3 } from 'three'
import { getFactoryComponent, machineDepth, machineWidth, type FactoryComponentType, type FloorPosition } from './factoryComponents'

const noRaycast = () => {}
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
  const tilt = Math.atan2(toHeight - fromHeight, 2)
  return <group position={[center[0], (fromHeight + toHeight) / 2, center[1]]} rotation={[0, rotation * Math.PI / 2, 0]}>
    <group rotation={[0, 0, tilt]}>
      <mesh position={[0, 0.38, 0]} castShadow={!ghost} receiveShadow={!ghost} raycast={noRaycast}>
        <boxGeometry args={[2.1, 0.44, 2.18]} />
        <meshStandardMaterial color="#334b50" roughness={0.62} metalness={0.18} transparent={ghost} opacity={ghost ? 0.35 : 1} depthWrite={!ghost} />
      </mesh>
      <mesh position={[0, 0.65, 0]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[2.08, 0.09, 1.78]} />
        <meshStandardMaterial color="#576f70" roughness={0.6} metalness={0.16} transparent={ghost} opacity={ghost ? 0.35 : 1} depthWrite={!ghost} />
      </mesh>
      {[-1.04, 1.04].map((z) => <mesh key={z} position={[0, 0.77, z]} castShadow raycast={noRaycast}>
        <boxGeometry args={[2.12, 0.32, 0.12]} />
        <meshStandardMaterial color="#378568" roughness={0.5} transparent={ghost} opacity={ghost ? 0.35 : 1} depthWrite={!ghost} />
      </mesh>)}
      {[-0.62, 0, 0.62].map((x) => <mesh key={x} position={[x, 0.72, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.08, 0.04, 1.72]} />
        <meshStandardMaterial color="#b5c6c6" transparent={ghost} opacity={ghost ? 0.35 : 1} depthWrite={!ghost} />
      </mesh>)}
      {highlighted && <mesh position={[0, 0.42, 0]} raycast={noRaycast}>
        <boxGeometry args={[2.2, 0.9, 2.3]} />
        <meshBasicMaterial visible={false} />
        <Edges color="#29edff" lineWidth={1.8} toneMapped={false} depthTest={false} raycast={noRaycast} />
      </mesh>}
    </group>
  </group>
}

/** Low transfer plate covers the seam where a belt fans out or merges into a trunk. */
export function JunctionMesh({ center, angle, elevation, highlighted }: { center: [number, number]; angle: number; elevation: number; highlighted: boolean }) {
  return <group position={[center[0], elevation, center[1]]} rotation={[0, angle, 0]}>
    <mesh position={[0, 0.69, 0]} castShadow receiveShadow raycast={noRaycast}>
      <boxGeometry args={[2.28, 0.17, 2.28]} />
      <meshStandardMaterial color="#334b50" roughness={0.62} metalness={0.18} />
      {highlighted && <Edges color="#29edff" lineWidth={1.8} toneMapped={false} depthTest={false} raycast={noRaycast} />}
    </mesh>
    <mesh position={[0, 0.8, 0]} receiveShadow raycast={noRaycast}>
      <boxGeometry args={[2.08, 0.05, 2.08]} />
      <meshStandardMaterial color="#576f70" roughness={0.6} metalness={0.16} />
    </mesh>
    {[-0.62, 0, 0.62].map((x) => <mesh key={x} position={[x, 0.84, 0]} raycast={noRaycast}>
      <boxGeometry args={[0.08, 0.035, 1.8]} />
      <meshStandardMaterial color="#b5c6c6" roughness={0.55} />
    </mesh>)}
    {[-1.1, 1.1].map((z) => <mesh key={z} position={[0, 0.83, z]} raycast={noRaycast}>
      <boxGeometry args={[2.24, 0.13, 0.1]} />
      <meshStandardMaterial color="#378568" roughness={0.5} />
    </mesh>)}
  </group>
}

export function MachineMesh({ componentType, position, ghost = false, machineId, selected = false, highlighted = false, locked = false, mounted = false, transitionIn = false, transitionOut = false, groupSize = 1, onDelete, length, breadth, rotation = 0, angle, ports }: {
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
  ports?: { in: boolean; out: boolean }
}) {
  const component = getFactoryComponent(componentType)
  const [, height] = component.dimensions
  const width = machineWidth(componentType, length)
  const depth = machineDepth(componentType, breadth)
  const beltWidth = Math.max(0.1, width - (transitionIn ? 1 : 0) - (transitionOut ? 1 : 0))
  const beltShift = ((transitionIn ? 1 : 0) - (transitionOut ? 1 : 0)) / 2
  const slatCount = Math.min(24, Math.max(2, Math.floor(beltWidth / 0.65)))
  const part = (at: Point, size: Point, color: string, metalness?: number, emissive?: string) =>
    <BoxPart at={at} size={size} color={color} ghost={ghost} machineId={machineId} metalness={metalness} emissive={emissive} />
  const cylinder = (at: Point, radius: number, partHeight: number, color: string, partRotation?: Point) =>
    <CylinderPart at={at} radius={radius} height={partHeight} color={color} ghost={ghost} machineId={machineId} rotation={partRotation} />

  return <group position={position} rotation={[0, angle ?? rotation * Math.PI / 2, 0]} name={`${ghost ? 'Preview' : 'Component'}: ${component.name}`}>
    {componentType === 'conveyor-belt' ? <group position={[beltShift, 0, 0]}>
      {part([0, 0.36, 0], [beltWidth, 0.55, 2.2], '#334b50')}
      {part([0, 0.67, 0], [Math.max(0.08, beltWidth - 0.12), 0.09, 1.78], '#576f70')}
      {[-1.04, 1.04].map((z) => <BoxPart key={z} at={[0, 0.77, z]} size={[beltWidth, 0.32, 0.12]} color={component.color} ghost={ghost} machineId={machineId} />)}
      {Array.from({ length: slatCount }, (_, index) =>
        <BoxPart key={index} at={[-beltWidth / 2 + (index + 0.5) * beltWidth / slatCount, 0.73, 0]} size={[0.08, 0.04, 1.72]} color="#b5c6c6" ghost={ghost} machineId={machineId} />)}
      {beltWidth > 1.2 && [-beltWidth / 2 + 0.55, beltWidth / 2 - 0.55].map((x) => <BoxPart key={x} at={[x, 0.12, 0]} size={[0.16, 0.24, 1.82]} color="#61747a" ghost={ghost} machineId={machineId} />)}
    </group> : componentType === 'workstation' ? <>
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
    {!ghost && ports && componentType !== 'workstation' && (['in', 'out'] as const).filter((side) => componentType !== 'raw-material' || side === 'out').filter((side) => componentType !== 'finished-goods' || side === 'in').map((side) =>
      <mesh key={side} position={[(side === 'in' ? -1 : 1) * (width / 2 - 0.06), 0.57, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.2, 0.35, 0.58]} />
        <meshStandardMaterial color={ports[side] ? '#2fd16b' : side === 'in' ? '#e8a33d' : '#2d8cff'} />
      </mesh>)}
    {(selected || highlighted) && !ghost && <>
      <mesh position={[0, height / 2, 0]} raycast={noRaycast}>
        <boxGeometry args={[width + 0.3, height + 0.3, depth + 0.3]} />
        <meshBasicMaterial visible={false} />
        <Edges color="#29edff" lineWidth={1.8} toneMapped={false} depthTest={false} raycast={noRaycast} />
      </mesh>
      {selected && <Html position={[0, height + 0.8, 0]} center zIndexRange={[5, 0]} wrapperClass="machine-status-anchor" style={{ pointerEvents: 'none' }}>
        <section className="machine-status-card" aria-label={`${component.name} details`}>
          {!locked && <button type="button" className="machine-status-delete" aria-label={`Delete ${groupSize > 1 ? 'linked group' : component.name}`} title="Delete" onClick={onDelete}>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 2 8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>}
          <h2>{component.name}</h2>
          <p>{locked ? `${groupSize} ${groupSize === 1 ? 'component' : 'components'} locked. Unlock in the sidebar to edit.` : componentType === 'workstation' ? 'Place machines on this platform. Drag it to move everything mounted on it.' : mounted ? 'Drag to reposition on the workstation. Alt-drag to take it off.' : groupSize > 1 ? `${groupSize} linked components. Drag one to move the assembly.` : componentType === 'raw-material' ? 'Feed stock into a conveyor from the blue output.' : componentType === 'finished-goods' ? 'Connect the orange input to collect finished products.' : 'Orange marks input; blue marks output. Join ends to build a line.'}</p>
        </section>
      </Html>}
    </>}
  </group>
}
