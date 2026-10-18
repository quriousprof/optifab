import { useCallback, useEffect, useRef, useState } from 'react'
import { FactoryViewport } from './FactoryViewport'
import type { PlaceOptions } from './SceneInteraction'
import { ComponentSidebar } from './ComponentSidebar'
import { assemblyLocked, linkedAssembly, mergeConveyors, movementAssembly, resizeConveyorLayout, resizeStorage, rotateMachine, translateAssembly, workstationForFootprint, type Laid } from './connections'
import { FLOOR_SIZE, isResizableAreaType, type EditorMode, type FactoryComponentType, type FloorPosition, type PlacedMachine } from './factoryComponents'

export function App() {
  const [fitVersion, setFitVersion] = useState(0)
  const [editorMode, setEditorMode] = useState<EditorMode>({ mode: 'navigate' })
  const [placementRotation, setPlacementRotation] = useState(0)
  const [activeMachines, setActiveMachines] = useState<PlacedMachine[]>([])
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>([])
  const selectedMachineId = selectedMachineIds.at(-1) ?? null
  const [focusRequest, setFocusRequest] = useState<{ machineId: string; version: number } | null>(null)
  // Undo: every edit pushes the previous layout (immutable arrays, so snapshots are cheap).
  const machinesRef = useRef(activeMachines)
  machinesRef.current = activeMachines
  const history = useRef<PlacedMachine[][]>([])
  const dragging = useRef(false) // a whole drag is one undo step
  const dragIds = useRef<Set<string> | null>(null)
  const [undoDepth, setUndoDepth] = useState(0)
  const checkpoint = useCallback(() => {
    history.current = [...history.current.slice(-99), machinesRef.current]
    setUndoDepth(history.current.length)
  }, [])
  const undo = useCallback(() => {
    const previous = history.current.pop()
    if (!previous) return
    dragging.current = false
    dragIds.current = null
    setUndoDepth(history.current.length)
    setActiveMachines(previous)
  }, [])
  const selectMachine = useCallback((id: string | null, additive = false) => {
    setSelectedMachineIds((current) => !id ? [] : additive ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id] : [id])
    setFocusRequest(null)
    if (id) setEditorMode({ mode: 'navigate' })
  }, [])
  const focusMachine = useCallback((machineId: string) => {
    setFocusRequest((previous) => ({ machineId, version: (previous?.version ?? 0) + 1 }))
  }, [])
  const placeMachine = useCallback((componentType: FactoryComponentType, position: FloorPosition, options: PlaceOptions = {}) => {
    const machine: PlacedMachine = { id: crypto.randomUUID(), componentType, position, ...options }
    checkpoint()
    setActiveMachines((machines) => mergeConveyors([...machines, machine]))
  }, [checkpoint])
  const placeConveyorRun = useCallback((pieces: Laid[]) => {
    if (!pieces.length) return
    checkpoint()
    setActiveMachines((machines) => mergeConveyors([...machines, ...pieces.map((piece): PlacedMachine => ({
      id: crypto.randomUUID(), componentType: 'conveyor-belt', ...piece,
    }))]))
  }, [checkpoint])
  const moveMachine = useCallback((id: string, position: FloorPosition, detach = false) => {
    const dragged = machinesRef.current.find((machine) => machine.id === id)
    if (!dragged) return
    const fullAssembly = movementAssembly(id, machinesRef.current)
    if (assemblyLocked(fullAssembly, machinesRef.current)) return
    const detachComponent = detach && dragged.componentType !== 'workstation'
    const ids = dragIds.current ?? (detachComponent ? new Set([id]) : fullAssembly)
    if (!translateAssembly(machinesRef.current, ids, id, position, detachComponent)) return
    if (!dragging.current) {
      dragIds.current = ids
      dragging.current = true
      checkpoint()
    }
    setActiveMachines((machines) => {
      const moved = translateAssembly(machines, ids, id, position, detachComponent)
      return moved && detachComponent ? moved.map((machine) => machine.id === id ? {
        ...machine,
        groupId: undefined,
        workstationId: workstationForFootprint(machine.componentType, machine.length, machine.rotation ?? 0, machine.position, moved, machine.breadth),
      } : machine) : moved ?? machines
    })
  }, [checkpoint])
  const settleMachine = useCallback((id: string) => {
    const wasGroup = (dragIds.current?.size ?? 0) > 1
    dragging.current = false
    dragIds.current = null
    if (!wasGroup) setActiveMachines((machines) => mergeConveyors(machines, id))
  }, [])
  // A merge can absorb the selected belt's id.
  useEffect(() => {
    setSelectedMachineIds((ids) => ids.every((id) => activeMachines.some((machine) => machine.id === id)) ? ids : ids.filter((id) => activeMachines.some((machine) => machine.id === id)))
  }, [activeMachines])
  const selectedAssemblyIds = new Set(selectedMachineIds.flatMap((id) => [...linkedAssembly(id, activeMachines)]))
  const selectedLocked = assemblyLocked(selectedAssemblyIds, activeMachines)
  const selectedGroupSize = selectedAssemblyIds.size
  const canUngroup = activeMachines.some((machine) => selectedAssemblyIds.has(machine.id) && !!machine.groupId)
  const resizeSelected = useCallback((length: number) => {
    if (selectedLocked || !selectedMachineId) return
    const resized = resizeConveyorLayout(selectedMachineId, machinesRef.current, length)
    if (!resized) return
    checkpoint()
    setActiveMachines(resized)
  }, [selectedMachineId, selectedLocked, checkpoint])
  const resizeSelectedStorage = useCallback((axis: 'length' | 'breadth', size: number) => {
    if (selectedLocked) return
    const machine = machinesRef.current.find((item) => item.id === selectedMachineId)
    if (!machine) return
    const resized = resizeStorage(machine, machinesRef.current, axis, size)
    if (resized === machine) return
    checkpoint()
    setActiveMachines((machines) => machines.map((item) => item.id === machine.id ? resized : item))
  }, [checkpoint, selectedMachineId, selectedLocked])
  const deleteSelected = useCallback(() => {
    if (!selectedMachineId || selectedLocked) return
    checkpoint()
    setActiveMachines((machines) => machines.filter((machine) => !selectedAssemblyIds.has(machine.id)).map((machine) =>
      machine.workstationId && selectedAssemblyIds.has(machine.workstationId) ? { ...machine, workstationId: undefined } : machine))
  }, [selectedMachineId, selectedLocked, selectedAssemblyIds, checkpoint])
  const groupSelected = () => {
    if (selectedMachineIds.length < 2 || selectedLocked) return
    const groupId = crypto.randomUUID()
    checkpoint()
    setActiveMachines((machines) => machines.map((machine) => selectedAssemblyIds.has(machine.id) ? { ...machine, groupId } : machine))
  }
  const ungroupSelected = () => {
    if (!canUngroup || selectedLocked) return
    checkpoint()
    setActiveMachines((machines) => machines.map((machine) => selectedAssemblyIds.has(machine.id) ? { ...machine, groupId: undefined } : machine))
  }
  const toggleLock = () => {
    if (!selectedGroupSize) return
    checkpoint()
    setActiveMachines((machines) => machines.map((machine) => selectedAssemblyIds.has(machine.id) ? { ...machine, locked: !selectedLocked } : machine))
  }
  const selectedStorage = activeMachines.find((machine) => machine.id === selectedMachineId && isResizableAreaType(machine.componentType))
  const fit = () => {
    setSelectedMachineIds([])
    setFocusRequest(null)
    setFitVersion((version) => version + 1)
  }

  return (
    <main
      className="factory-app"
      aria-label="Factory floor viewer"
      onKeyDown={(event) => {
        if (event.key.toLowerCase() === 'r' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
          if (editorMode.mode === 'placement') setPlacementRotation((turns) => (turns + 1) % 4)
          else if (selectedMachineId && !selectedLocked && selectedGroupSize === 1) {
            checkpoint()
            setActiveMachines((machines) => mergeConveyors(machines.map((m) => (m.id === selectedMachineId ? rotateMachine(m) : m)), selectedMachineId))
          }
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault()
          undo()
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && selectedMachineId) {
          event.preventDefault()
          deleteSelected()
        }
        if (event.key === 'Escape') {
          if (editorMode.mode === 'placement') setEditorMode({ mode: 'navigate' })
          else fit()
        }
      }}
      onPointerDown={(event) => {
        dragging.current = false // a new press starts a new undo step, even if the last drag was cut short
        dragIds.current = null
        if (event.target instanceof HTMLCanvasElement) event.target.focus()
      }}
      onContextMenu={(event) => {
        if (event.target instanceof HTMLCanvasElement) event.preventDefault()
      }}
    >
      <FactoryViewport
        fitVersion={fitVersion}
        placementType={editorMode.mode === 'placement' ? editorMode.componentType : null}
        placementRotation={placementRotation}
        activeMachines={activeMachines}
        selectedMachineId={selectedMachineId}
        highlightedIds={selectedAssemblyIds}
        lockedIds={new Set(activeMachines.filter((machine) => assemblyLocked(linkedAssembly(machine.id, activeMachines), activeMachines)).map((machine) => machine.id))}
        focusRequest={focusRequest}
        onSelect={selectMachine}
        onFocus={focusMachine}
        onPlace={placeMachine}
        onPlaceRun={placeConveyorRun}
        onMove={moveMachine}
        onSettle={settleMachine}
        onDelete={deleteSelected}
      />

      <ComponentSidebar
        editorMode={editorMode}
        machineCount={activeMachines.length}
        selectedConveyor={selectedLocked ? undefined : activeMachines.find((m) => m.id === selectedMachineId && m.componentType === 'conveyor-belt')}
        selectedStorage={selectedLocked ? undefined : selectedStorage}
        selectedCount={selectedMachineIds.length}
        selectedGroupSize={selectedGroupSize}
        selectedLocked={selectedLocked}
        canUngroup={canUngroup && !selectedLocked}
        onGroup={groupSelected}
        onUngroup={ungroupSelected}
        onToggleLock={toggleLock}
        onResize={resizeSelected}
        canResizeConveyor={(length) => {
          return !selectedLocked && !!selectedMachineId && !!resizeConveyorLayout(selectedMachineId, activeMachines, length)
        }}
        onResizeStorage={resizeSelectedStorage}
        canResizeStorage={(axis, size) => {
          const machine = activeMachines.find((item) => item.id === selectedMachineId)
          return !selectedLocked && !!machine && resizeStorage(machine, activeMachines, axis, size) !== machine
        }}
        canDelete={selectedMachineId !== null && !selectedLocked}
        onDelete={deleteSelected}
        canUndo={undoDepth > 0}
        onUndo={undo}
        onSelect={(componentType) => {
          setSelectedMachineIds([])
          setFocusRequest(null)
          setEditorMode({ mode: 'placement', componentType })
        }}
        onCancel={() => setEditorMode({ mode: 'navigate' })}
      />

      <header className="viewport-header">
        <div className="identity">
          <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="m16 3 13 7.5v11L16 29 3 21.5v-11L16 3Z" stroke="currentColor" strokeWidth="1.7" />
            <path d="m3 10.5 13 7.7 13-7.7M16 18.2V29M9.5 6.8l13 7.5v7.4" stroke="currentColor" strokeWidth="1.7" />
          </svg>
          <span className="brand-name">Optifab</span>
          <span className="header-divider" aria-hidden="true" />
          <h1>Factory floor</h1>
        </div>
      </header>

      <footer className="viewport-footer">
        <div className="floor-caption">
          <span className="floor-size">{FLOOR_SIZE} × {FLOOR_SIZE} <span>scene units</span></span>
          <span className="grid-caption">Grid spacing: 1 unit</span>
        </div>
        <p className="control-hints" id="viewport-help">
          {editorMode.mode === 'placement' && <span>Click to place; drag to lay a conveyor; R rotates</span>}
          {editorMode.mode === 'navigate' && activeMachines.length > 0 && <span>Click to inspect; double-click to focus; drag to move; R rotates; Delete removes; Ctrl/Cmd+Z undoes</span>}
          <span>Drag to move; Shift-drag to rotate and tilt</span>
          <span>Right-drag / arrows to pan</span>
          <span>Scroll / pinch to zoom</span>
        </p>
        <button className="fit-button" type="button" onClick={fit} aria-describedby="fit-shortcut">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Fit view
          <kbd id="fit-shortcut">Esc</kbd>
        </button>
      </footer>
    </main>
  )
}
