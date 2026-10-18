import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Raycaster, Vector2, type Object3D } from 'three'
import { MachineMesh, TransitionMesh } from './MachineMesh'
import { DIRECTIONS, WORKSTATION_HEIGHT, type FloorSize, type FactoryComponentType, type FloorPosition, type PlacedMachine } from './factoryComponents'
import { assemblyLocked, conveyorPort, layDirectionalConveyorRun, linkedAssembly, movementAssembly, resolvePlacement, resolvePlacementTarget, workstationAtPoint, type Laid } from './connections'
import { isPlacementClick, isPlacementPointer, planePoint, trackPlacementDrag, type PlacementGesture } from './placement'
import { isDoubleMachineClick, machinesInRectangle, pickMachine, shouldStartMarquee, type MachineClick } from './machineInteraction'

function conveyorPointerPoint(ray: Raycaster, scene: Object3D, machines: PlacedMachine[], fallbackHeight: number, side: 'in' | 'out') {
  const hit = machines.find((m) => m.id === pickMachine(ray, scene))
  if (hit && hit.componentType !== 'workstation' && hit.componentType !== 'conveyor-belt' &&
    !(side === 'in' && hit.componentType === 'raw-material') && !(side === 'out' && hit.componentType === 'finished-goods')) {
    return conveyorPort(hit, side)
  }
  return planePoint(ray, hit?.componentType === 'conveyor-belt' ? (hit.workstationId ? WORKSTATION_HEIGHT : 0) + 0.735 : fallbackHeight)
}

type Ghost = { position: FloorPosition; length?: number; rotation: number; angle?: number; entryAngle?: number; exitAngle?: number; workstationId?: string }

export type PlaceOptions = { length?: number; rotation?: number; workstationId?: string }

