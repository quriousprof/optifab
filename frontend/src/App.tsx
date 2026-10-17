import { useCallback, useEffect, useRef, useState } from 'react'
import { FactoryViewport } from './FactoryViewport'
import type { PlaceOptions } from './SceneInteraction'
import { ComponentSidebar } from './ComponentSidebar'
import { mergeConveyors, resizeConveyor, rotateMachine } from './connections'
import { FLOOR_SIZE, type EditorMode, type FactoryComponentType, type FloorPosition, type PlacedMachine } from './factoryComponents'

export function App() {
  const [fitVersion, setFitVersion] = useState(0)
  const [editorMode, setEditorMode] = useState<EditorMode>({ mode: 'navigate' })
  const [placementRotation, setPlacementRotation] = useState(0)
  const [activeMachines, setActiveMachines] = useState<PlacedMachine[]>([])
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ machineId: string; version: number } | null>(null)
  // Undo: every edit pushes the previous layout (immutable arrays, so snapshots are cheap).
  const machinesRef = useRef(activeMachines)
  machinesRef.current = activeMachines
  const history = useRef<PlacedMachine[][]>([])
  const dragging = useRef(false) // a whole drag is one undo step
  const [undoDepth, setUndoDepth] = useState(0)
  const checkpoint = useCallback(() => {
    history.current = [...history.current.slice(-99), machinesRef.current]
    setUndoDepth(history.current.length)
  }, [])
  const undo = useCallback(() => {
    const previous = history.current.pop()
    if (!previous) return
    dragging.current = false
    setUndoDepth(history.current.length)
    setActiveMachines(previous)
  }, [])
  const selectMachine = useCallback((id: string | null) => {
    setSelectedMachineId(id)
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
  const moveMachine = useCallback((id: string, position: FloorPosition) => {
    if (!dragging.current) { dragging.current = true; checkpoint() }
    setActiveMachines((machines) => machines.map((machine) => (machine.id === id ? { ...machine, position } : machine)))
  }, [checkpoint])
  const settleMachine = useCallback((id: string) => {
    dragging.current = false
    setActiveMachines((machines) => mergeConveyors(machines, id))
  }, [])
  // A merge can absorb the selected belt's id.
  useEffect(() => {
    if (selectedMachineId && !activeMachines.some((m) => m.id === selectedMachineId)) setSelectedMachineId(null)
  }, [activeMachines, selectedMachineId])
  const resizeSelected = useCallback((length: number) => {
    checkpoint()
    setActiveMachines((machines) => machines.map((machine) => (machine.id === selectedMachineId ? resizeConveyor(machine, machines, length) : machine)))
    settleMachine(selectedMachineId!)
  }, [selectedMachineId, settleMachine, checkpoint])
  const deleteSelected = useCallback(() => {
    if (!selectedMachineId) return
    checkpoint()
    setActiveMachines((machines) => machines.filter((m) => m.id !== selectedMachineId))
  }, [selectedMachineId, checkpoint])
  const fit = () => {
    setSelectedMachineId(null)
    setFocusRequest(null)
    setFitVersion((version) => version + 1)
  }

  return (
    <main
      className={`factory-app${selectedMachineId ? ' factory-app--inspecting' : ''}`}
      aria-label="Factory floor viewer"
      onKeyDown={(event) => {
        if (event.key.toLowerCase() === 'r' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
          if (editorMode.mode === 'placement') setPlacementRotation((turns) => (turns + 1) % 4)
          else if (selectedMachineId) {
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
        focusRequest={focusRequest}
        onSelect={selectMachine}
        onFocus={focusMachine}
        onPlace={placeMachine}
        onMove={moveMachine}
        onSettle={settleMachine}
        onDelete={deleteSelected}
      />

      <ComponentSidebar
        editorMode={editorMode}
        machineCount={activeMachines.length}
        selectedConveyor={activeMachines.find((m) => m.id === selectedMachineId && m.componentType === 'conveyor-belt')}
        onResize={resizeSelected}
        canDelete={selectedMachineId !== null}
        onDelete={deleteSelected}
        canUndo={undoDepth > 0}
        onUndo={undo}
        onSelect={(componentType) => {
          setSelectedMachineId(null)
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
