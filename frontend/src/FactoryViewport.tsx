import { beltEnds } from './conveyorPath'
import { useEffect, useMemo, useRef, type ComponentRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { MOUSE, TOUCH, OrthographicCamera } from 'three'
import { FLOOR_SIZE, WORKSTATION_HEIGHT, type FactoryComponentType, type FloorPosition, type PlacedMachine } from './factoryComponents'
import { CornerMesh, MachineMesh, TransitionMesh } from './MachineMesh'
import type { MachineState } from './api'
import { connectedPorts, cornerTiles, linkedAssembly, surfaceTransitions, type Laid } from './connections'
import { SceneInteraction, type PlaceOptions } from './SceneInteraction'
import { advanceCameraFocus, getMachineFocus, type CameraFocus } from './machineInteraction'

type FocusRequest = { machineId: string; version: number } | null

// Shift-drag up/down tilts between near top-down and near ground level, never below the floor.
const MIN_TILT = 0.12
const MAX_TILT = 1.45
// Negative near: an orthographic camera hangs above the floor, so a positive near plane slices off the ground nearest the viewer (worse when tilted low).
const INITIAL_CAMERA = { position: [60, 60, 60] as [number, number, number], zoom: 10, near: -10000, far: 10000 }

function FactoryFloor() {
  return (
    <group name="Factory Floor Grid">
      <mesh position={[0, -0.3, 0]} receiveShadow castShadow>
        <boxGeometry args={[FLOOR_SIZE, 0.6, FLOOR_SIZE]} />
        <meshStandardMaterial color="#a6adb2" roughness={0.92} />
      </mesh>
      {/* Lift coordinate lines above the floor to prevent z-fighting. */}
      <gridHelper args={[FLOOR_SIZE, FLOOR_SIZE, '#647888', '#8d989f']} position={[0, 0.02, 0]} />
      <gridHelper args={[FLOOR_SIZE, FLOOR_SIZE / 5, '#647888', '#77838b']} position={[0, 0.025, 0]} />
      <Grid
        args={[2, 2]}
        position={[0, -0.61, 0]}
        cellSize={1}
        cellThickness={0.45}
        cellColor="#ccd5dc"
        sectionSize={5}
        sectionThickness={0.7}
        sectionColor="#becbd4"
        infiniteGrid
        followCamera
        fadeDistance={10000}
        fadeStrength={1}
      />
    </group>
  )
}

function StrategyControls({ fitVersion, focusRequest, activeMachines }: {
  fitVersion: number
  focusRequest: FocusRequest
  activeMachines: PlacedMachine[]
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const animation = useRef<CameraFocus | null>(null)
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const orbit = controls.current
    if (!orbit) return

    // Only the focused canvas receives arrow keys; toolbar buttons keep normal behavior.
    const interrupt = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) animation.current = null
    }
    gl.domElement.addEventListener('keydown', interrupt)
    orbit.listenToKeyEvents(gl.domElement)
    return () => {
      gl.domElement.removeEventListener('keydown', interrupt)
      orbit.stopListenToKeyEvents()
    }
  }, [gl])

  useEffect(() => {
    if (!(camera instanceof OrthographicCamera) || !controls.current) return
    animation.current = null

    // Derive framing from the floor size so larger layouts still fit the overview.
    const projectedWidth = FLOOR_SIZE * Math.SQRT2
    const projectedHeight = FLOOR_SIZE * Math.sqrt(2 / 3)
    const fitZoom = Math.max(1, Math.min(size.width / (projectedWidth * 1.08), (size.height - 136) / (projectedHeight * 1.08)))
    camera.position.set(60, 60, 60)
    camera.zoom = fitZoom
    camera.updateProjectionMatrix()
    controls.current.target.set(0, 0, 0)
    controls.current.update()
    invalidate()
  }, [camera, size.width, size.height, fitVersion, invalidate])

  useEffect(() => {
    animation.current = null
    const machine = activeMachines.find((item) => item.id === focusRequest?.machineId)
    if (!machine || !(camera instanceof OrthographicCamera) || !controls.current) return
    const goal = getMachineFocus(machine, camera, controls.current.target, size.width, size.height)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      camera.position.copy(goal.position)
      camera.zoom = goal.zoom
      camera.updateProjectionMatrix()
      controls.current.target.copy(goal.target)
      controls.current.update()
    } else animation.current = goal
    invalidate()
  }, [focusRequest, activeMachines, camera, size.width, size.height, invalidate])

  useFrame((_, delta) => {
    if (!animation.current || !(camera instanceof OrthographicCamera) || !controls.current) return
    const complete = advanceCameraFocus(camera, controls.current.target, animation.current, delta)
    controls.current.update()
    if (complete) animation.current = null
    else invalidate()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      onStart={() => { animation.current = null }}
      domElement={gl.domElement}
      enableRotate
      minPolarAngle={MIN_TILT}
      maxPolarAngle={MAX_TILT}
      rotateSpeed={0.7}
      enablePan
      enableZoom
      enableDamping={false}
      screenSpacePanning={false}
      minZoom={1}
      maxZoom={80}
      panSpeed={1}
      keyPanSpeed={24}
      zoomSpeed={0.8}
      mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
    />
  )
}

