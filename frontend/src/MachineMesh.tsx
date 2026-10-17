import { Edges, Html } from '@react-three/drei'
import { getFactoryComponent, machineWidth, type FactoryComponentType, type FloorPosition } from './factoryComponents'

const noRaycast = () => {}

/** Curved corner tile: a rounded quarter-disc filling the square where one belt turns into the next. */
export function CornerMesh({ center, from, to, highlighted }: { center: [number, number]; from: [number, number]; to: [number, number]; highlighted: boolean }) {
  const pivot = [center[0] - from[0] + to[0], center[1] - from[1] + to[1]] // the tile corner the turn curves around
  const start = Math.atan2(from[0] - to[0], from[1] - to[1]) - Math.PI / 4
  return (
    <mesh position={[pivot[0], 0.5, pivot[1]]} castShadow receiveShadow raycast={noRaycast}>
      <cylinderGeometry args={[2, 2, 1, 24, 1, false, start, Math.PI / 2]} />
      <meshStandardMaterial color="#378568" roughness={0.65} />
      {highlighted && <Edges color="#29edff" lineWidth={1.8} toneMapped={false} depthTest={false} raycast={noRaycast} />}
    </mesh>
  )
}

export function MachineMesh({ componentType, position, ghost = false, machineId, selected = false, highlighted = false, length, rotation = 0, ports }: {
  componentType: FactoryComponentType
  position: FloorPosition
  ghost?: boolean
  machineId?: string
  selected?: boolean
  highlighted?: boolean // part of the selected run: outline only, no status card
  length?: number
  rotation?: number
  ports?: { in: boolean; out: boolean }
}) {
  const component = getFactoryComponent(componentType)
  const [, height, depth] = component.dimensions
  const width = machineWidth(componentType, length)

  return (
    <group position={position} rotation={[0, rotation * Math.PI / 2, 0]} name={`${ghost ? 'Preview' : 'Machine'}: ${component.name}`}>
      <mesh position={[0, height / 2, 0]} castShadow={!ghost} receiveShadow={!ghost} userData={ghost ? {} : { machineId }} raycast={ghost ? noRaycast : undefined}>
        {component.shape === 'cylinder'
          ? <cylinderGeometry args={[width / 2, width / 2, height, 32]} />
          : <boxGeometry args={[width, height, depth]} />}
        <meshStandardMaterial
          color={component.color}
          roughness={0.65}
          transparent={ghost}
          opacity={ghost ? 0.35 : 1}
          depthWrite={!ghost}
        />
      </mesh>
      {!ghost && ports && (['in', 'out'] as const).map((side) => (
        <mesh key={side} position={[(side === 'in' ? -1 : 1) * (width / 2 + (side === 'out' ? 0.12 : 0)), Math.min(height, 1) / 2, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.24, Math.min(height, 1) * 0.6, Math.min(depth, 1.2) * 0.6]} />
          <meshStandardMaterial color={ports[side] ? '#2fd16b' : side === 'in' ? '#e8a33d' : '#2d8cff'} />
        </mesh>
      ))}
      {(selected || highlighted) && !ghost && (
        <>
          <mesh position={[0, height / 2, 0]} raycast={noRaycast}>
            <boxGeometry args={[width + 0.3, height + 0.3, depth + 0.3]} />
            <meshBasicMaterial visible={false} />
            <Edges color="#29edff" lineWidth={1.8} toneMapped={false} depthTest={false} raycast={noRaycast} />
          </mesh>
          {selected && <Html position={[0, height + 0.8, 0]} center zIndexRange={[5, 0]} wrapperClass="machine-status-anchor" style={{ pointerEvents: 'none' }}>
            <section className="machine-status-card" aria-label={`${component.name} status`} role="status">
              <h2>{component.name}</h2>
              <dl>
                <div><dt>Status</dt><dd><span className="status-dot" />Operational</dd></div>
                <div><dt>Efficiency</dt><dd>94%</dd></div>
              </dl>
              <p>Demo values</p>
            </section>
          </Html>}
        </>
      )}
    </group>
  )
}