export function SceneInteraction({ componentType, rotation, machines, floor, onPlace, onPlaceRun, onMove, onSettle, onSelect, onFocus, selectedIds, onSelectRectangle }: {
  floor: FloorSize
  selectedIds: Set<string>
  onSelectRectangle: (ids: string[], additive: boolean) => void
  componentType: FactoryComponentType | null
  rotation: number
  machines: PlacedMachine[]
  onMove: (id: string, position: FloorPosition, detach?: boolean) => void
  onPlace: (type: FactoryComponentType, position: FloorPosition, options?: PlaceOptions) => void
  onPlaceRun: (pieces: Laid[]) => void
  onSettle: (id: string) => void
  onSelect: (id: string | null, additive?: boolean) => void
  onFocus: (id: string) => void
}) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const scene = useThree((state) => state.scene)
  const raycaster = useRef(new Raycaster())
  const pointer = useRef<Vector2 | null>(null)
  const gesture = useRef<PlacementGesture | null>(null)
  const lastClick = useRef<MachineClick | null>(null)
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null
  const machinesRef = useRef(machines)
  machinesRef.current = machines
  const floorRef = useRef(floor)
  floorRef.current = floor
  const rotationRef = useRef(rotation)
  rotationRef.current = rotation
  const moving = useRef<string | null>(null)
  const moveOrigin = useRef<{ pointer: [number, number]; position: FloorPosition } | null>(null)
  const detaching = useRef(false)
  const dragSelected = useRef(false)
  const lay = useRef<{ start: [number, number]; workstationId?: string } | null>(null)
  const marquee = useRef<{ x: number; y: number; pointerId: number; additive: boolean } | null>(null)
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds
  const [ghost, setGhost] = useState<Ghost[] | null>(null)

  useEffect(() => {
    const canvas = gl.domElement
    const selectionBox = document.createElement('div')
    Object.assign(selectionBox.style, { position: 'fixed', display: 'none', pointerEvents: 'none', zIndex: '20', border: '1px solid #28649b', background: 'rgba(40,100,155,0.16)' })
    document.body.appendChild(selectionBox)

    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.current = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      invalidate()
    }
    const stopMoving = () => {
      moving.current = null
      moveOrigin.current = null
      detaching.current = false
      dragSelected.current = false
      lay.current = null
      if (controls) controls.enabled = true
    }
    const clear = () => {
      stopMoving()
      pointer.current = null
      gesture.current = null
      marquee.current = null
      selectionBox.style.display = 'none'
      lastClick.current = null
      setGhost(null)
      invalidate()
    }
    // Capture phase on window so OrbitControls never starts panning when the press lands on a machine.
    const grab = (event: PointerEvent) => {
      const altDrag = event.button === 0 && event.isPrimary && event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey
      const selecting = !componentType && event.pointerType !== 'touch' && event.button === 0 && event.isPrimary && !event.shiftKey && !event.altKey
      if (event.target !== canvas || (!isPlacementPointer(event) && !(altDrag && !componentType) && !selecting) || !controls) return
      updatePointer(event)
      camera.updateMatrixWorld()
      raycaster.current.setFromCamera(pointer.current!, camera)
      const hit = selecting ? pickMachine(raycaster.current, scene) : null
      if (shouldStartMarquee(event, !!componentType, !!hit)) {
        marquee.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, additive: event.ctrlKey || event.metaKey }
        controls.enabled = false
        canvas.setPointerCapture(event.pointerId)
        return
      }
      if (selecting && (event.ctrlKey || event.metaKey)) return
      if (componentType === 'conveyor-belt') { // left-drag lays a conveyor instead of panning
        const topPoint = planePoint(raycaster.current, WORKSTATION_HEIGHT)
        const hit = machinesRef.current.find((m) => m.id === pickMachine(raycaster.current, scene))
        const host = hit?.workstationId
          ? machinesRef.current.find((m) => m.id === hit.workstationId)
          : topPoint && workstationAtPoint(topPoint, machinesRef.current)
        const point = conveyorPointerPoint(raycaster.current, scene, machinesRef.current, host ? WORKSTATION_HEIGHT : 0, 'out')
        if (point) {
          lay.current = { start: point, workstationId: host?.id }
          controls.enabled = false
        }
        return
      }
      if (componentType) return
      moving.current = hit ?? pickMachine(raycaster.current, scene)
      if (moving.current && assemblyLocked(movementAssembly(moving.current, machinesRef.current), machinesRef.current)) moving.current = null
      if (moving.current) {
        detaching.current = altDrag
        const machine = machinesRef.current.find((item) => item.id === moving.current)
        const point = planePoint(raycaster.current, machine?.workstationId && !altDrag ? WORKSTATION_HEIGHT : 0)
        if (machine && point) moveOrigin.current = { pointer: point, position: machine.position }
        controls.enabled = false
      }
    }
    const down = (event: PointerEvent) => {
      updatePointer(event)
      gesture.current = (isPlacementPointer(event) || (event.button === 0 && event.isPrimary && ((event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) || (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey) || !!marquee.current)))
        ? { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, dragged: false }
        : null
    }
    const move = (event: PointerEvent) => {
      if (gesture.current) trackPlacementDrag(gesture.current, event)
      updatePointer(event)
      if (marquee.current && marquee.current.pointerId === event.pointerId) {
        const start = marquee.current
        if (gesture.current?.dragged) Object.assign(selectionBox.style, { display: 'block', left: `${Math.min(start.x, event.clientX)}px`, top: `${Math.min(start.y, event.clientY)}px`, width: `${Math.abs(event.clientX - start.x)}px`, height: `${Math.abs(event.clientY - start.y)}px` })
        return
      }
      const machine = machinesRef.current.find((item) => item.id === moving.current)
      if (machine && gesture.current?.dragged) {
        if (!dragSelected.current) { if (!selectedIdsRef.current.has(machine.id)) onSelect(machine.id); dragSelected.current = true }
        camera.updateMatrixWorld()
        raycaster.current.setFromCamera(pointer.current!, camera)
        const group = linkedAssembly(machine.id, machinesRef.current)
        const next = group.size > 1 || (selectedIdsRef.current.size > 1 && selectedIdsRef.current.has(machine.id)) || machine.workstationId || machine.componentType === 'workstation' || detaching.current
          ? (() => {
              const point = planePoint(raycaster.current, machine.workstationId && !detaching.current ? WORKSTATION_HEIGHT : 0)
              const origin = moveOrigin.current
              return point && origin ? [origin.position[0] + Math.round(point[0] - origin.pointer[0]), 0, origin.position[2] + Math.round(point[1] - origin.pointer[1])] as FloorPosition : null
            })()
          : resolvePlacement(raycaster.current, machine.componentType, machine.length, machine.rotation ?? 0, machinesRef.current, machine.id, machine.breadth, floorRef.current)
        if (next && (next[0] !== machine.position[0] || next[2] !== machine.position[2])) onMove(machine.id, next, detaching.current)
      }
    }
    const up = (event: PointerEvent) => {
      const start = lay.current
      const selection = marquee.current
      marquee.current = null
      selectionBox.style.display = 'none'
      const wasMoving = moving.current
      stopMoving()
      const canPlace = isPlacementClick(gesture.current, event)
      const dragged = gesture.current?.dragged
      const multiSelect = !!gesture.current && !dragged && event.button === 0 && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
      gesture.current = null
      if (selection && selection.pointerId === event.pointerId && dragged) {
        const rectangle = { left: Math.min(selection.x, event.clientX), top: Math.min(selection.y, event.clientY), right: Math.max(selection.x, event.clientX), bottom: Math.max(selection.y, event.clientY) }
        onSelectRectangle(machinesInRectangle(scene, camera, canvas.getBoundingClientRect(), rectangle), selection.additive)
        lastClick.current = null
        return
      }
      if (wasMoving && dragged) onSettle(wasMoving)
      if (!canPlace && !multiSelect) {
        lastClick.current = null
        if (start && dragged) {
          updatePointer(event)
          camera.updateMatrixWorld()
          raycaster.current.setFromCamera(pointer.current!, camera)
          const point = conveyorPointerPoint(raycaster.current, scene, machinesRef.current, start.workstationId ? WORKSTATION_HEIGHT : 0, 'in')
          const pieces = point && layDirectionalConveyorRun(start.start, point, machinesRef.current, rotationRef.current, start.workstationId, floorRef.current)
          if (pieces) onPlaceRun(pieces)
          setGhost(null)
        }
        return
      }

      // Raycast again at click time so the placed object matches this pointer and camera.
      updatePointer(event)
      camera.updateMatrixWorld()
      raycaster.current.setFromCamera(pointer.current!, camera)
      const machineId = pickMachine(raycaster.current, scene)
      if (multiSelect) {
        if (machineId) onSelect(machineId, true)
        lastClick.current = null
        return
      }
      if (machineId && !(componentType && componentType !== 'workstation' && machinesRef.current.some((machine) => machine.id === machineId && machine.componentType === 'workstation'))) {
        const click = { machineId, time: event.timeStamp, x: event.clientX, y: event.clientY }
        onSelect(machineId)
        if (isDoubleMachineClick(lastClick.current, click)) {
          onFocus(machineId)
          lastClick.current = null
        } else lastClick.current = click
        setGhost(null)
        return
      }
      lastClick.current = null
      if (!componentType) {
        onSelect(null)
        return
      }
      const target = resolvePlacementTarget(raycaster.current, componentType, undefined, rotationRef.current, machinesRef.current, undefined, floorRef.current)
      if (target) onPlace(componentType, target.position, { rotation: rotationRef.current, workstationId: target.workstationId })
    }

    // Sidebar drag-and-drop: pointer events are suppressed during a drag, so track dragover instead.
    const dragOver = (event: DragEvent) => {
      event.preventDefault()
      updatePointer(event as unknown as PointerEvent)
    }
    const drop = (event: DragEvent) => {
      event.preventDefault()
      if (!componentType) return
      updatePointer(event as unknown as PointerEvent)
      camera.updateMatrixWorld()
      raycaster.current.setFromCamera(pointer.current!, camera)
      const target = resolvePlacementTarget(raycaster.current, componentType, undefined, rotationRef.current, machinesRef.current, undefined, floorRef.current)
      if (target) onPlace(componentType, target.position, { rotation: rotationRef.current, workstationId: target.workstationId })
      setGhost(null)
    }

    window.addEventListener('pointerdown', grab, true)
    canvas.addEventListener('dragover', dragOver)
    canvas.addEventListener('drop', drop)
    canvas.addEventListener('dragleave', clear)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointerleave', clear)
    canvas.addEventListener('pointercancel', clear)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('pointerdown', grab, true)
      canvas.removeEventListener('dragover', dragOver)
      canvas.removeEventListener('drop', drop)
      canvas.removeEventListener('dragleave', clear)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointerleave', clear)
      canvas.removeEventListener('pointercancel', clear)
      window.removeEventListener('blur', clear)
      selectionBox.remove()
    }
  }, [camera, gl, invalidate, scene, componentType, controls, onPlace, onPlaceRun, onMove, onSettle, onSelect, onFocus, onSelectRectangle])

  useFrame(() => {
    if (!pointer.current || !componentType) return
    // Recompute after OrbitControls, including zoom/pan with a stationary mouse.
    camera.updateMatrixWorld()
    raycaster.current.setFromCamera(pointer.current, camera)
    let next: Ghost[] | null = null
    if (lay.current) {
      const point = conveyorPointerPoint(raycaster.current, scene, machinesRef.current, lay.current.workstationId ? WORKSTATION_HEIGHT : 0, 'in')
      next = point && layDirectionalConveyorRun(lay.current.start, point, machinesRef.current, rotationRef.current, lay.current.workstationId, floorRef.current)
    } else {
      const hovered = pickMachine(raycaster.current, scene)
      if (!hovered || (componentType !== 'workstation' && machinesRef.current.some((machine) => machine.id === hovered && machine.componentType === 'workstation'))) {
        const target = resolvePlacementTarget(raycaster.current, componentType, undefined, rotationRef.current, machinesRef.current, undefined, floorRef.current)
        next = target && [{ ...target, rotation: rotationRef.current }]
      }
    }
    setGhost((previous) => {
      if (!next) return previous === null ? previous : null
      return previous && previous.length === next.length && previous.every((piece, index) =>
        piece.position[0] === next[index].position[0] && piece.position[2] === next[index].position[2] &&
        piece.length === next[index].length && piece.rotation === next[index].rotation && piece.angle === next[index].angle && piece.entryAngle === next[index].entryAngle && piece.exitAngle === next[index].exitAngle && piece.workstationId === next[index].workstationId) ? previous : next
    })
  })

  // A type change invalidates the old preview until the next raycast.
  useEffect(() => { setGhost(null) }, [componentType])

  return ghost && componentType ? <>{ghost.map((piece, index) =>
    <MachineMesh key={index} componentType={componentType} position={[piece.position[0], piece.workstationId ? WORKSTATION_HEIGHT : 0, piece.position[2]]} length={piece.length} rotation={piece.rotation} angle={piece.angle} entryAngle={piece.entryAngle} exitAngle={piece.exitAngle} transitionIn={index > 0} transitionOut={index < ghost.length - 1} ghost />)}
    {componentType === 'conveyor-belt' && ghost.length === 2 && (() => {
      const first = ghost[0]
      const [dx, dz] = first.angle === undefined ? DIRECTIONS[first.rotation] : [Math.cos(first.angle), -Math.sin(first.angle)]
      return <TransitionMesh center={[first.position[0] + dx * (first.length ?? 0) / 2, first.position[2] + dz * (first.length ?? 0) / 2]}
        rotation={first.angle === undefined ? first.rotation : first.angle * 2 / Math.PI} fromHeight={first.workstationId ? WORKSTATION_HEIGHT : 0} toHeight={ghost[1].workstationId ? WORKSTATION_HEIGHT : 0} highlighted={false} ghost />
    })()}
  </> : null
}
