import { useEffect, useRef, type ComponentRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { MOUSE, TOUCH, OrthographicCamera } from 'three'
import { FLOOR_SIZE, type FactoryComponentType, type FloorPosition, type PlacedMachine } from './factoryComponents'
import { MachineMesh } from './MachineMesh'
import { SceneInteraction } from './SceneInteraction'
import { advanceCameraFocus, getMachineFocus, type CameraFocus } from './machineInteraction'

type FocusRequest = { machineId: string; version: number } | null

const ISOMETRIC_POLAR_ANGLE = Math.acos(1 / Math.sqrt(3))
const INITIAL_CAMERA = { position: [60, 60, 60] as [number, number, number], zoom: 10, near: 0.1, far: 10000 }

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
      minPolarAngle={ISOMETRIC_POLAR_ANGLE}
      maxPolarAngle={ISOMETRIC_POLAR_ANGLE}
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

export function FactoryViewport({ fitVersion, placementType, activeMachines, selectedMachineId, focusRequest, onPlace, onMove, onSelect, onFocus }: {
  fitVersion: number
  placementType: FactoryComponentType | null
  activeMachines: PlacedMachine[]
  selectedMachineId: string | null
  focusRequest: FocusRequest
  onPlace: (type: FactoryComponentType, position: FloorPosition) => void
  onMove: (id: string, position: FloorPosition) => void
  onSelect: (id: string | null) => void
  onFocus: (id: string) => void
}) {
  return (
    <Canvas
      className={`factory-canvas${placementType ? ' factory-canvas--placement' : ''}`}
      aria-label="Factory floor. Click a machine to inspect; double-click to focus. Select a component, then click the floor to place it. Drag to move. Shift-drag to rotate. Scroll or pinch to zoom. Escape cancels placement mode or restores the overview."
      orthographic
      shadows
      frameloop="demand"
      dpr={[1, 2]}
      camera={INITIAL_CAMERA}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.domElement.tabIndex = 0
        gl.domElement.setAttribute('aria-label', 'Factory floor canvas. Click a machine to inspect; double-click to focus. Select a component, then click the floor to place it. Drag to move. Shift-drag to rotate. Right-drag or use arrow keys to pan. Scroll or pinch to zoom. Escape cancels placement mode or restores the overview.')
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
        <MachineMesh key={machine.id} machineId={machine.id} selected={selectedMachineId === machine.id} componentType={machine.componentType} position={machine.position} />
      ))}
      <SceneInteraction componentType={placementType} machines={activeMachines} onPlace={onPlace} onMove={onMove} onSelect={onSelect} onFocus={onFocus} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]} receiveShadow>
        <planeGeometry args={[10000, 10000]} />
        <shadowMaterial transparent opacity={0.12} />
      </mesh>
      <StrategyControls fitVersion={fitVersion} focusRequest={focusRequest} activeMachines={activeMachines} />
    </Canvas>
  )
}
