import { beltEnds } from './conveyorPath'
import { useEffect, useMemo, useRef, type ComponentRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, Html, OrbitControls } from '@react-three/drei'
import { MOUSE, TOUCH, OrthographicCamera } from 'three'
import { WORKSTATION_HEIGHT, type FloorSize, type FactoryComponentType, type FloorPosition, type PlacedMachine } from './factoryComponents'
import { CornerMesh, MachineMesh, TransitionMesh } from './MachineMesh'
import type { MachineState } from './api'
import { assemblyLocked, connectedPorts, cornerTiles, linkedAssembly, movementAssembly, surfaceTransitions, type Laid } from './connections'
import { SceneInteraction, type PlaceOptions } from './SceneInteraction'
import { advanceCameraFocus, getMachineFocus, type CameraFocus } from './machineInteraction'

type FocusRequest = { machineId: string; version: number } | null

// Shift-drag up/down tilts between near top-down and near ground level, never below the floor.
const MIN_TILT = 0.12
const MAX_TILT = 1.45
// Negative near: an orthographic camera hangs above the floor, so a positive near plane slices off the ground nearest the viewer (worse when tilted low).
const INITIAL_CAMERA = { position: [60, 60, 60] as [number, number, number], zoom: 10, near: -10000, far: 10000 }

function FactoryFloor({ floor }: { floor: FloorSize }) {
  const lines = useMemo(() => {
    const minor: number[] = [], major: number[] = []
    for (let x = Math.ceil(-floor.width / 2); x <= floor.width / 2; x++) {
      (x % 5 === 0 ? major : minor).push(x, 0.025, -floor.depth / 2, x, 0.025, floor.depth / 2)
    }
    for (let z = Math.ceil(-floor.depth / 2); z <= floor.depth / 2; z++) {
      (z % 5 === 0 ? major : minor).push(-floor.width / 2, 0.025, z, floor.width / 2, 0.025, z)
    }
    return [new Float32Array(minor), new Float32Array(major)]
  }, [floor.width, floor.depth])
  return (
    <group name="Factory Floor Grid">
      <mesh position={[0, -0.3, 0]} receiveShadow castShadow>
        <boxGeometry args={[floor.width, 0.6, floor.depth]} />
        <meshStandardMaterial color="#a6adb2" roughness={0.92} />
      </mesh>
      {lines.map((vertices, index) => <lineSegments key={index}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[vertices, 3]} /></bufferGeometry>
        <lineBasicMaterial color={index ? '#77838b' : '#8d989f'} />
      </lineSegments>)}
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

function StrategyControls({ fitVersion, focusRequest, activeMachines, floor }: {
  floor: FloorSize
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
    const projectedWidth = (floor.width + floor.depth) / Math.SQRT2
    const projectedHeight = (floor.width + floor.depth) / Math.sqrt(6)
    const fitZoom = Math.max(0.01, Math.min(size.width / (projectedWidth * 1.08), (size.height - 136) / (projectedHeight * 1.08)))
    camera.position.set(60, 60, 60)
    camera.zoom = fitZoom
    camera.updateProjectionMatrix()
    controls.current.target.set(0, 0, 0)
    controls.current.update()
    invalidate()
  }, [camera, size.width, size.height, floor.width, floor.depth, fitVersion, invalidate])

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
      minZoom={0.01}
      maxZoom={80}
      panSpeed={1}
      keyPanSpeed={24}
      zoomSpeed={0.8}
      mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
    />
  )
}

