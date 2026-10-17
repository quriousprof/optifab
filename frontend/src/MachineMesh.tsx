import { Edges, Html } from '@react-three/drei'
import { getFactoryComponent, type FactoryComponentType, type FloorPosition } from './factoryComponents'

const noRaycast = () => {}

export function MachineMesh({ componentType, position, ghost = false, machineId, selected = false }: {
  componentType: FactoryComponentType
  position: FloorPosition
  ghost?: boolean
  machineId?: string
  selected?: boolean
}) {
  const component = getFactoryComponent(componentType)
  const [width, height, depth] = component.dimensions

  return (
    <group position={position} name={`${ghost ? 'Preview' : 'Machine'}: ${component.name}`}>
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
      {selected && !ghost && (
        <>
          <mesh position={[0, height / 2, 0]} raycast={noRaycast}>
            <boxGeometry args={[width + 0.3, height + 0.3, depth + 0.3]} />
            <meshBasicMaterial visible={false} />
            <Edges color="#29edff" lineWidth={1.8} toneMapped={false} depthTest={false} raycast={noRaycast} />
          </mesh>
          <Html position={[0, height + 0.8, 0]} center zIndexRange={[5, 0]} wrapperClass="machine-status-anchor" style={{ pointerEvents: 'none' }}>
            <section className="machine-status-card" aria-label={`${component.name} status`} role="status">
              <h2>{component.name}</h2>
              <dl>
                <div><dt>Status</dt><dd><span className="status-dot" />Operational</dd></div>
                <div><dt>Efficiency</dt><dd>94%</dd></div>
              </dl>
              <p>Demo values</p>
            </section>
          </Html>
        </>
      )}
    </group>
  )
}
