import { getFactoryComponent, type FactoryComponentType, type FloorPosition } from './factoryComponents'

export function MachineMesh({ componentType, position, ghost = false }: {
  componentType: FactoryComponentType
  position: FloorPosition
  ghost?: boolean
}) {
  const component = getFactoryComponent(componentType)
  const [width, height, depth] = component.dimensions

  return (
    <group position={position} name={`${ghost ? 'Preview' : 'Machine'}: ${component.name}`}>
      <mesh position={[0, height / 2, 0]} castShadow={!ghost} receiveShadow={!ghost}>
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
    </group>
  )
}
