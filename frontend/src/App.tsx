import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FactoryViewport } from './FactoryViewport'
import type { PlaceOptions } from './SceneInteraction'
import { LayoutMenu } from './LayoutMenu'
import { ComponentSidebar } from './ComponentSidebar'
import { MachineInspector, RecoveryPanel } from './TwinPanel'
import { ScheduleChart } from './ScheduleChart'
import { useFactory } from './useFactory'
import { alignMerges, assemblyLocked, linkedAssembly, mergeConveyors, movementAssembly, resizeConveyorLayout, resizeStorage, rotateMachine, translateAssembly, workstationForFootprint, type Laid } from './connections'
import { autoLabel, DEFAULT_FLOOR_SIZE, isResizableAreaType, layoutFitsFloor, relabel, type FloorSize, type EditorMode, type FactoryComponentType, type FloorPosition, type PlacedMachine } from './factoryComponents'
import { explicitSelection } from './machineInteraction'
import { FloorSizeControl } from './FloorSizeControl'

export function App() {
  const factory = useFactory()
  const [fitVersion, setFitVersion] = useState(0)
  const [editorMode, setEditorMode] = useState<EditorMode>({ mode: 'navigate' })
  const [placementRotation, setPlacementRotation] = useState(0)
  const [activeMachines, setActiveMachines] = useState<PlacedMachine[]>([])
  const [floor, setFloor] = useState<FloorSize>(DEFAULT_FLOOR_SIZE)
  const floorRef = useRef(floor)
  floorRef.current = floor
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>([])
  const selectedIdsRef = useRef(selectedMachineIds)
  selectedIdsRef.current = selectedMachineIds
  const selectedMachineId = selectedMachineIds.at(-1) ?? null
  const [focusRequest, setFocusRequest] = useState<{ machineId: string; version: number } | null>(null)
  // Undo: every edit pushes the previous layout (immutable arrays, so snapshots are cheap).
  const machinesRef = useRef(activeMachines)
  machinesRef.current = activeMachines
  const history = useRef<{ machines: PlacedMachine[]; floor: FloorSize }[]>([])
  const dragging = useRef(false) // a whole drag is one undo step
  const dragIds = useRef<Set<string> | null>(null)
  const [undoDepth, setUndoDepth] = useState(0)
  const checkpoint = useCallback(() => {
    history.current = [...history.current.slice(-99), { machines: machinesRef.current, floor: floorRef.current }]
    setUndoDepth(history.current.length)
  }, [])
  const loadLayout = useCallback((machines: PlacedMachine[], savedFloor?: FloorSize) => {
    checkpoint()
    setActiveMachines(machines)
    setFloor(savedFloor ?? DEFAULT_FLOOR_SIZE)
    setSelectedMachineIds([])
    setEditorMode({ mode: 'navigate' })
    setFocusRequest(null)
    setFitVersion((version) => version + 1)
  }, [checkpoint])
  const undo = useCallback(() => {
    const previous = history.current.pop()
    if (!previous) return
    dragging.current = false
    dragIds.current = null
    setUndoDepth(history.current.length)
    setActiveMachines(previous.machines)
    setFloor(previous.floor)
  }, [])
  const selectMachine = useCallback((id: string | null, additive = false) => {
    setSelectedMachineIds((current) => {
      if (!id) return []
      const group = explicitSelection([id], machinesRef.current)
      const members = [...group].filter((item) => item !== id).concat(id)
      return additive ? current.some((item) => group.has(item)) ? current.filter((item) => !group.has(item)) : [...current, ...members] : members
    })
    setFocusRequest(null)
    if (id) setEditorMode({ mode: 'navigate' })
  }, [])
  const selectRectangle = useCallback((ids: string[], additive: boolean) => {
    setSelectedMachineIds((current) => [...explicitSelection(additive ? [...current, ...ids] : ids, machinesRef.current)])
    setFocusRequest(null)
  }, [])
  const focusMachine = useCallback((machineId: string) => {
    setFocusRequest((previous) => ({ machineId, version: (previous?.version ?? 0) + 1 }))
  }, [])
  const toggleEndpoint = useCallback((id: string, side: 'in' | 'out') => {
    const machine = machinesRef.current.find((item) => item.id === id && item.componentType === 'conveyor-belt')
    if (!machine || assemblyLocked(movementAssembly(id, machinesRef.current), machinesRef.current)) return
    const key = side === 'in' ? 'disconnectedIn' : 'disconnectedOut'
    checkpoint()
    setActiveMachines((machines) => machines.map((item) => item.id === id ? { ...item, [key]: !item[key] } : item))
  }, [checkpoint])
  const placeMachine = useCallback((componentType: FactoryComponentType, position: FloorPosition, options: PlaceOptions = {}) => {
    const machine: PlacedMachine = { id: crypto.randomUUID(), componentType, position, ...options }
    checkpoint()
    setActiveMachines((machines) => autoLabel(mergeConveyors([...machines, machine])))
  }, [checkpoint])
  const placeConveyorRun = useCallback((pieces: Laid[]) => {
    if (!pieces.length) return
    checkpoint()
    setActiveMachines((machines) => alignMerges(mergeConveyors([...machines, ...pieces.map((piece): PlacedMachine => ({
      id: crypto.randomUUID(), componentType: 'conveyor-belt', ...piece,
    }))])))
  }, [checkpoint])
  const moveMachine = useCallback((id: string, position: FloorPosition, detach = false) => {
    const dragged = machinesRef.current.find((machine) => machine.id === id)
    if (!dragged) return
    const selected = explicitSelection(selectedIdsRef.current, machinesRef.current)
    const movingIds = selected.size > 1 && selected.has(id) && !detach ? selected : new Set([id])
    const fullAssembly = new Set([...movingIds].flatMap((item) => [...movementAssembly(item, machinesRef.current)]))
    if (assemblyLocked(fullAssembly, machinesRef.current)) return
    const detachComponent = detach && dragged.componentType !== 'workstation'
    const ids = dragIds.current ?? (detachComponent ? new Set([id]) : fullAssembly)
    if (!translateAssembly(machinesRef.current, ids, id, position, detachComponent, floorRef.current)) return
    if (!dragging.current) {
      dragIds.current = ids
      dragging.current = true
      checkpoint()
    }
    setActiveMachines((machines) => {
      const moved = translateAssembly(machines, ids, id, position, detachComponent, floorRef.current)
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
  const lockedIds = useMemo(() => new Set(activeMachines.filter((machine) => assemblyLocked(linkedAssembly(machine.id, activeMachines), activeMachines)).map((machine) => machine.id)), [activeMachines])
  const selectedAssemblyIds = explicitSelection(selectedMachineIds, activeMachines)
  const selectedLocked = assemblyLocked(selectedAssemblyIds, activeMachines)
  const selectedGroupSize = selectedAssemblyIds.size
  const canUngroup = activeMachines.some((machine) => selectedAssemblyIds.has(machine.id) && !!machine.groupId)
  const resizeSelected = useCallback((length: number) => {
    if (selectedLocked || !selectedMachineId) return
    const resized = resizeConveyorLayout(selectedMachineId, machinesRef.current, length, floorRef.current)
    if (!resized) return
    checkpoint()
    setActiveMachines(resized)
  }, [selectedMachineId, selectedLocked, checkpoint])
  const resizeSelectedStorage = useCallback((axis: 'length' | 'breadth', size: number) => {
    if (selectedLocked) return
    const machine = machinesRef.current.find((item) => item.id === selectedMachineId)
    if (!machine) return
    const resized = resizeStorage(machine, machinesRef.current, axis, size, floorRef.current)
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
    if (selectedGroupSize < 2 || selectedLocked) return
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
        if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
        if (event.key.toLowerCase() === 'r' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
          if (editorMode.mode === 'placement') setPlacementRotation((turns) => (turns + 1) % 4)
          else if (selectedMachineId && !selectedLocked && selectedGroupSize === 1) {
            checkpoint()
            setActiveMachines((machines) => mergeConveyors(machines.map((m) => (m.id === selectedMachineId ? rotateMachine(m, floorRef.current) : m)), selectedMachineId))
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
        floor={floor}
        fitVersion={fitVersion}
        placementType={editorMode.mode === 'placement' ? editorMode.componentType : null}
        placementRotation={placementRotation}
        activeMachines={activeMachines}
        selectedMachineId={selectedMachineId}
        highlightedIds={selectedAssemblyIds}
        lockedIds={lockedIds}
        focusRequest={focusRequest}
        onSelect={selectMachine}
        onSelectRectangle={selectRectangle}
        onFocus={focusMachine}
        onToggleEndpoint={toggleEndpoint}
        onPlace={placeMachine}
        onPlaceRun={placeConveyorRun}
        onMove={moveMachine}
        onSettle={settleMachine}
        onDelete={deleteSelected}
        machineStates={factory.state?.machineStates}
        renderDetails={(machine) => <MachineInspector machine={machine} factory={factory} onRelabel={(label) => {
          checkpoint()
          setActiveMachines((machines) => relabel(machines, machine.id, label))
        }} />}
      />

      <RecoveryPanel factory={factory} />
      <ScheduleChart
        factory={factory}
        selectedLabel={activeMachines.find((machine) => machine.id === selectedMachineId)?.label ?? null}
        onSelectMachine={(label) => {
          const machine = activeMachines.find((item) => item.label === label)
          if (!machine) return // that backend machine isn't on the floor yet
          selectMachine(machine.id)
          focusMachine(machine.id)
        }}
      />

      <ComponentSidebar
        editorMode={editorMode}
        machineCount={activeMachines.length}
        selectedMachine={activeMachines.find((machine) => machine.id === selectedMachineId)}
        onSaveLabel={(label) => {
          const machine = machinesRef.current.find((item) => item.id === selectedMachineId)
          if (!machine || selectedLocked || (machine.displayLabel ?? '') === label) return
          checkpoint()
          setActiveMachines((machines) => machines.map((item) => item.id === machine.id ? { ...item, displayLabel: label || undefined } : item))
        }}
        selectedConveyor={selectedLocked ? undefined : activeMachines.find((m) => m.id === selectedMachineId && m.componentType === 'conveyor-belt')}
        selectedStorage={selectedLocked ? undefined : selectedStorage}
        selectedCount={selectedGroupSize}
        selectedGroupSize={selectedGroupSize}
        selectedLocked={selectedLocked}
        canUngroup={canUngroup && !selectedLocked}
        onGroup={groupSelected}
        onUngroup={ungroupSelected}
        onToggleLock={toggleLock}
        onResize={resizeSelected}
        canResizeConveyor={(length) => {
          return !selectedLocked && !!selectedMachineId && !!resizeConveyorLayout(selectedMachineId, activeMachines, length, floor)
        }}
        onResizeStorage={resizeSelectedStorage}
        canResizeStorage={(axis, size) => {
          const machine = activeMachines.find((item) => item.id === selectedMachineId)
          return !selectedLocked && !!machine && resizeStorage(machine, activeMachines, axis, size, floor) !== machine
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
        <LayoutMenu machines={activeMachines} floor={floor} onLoad={loadLayout} />
      </header>

      <footer className="viewport-footer">
        <div className="floor-caption">
          <FloorSizeControl floor={floor} onApply={(next) => {
            if (!layoutFitsFloor(machinesRef.current, next)) return 'Some components would be outside the floor. Move them or choose a larger size.'
            if (next.width !== floor.width || next.depth !== floor.depth) { checkpoint(); setFloor(next) }
            return null
          }} />
        </div>
        <p className="control-hints" id="viewport-help">
          {editorMode.mode === 'placement' && <span>Click to place; drag a conveyor in any direction; start or finish on a belt to branch or merge; R rotates</span>}
          {editorMode.mode === 'navigate' && activeMachines.length > 0 && <span>Click to inspect; double-click to focus; drag to move; R rotates; Delete removes; Ctrl/Cmd+Z undoes</span>}
          <span>Drag empty space to select; Shift-drag to rotate and tilt</span>
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
