import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Raycaster, Vector2 } from 'three'
import { MachineMesh } from './MachineMesh'
import type { FactoryComponentType, FloorPosition, PlacedMachine } from './factoryComponents'
import { layConveyor, resolvePlacement } from './connections'
import { floorPoint, isPlacementClick, isPlacementPointer, trackPlacementDrag, type PlacementGesture } from './placement'
import { isDoubleMachineClick, pickMachine, type MachineClick } from './machineInteraction'

type Ghost = { position: FloorPosition; length?: number; rotation: number }

export type PlaceOptions = { length?: number; rotation?: number }

export function SceneInteraction({ componentType, rotation, machines, onPlace, onMove, onSettle, onSelect, onFocus }: {
  componentType: FactoryComponentType | null
  rotation: number
  machines: PlacedMachine[]
  onMove: (id: string, position: FloorPosition) => void
  onPlace: (type: FactoryComponentType, position: FloorPosition, options?: PlaceOptions) => void
  onSettle: (id: string) => void
  onSelect: (id: string | null) => void
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
  const rotationRef = useRef(rotation)
  rotationRef.current = rotation
  const moving = useRef<string | null>(null)
  const lay = useRef<[number, number] | null>(null) // start cell of a conveyor being dragged out
  const [ghost, setGhost] = useState<Ghost | null>(null)

  useEffect(() => {
    const canvas = gl.domElement

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
      lay.current = null
      if (controls) controls.enabled = true
    }
    const clear = () => {
      stopMoving()
      pointer.current = null
      gesture.current = null
      lastClick.current = null
      setGhost(null)
      invalidate()
    }
    // Capture phase on window so OrbitControls never starts panning when the press lands on a machine.
    const grab = (event: PointerEvent) => {
      if (event.target !== canvas || !isPlacementPointer(event) || !controls) return
      updatePointer(event)
      camera.updateMatrixWorld()
      raycaster.current.setFromCamera(pointer.current!, camera)
      if (componentType === 'conveyor-belt') { // left-drag lays a conveyor instead of panning
        const point = floorPoint(raycaster.current)
        if (point) {
          lay.current = [Math.round(point[0]) || 0, Math.round(point[1]) || 0]
          controls.enabled = false
        }
        return
      }
      if (componentType) return
      moving.current = pickMachine(raycaster.current, scene)
      if (moving.current) controls.enabled = false
    }
    const down = (event: PointerEvent) => {
      updatePointer(event)
      gesture.current = isPlacementPointer(event)
        ? { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, dragged: false }
        : null
    }
    const move = (event: PointerEvent) => {
      if (gesture.current) trackPlacementDrag(gesture.current, event)
      updatePointer(event)
      const machine = machinesRef.current.find((item) => item.id === moving.current)
      if (machine && gesture.current?.dragged) {
        camera.updateMatrixWorld()
        raycaster.current.setFromCamera(pointer.current!, camera)
        const next = resolvePlacement(raycaster.current, machine.componentType, machine.length, machine.rotation ?? 0, machinesRef.current, machine.id)
        if (next && (next[0] !== machine.position[0] || next[2] !== machine.position[2])) onMove(machine.id, next)
      }
    }
    const up = (event: PointerEvent) => {
      const start = lay.current
      const wasMoving = moving.current
      stopMoving()
      const canPlace = isPlacementClick(gesture.current, event)
      const dragged = gesture.current?.dragged
      gesture.current = null
      if (wasMoving && dragged) onSettle(wasMoving)
      if (!canPlace) {
        lastClick.current = null
        if (start && dragged) {
          updatePointer(event)
          camera.updateMatrixWorld()
          raycaster.current.setFromCamera(pointer.current!, camera)
          const point = floorPoint(raycaster.current)
          const laid = point && layConveyor(start, point, machinesRef.current, rotationRef.current)
          if (laid) onPlace('conveyor-belt', laid.position, laid)
          setGhost(null)
        }
        return
      }

      // Raycast again at click time so the placed object matches this pointer and camera.
      updatePointer(event)
      camera.updateMatrixWorld()
      raycaster.current.setFromCamera(pointer.current!, camera)
      const machineId = pickMachine(raycaster.current, scene)
      if (machineId) {
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
      const snapped = resolvePlacement(raycaster.current, componentType, undefined, rotationRef.current, machinesRef.current)
      if (snapped) onPlace(componentType, snapped, { rotation: rotationRef.current })
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
      const snapped = resolvePlacement(raycaster.current, componentType, undefined, rotationRef.current, machinesRef.current)
      if (snapped) onPlace(componentType, snapped, { rotation: rotationRef.current })
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
    }
  }, [camera, gl, invalidate, scene, componentType, controls, onPlace, onMove, onSettle, onSelect, onFocus])

  useFrame(() => {
    if (!pointer.current || !componentType) return
    // Recompute after OrbitControls, including zoom/pan with a stationary mouse.
    camera.updateMatrixWorld()
    raycaster.current.setFromCamera(pointer.current, camera)
    let next: Ghost | null = null
    if (lay.current) {
      const point = floorPoint(raycaster.current)
      next = point && layConveyor(lay.current, point, machinesRef.current, rotationRef.current)
    } else if (!pickMachine(raycaster.current, scene)) {
      const position = resolvePlacement(raycaster.current, componentType, undefined, rotationRef.current, machinesRef.current)
      next = position && { position, rotation: rotationRef.current }
    }
    setGhost((previous) => {
      if (!next) return previous === null ? previous : null
      return previous && previous.position[0] === next.position[0] && previous.position[2] === next.position[2] &&
        previous.length === next.length && previous.rotation === next.rotation ? previous : next
    })
  })

  // A type change invalidates the old preview until the next raycast.
  useEffect(() => { setGhost(null) }, [componentType])

  return ghost && componentType ? <MachineMesh componentType={componentType} position={ghost.position} length={ghost.length} rotation={ghost.rotation} ghost /> : null
}
