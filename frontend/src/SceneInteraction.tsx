import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Raycaster, Vector2 } from 'three'
import { MachineMesh } from './MachineMesh'
import type { FactoryComponentType, FloorPosition } from './factoryComponents'
import { getSnappedFloorPosition, isPlacementClick, isPlacementPointer, trackPlacementDrag, type PlacementGesture } from './placement'
import { isDoubleMachineClick, pickMachine, type MachineClick } from './machineInteraction'

export function SceneInteraction({ componentType, onPlace, onSelect, onFocus }: {
  componentType: FactoryComponentType | null
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
    const clear = () => {
      pointer.current = null
      gesture.current = null
      lastClick.current = null
      setPosition(null)
      invalidate()
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
    }
    const up = (event: PointerEvent) => {
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

    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointerleave', clear)
    canvas.addEventListener('pointercancel', clear)
    window.addEventListener('blur', clear)
    return () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointerleave', clear)
      canvas.removeEventListener('pointercancel', clear)
      window.removeEventListener('blur', clear)
    }
  }, [camera, gl, invalidate, scene, componentType, onPlace, onSelect, onFocus])

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
