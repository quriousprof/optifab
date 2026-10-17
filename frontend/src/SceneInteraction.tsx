import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Raycaster, Vector2 } from 'three'
import { MachineMesh } from './MachineMesh'
import type { FactoryComponentType, FloorPosition, PlacedMachine } from './factoryComponents'
import { getSnappedFloorPosition, isPlacementClick, isPlacementPointer, trackPlacementDrag, type PlacementGesture } from './placement'
import { isDoubleMachineClick, pickMachine, type MachineClick } from './machineInteraction'

export function SceneInteraction({ componentType, machines, onPlace, onMove, onSelect, onFocus }: {
  componentType: FactoryComponentType | null
  machines: PlacedMachine[]
  onMove: (id: string, position: FloorPosition) => void
  onPlace: (type: FactoryComponentType, position: FloorPosition) => void
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
  const moving = useRef<string | null>(null)
  const [position, setPosition] = useState<FloorPosition | null>(null)

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
      if (controls) controls.enabled = true
    }
    const clear = () => {
      stopMoving()
      pointer.current = null
      gesture.current = null
      lastClick.current = null
      setPosition(null)
      invalidate()
    }
    // Capture phase on window so OrbitControls never starts panning when the press lands on a machine.
    const grab = (event: PointerEvent) => {
      if (event.target !== canvas || componentType || !isPlacementPointer(event) || !controls) return
      updatePointer(event)
      camera.updateMatrixWorld()
      raycaster.current.setFromCamera(pointer.current!, camera)
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
        const next = getSnappedFloorPosition(raycaster.current, machine.componentType)
        if (next && (next[0] !== machine.position[0] || next[2] !== machine.position[2])) onMove(machine.id, next)
      }
    }
    const up = (event: PointerEvent) => {
      stopMoving()
      const canPlace = isPlacementClick(gesture.current, event)
      gesture.current = null
      if (!canPlace) {
        lastClick.current = null
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
        setPosition(null)
        return
      }
      lastClick.current = null
      if (!componentType) {
        onSelect(null)
        return
      }
      const snapped = getSnappedFloorPosition(raycaster.current, componentType)
      if (snapped) onPlace(componentType, snapped)
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
      const snapped = getSnappedFloorPosition(raycaster.current, componentType)
      if (snapped) onPlace(componentType, snapped)
      setPosition(null)
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
  }, [camera, gl, invalidate, scene, componentType, controls, onPlace, onMove, onSelect, onFocus])

  useFrame(() => {
    if (!pointer.current || !componentType) return
    // Recompute after OrbitControls, including zoom/pan with a stationary mouse.
    camera.updateMatrixWorld()
    raycaster.current.setFromCamera(pointer.current, camera)
    const next = pickMachine(raycaster.current, scene) ? null : getSnappedFloorPosition(raycaster.current, componentType)
    setPosition((previous) => {
      if (!next) return previous === null ? previous : null
      return previous?.[0] === next[0] && previous[2] === next[2] ? previous : next
    })
  })

  // A type change invalidates the old preview until the next raycast.
  useEffect(() => { setPosition(null) }, [componentType])

  return position && componentType ? <MachineMesh componentType={componentType} position={position} ghost /> : null
}