export function FactoryViewport({ floor, fitVersion, placementType, placementRotation, activeMachines, selectedMachineId, highlightedIds, lockedIds, focusRequest, onPlace, onPlaceRun, onMove, onSettle, onDelete, onSelect, onFocus, onToggleEndpoint, onSelectRectangle, machineStates, renderDetails }: {
  floor: FloorSize
  onSelectRectangle: (ids: string[], additive: boolean) => void
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
  onToggleEndpoint: (id: string, side: 'in' | 'out') => void
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
      aria-label="Factory floor. Click a machine to inspect; double-click to focus. Drag empty space to select components, or drag a component to move it. Shift-drag to rotate and tilt. Right-drag to pan. Scroll or pinch to zoom."
      orthographic
      shadows
      frameloop="demand"
      dpr={[1, 2]}
      camera={INITIAL_CAMERA}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.domElement.tabIndex = 0
        gl.domElement.setAttribute('aria-label', 'Factory floor canvas. Click a machine to inspect; double-click to focus. Drag empty space to select components, or drag a component to move it. Shift-drag to rotate and tilt. Right-drag or use arrow keys to pan. Scroll or pinch to zoom.')
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
        shadow-camera-left={-Math.max(floor.width, floor.depth) * 0.8}
        shadow-camera-right={Math.max(floor.width, floor.depth) * 0.8}
        shadow-camera-top={Math.max(floor.width, floor.depth) * 0.8}
        shadow-camera-bottom={-Math.max(floor.width, floor.depth) * 0.8}
        shadow-camera-near={1}
        shadow-camera-far={150}
        shadow-normalBias={0.04}
      />
      <FactoryFloor floor={floor} />
      {activeMachines.map((machine) => (
        <MachineMesh key={machine.id} machineId={machine.id} selected={selectedMachineId === machine.id} highlighted={highlightedIds.has(machine.id)} locked={lockedIds.has(machine.id)} mounted={!!machine.workstationId} transitionIn={transitions.some((joint) => joint.ids[1] === machine.id)} transitionOut={transitions.some((joint) => joint.ids[0] === machine.id)} groupSize={highlightedIds.has(machine.id) ? highlightedIds.size : 1} onDelete={onDelete} componentType={machine.componentType} position={[machine.position[0], machine.workstationId ? WORKSTATION_HEIGHT : 0, machine.position[2]]} length={machine.length} breadth={machine.breadth} rotation={machine.rotation} angle={machine.angle} entryAngle={machine.entryAngle} exitAngle={machine.exitAngle} neighbors={beltNeighbors.get(machine.id)} ports={connectedPorts(machine, activeMachines)} label={machine.label} displayLabel={machine.displayLabel} status={machine.label ? machineStates?.[machine.label]?.status : undefined} details={selectedMachineId === machine.id ? renderDetails?.(machine) : undefined} />
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
      {!placementType && activeMachines.filter((machine) => machine.id === selectedMachineId && machine.componentType === 'conveyor-belt').flatMap((machine) => {
        const ends = beltEnds(machine)
        const ports = connectedPorts(machine, activeMachines)
        const locked = assemblyLocked(movementAssembly(machine.id, activeMachines), activeMachines)
        return (['in', 'out'] as const).map((side) => {
          const point = side === 'in' ? ends.start : ends.end
          const detached = side === 'in' ? machine.disconnectedIn : machine.disconnectedOut
          const name = side === 'in' ? 'input' : 'output'
          const action = detached ? 'Enable' : ports[side] ? 'Detach' : 'Disable'
          return <Html key={`${machine.id}:${side}`} position={[point[0], (machine.workstationId ? WORKSTATION_HEIGHT : 0) + 1.1, point[1]]} center zIndexRange={[8, 6]}>
            <button type="button" disabled={locked} aria-label={`${action} conveyor ${name}`} title={locked ? 'Unlock the connected assembly to edit this end' : `${action} ${name}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onToggleEndpoint(machine.id, side) }} className={`flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b] disabled:cursor-not-allowed disabled:opacity-60 ${side === 'in' ? 'border-[#b87919] bg-[#fff4dc] text-[#663d00]' : 'border-[#2277a0] bg-[#e4f6ff] text-[#104c6a]'}`}>
              <span aria-hidden="true" className={`grid size-5 place-items-center rounded-full text-sm leading-none ${side === 'in' ? 'bg-[#f3b54e]' : 'bg-[#55c9f5]'}`}>{detached ? '+' : '×'}</span>
              <span>{side === 'in' ? 'Input' : 'Output'}</span>
            </button>
          </Html>
        })
      })}
      {transitions.map((joint) => (
        <TransitionMesh key={joint.ids.join()} center={joint.center} rotation={joint.rotation} fromHeight={joint.fromHeight} toHeight={joint.toHeight} highlighted={highlightedIds.has(joint.ids[0]) && highlightedIds.has(joint.ids[1])} />
      ))}
      <SceneInteraction floor={floor} componentType={placementType} rotation={placementRotation} machines={activeMachines} onPlace={onPlace} onPlaceRun={onPlaceRun} onMove={onMove} onSettle={onSettle} onSelect={onSelect} onFocus={onFocus} selectedIds={highlightedIds} onSelectRectangle={onSelectRectangle} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]} receiveShadow>
        <planeGeometry args={[10000, 10000]} />
        <shadowMaterial transparent opacity={0.12} />
      </mesh>
      <StrategyControls floor={floor} fitVersion={fitVersion} focusRequest={focusRequest} activeMachines={activeMachines} />
    </Canvas>
  )
}