export function FactoryViewport({ fitVersion, placementType, placementRotation, activeMachines, selectedMachineId, highlightedIds, lockedIds, focusRequest, onPlace, onPlaceRun, onMove, onSettle, onDelete, onSelect, onFocus, machineStates, renderDetails }: {
  fitVersion: number
  placementType: FactoryComponentType | null
  placementRotation: number
  activeMachines: PlacedMachine[]
  selectedMachineId: string | null
  highlightedIds: Set<string>
  lockedIds: Set<string>
  focusRequest: FocusRequest
  onPlace: (type: FactoryComponentType, position: FloorPosition, options?: PlaceOptions) => void
  onPlaceRun: (pieces: Laid[]) => void
  onMove: (id: string, position: FloorPosition, detach?: boolean) => void
  onSettle: (id: string) => void
  onDelete: () => void
  onSelect: (id: string | null, additive?: boolean) => void
  onFocus: (id: string) => void
  machineStates?: Record<string, MachineState> // backend FactoryState.machineStates, keyed by label
  renderDetails?: (machine: PlacedMachine) => ReactNode
}) {
  const transitions = surfaceTransitions(activeMachines)
  const beltNeighbors = useMemo(() => new Map(activeMachines.map((machine) => {
    const linked = linkedAssembly(machine.id, activeMachines)
    return [machine.id, activeMachines.filter((peer) => peer.id !== machine.id && peer.componentType === 'conveyor-belt' && peer.workstationId === machine.workstationId && linked.has(peer.id))]
  })), [activeMachines])
  return (
    <Canvas
      className={`factory-canvas${placementType ? ' factory-canvas--placement' : ''}`}
      aria-label="Factory floor. Click a machine to inspect; double-click to focus. Select a component, then click the floor to place it. Drag to move. Shift-drag left-right to rotate and up-down to tilt. Scroll or pinch to zoom. Escape cancels placement mode or restores the overview."
      orthographic
      shadows
      frameloop="demand"
      dpr={[1, 2]}
      camera={INITIAL_CAMERA}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.domElement.tabIndex = 0
        gl.domElement.setAttribute('aria-label', 'Factory floor canvas. Click a machine to inspect; double-click to focus. Select a component, then click the floor to place it. Drag to move. Shift-drag left-right to rotate and up-down to tilt. Right-drag or use arrow keys to pan. Scroll or pinch to zoom. Escape cancels placement mode or restores the overview.')
      }}
      fallback={<div className="viewport-fallback">This viewport needs WebGL. Enable graphics acceleration in your browser, then reload.</div>}
    >
      <color attach="background" args={['#dfe7ec']} />
      <ambientLight intensity={1.25} />
      <directionalLight
        position={[20, 40, 15]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-FLOOR_SIZE * 0.8}
        shadow-camera-right={FLOOR_SIZE * 0.8}
        shadow-camera-top={FLOOR_SIZE * 0.8}
        shadow-camera-bottom={-FLOOR_SIZE * 0.8}
        shadow-camera-near={1}
        shadow-camera-far={150}
        shadow-normalBias={0.04}
      />
      <FactoryFloor />
      {activeMachines.map((machine) => (
        <MachineMesh key={machine.id} machineId={machine.id} selected={selectedMachineId === machine.id} highlighted={highlightedIds.has(machine.id)} locked={lockedIds.has(machine.id)} mounted={!!machine.workstationId} transitionIn={transitions.some((joint) => joint.ids[1] === machine.id)} transitionOut={transitions.some((joint) => joint.ids[0] === machine.id)} groupSize={linkedAssembly(machine.id, activeMachines).size} onDelete={onDelete} componentType={machine.componentType} position={[machine.position[0], machine.workstationId ? WORKSTATION_HEIGHT : 0, machine.position[2]]} length={machine.length} breadth={machine.breadth} rotation={machine.rotation} angle={machine.angle} entryAngle={machine.entryAngle} exitAngle={machine.exitAngle} neighbors={beltNeighbors.get(machine.id)} ports={connectedPorts(machine, activeMachines)} label={machine.label} status={machine.label ? machineStates?.[machine.label]?.status : undefined} details={selectedMachineId === machine.id ? renderDetails?.(machine) : undefined} />
      ))}
      {cornerTiles(activeMachines).map((tile) => (
        <CornerMesh key={tile.ids.join()} center={tile.center} from={tile.from} to={tile.to} highlighted={highlightedIds.has(tile.ids[0]) && highlightedIds.has(tile.ids[1])} elevation={activeMachines.find((machine) => machine.id === tile.ids[0])?.workstationId ? WORKSTATION_HEIGHT : 0} />
      ))}
      {placementType === 'conveyor-belt' && activeMachines.filter((m) => m.componentType === 'conveyor-belt').flatMap((machine) => {
        const ends = beltEnds(machine)
        return (['start', 'end'] as const).map((side) => <mesh key={`${machine.id}:${side}`} position={[ends[side][0], (machine.workstationId ? WORKSTATION_HEIGHT : 0) + 0.95, ends[side][1]]} userData={{ machineId: machine.id }}>
          <sphereGeometry args={[0.3, 16, 12]} />
          <meshBasicMaterial color={side === 'end' ? '#44caff' : '#ffbd59'} depthTest={false} />
        </mesh>)
      })}
      {transitions.map((joint) => (
        <TransitionMesh key={joint.ids.join()} center={joint.center} rotation={joint.rotation} fromHeight={joint.fromHeight} toHeight={joint.toHeight} highlighted={highlightedIds.has(joint.ids[0]) && highlightedIds.has(joint.ids[1])} />
      ))}
      <SceneInteraction componentType={placementType} rotation={placementRotation} machines={activeMachines} onPlace={onPlace} onPlaceRun={onPlaceRun} onMove={onMove} onSettle={onSettle} onSelect={onSelect} onFocus={onFocus} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]} receiveShadow>
        <planeGeometry args={[10000, 10000]} />
        <shadowMaterial transparent opacity={0.12} />
      </mesh>
      <StrategyControls fitVersion={fitVersion} focusRequest={focusRequest} activeMachines={activeMachines} />
    </Canvas>
  )
}
