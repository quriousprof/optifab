import { useEffect, useState } from 'react'
import { MAX_LENGTH, MAX_STORAGE_SIZE, MIN_LENGTH } from './connections'
import { FACTORY_COMPONENTS, getFactoryComponent, machineDepth, machineWidth, type PlacedMachine, type FactoryComponent, type FactoryComponentType, type EditorMode } from './factoryComponents'

function ComponentLabelEditor({ machine, locked, onSave }: { machine: PlacedMachine; locked: boolean; onSave: (label: string) => void }) {
  const [draft, setDraft] = useState(machine.displayLabel ?? '')
  useEffect(() => { setDraft(machine.displayLabel ?? '') }, [machine.id, machine.displayLabel])
  const changed = draft.trim() !== (machine.displayLabel ?? '')
  return <form className="mt-4 border-t border-[#d4dfe7] pt-4" onSubmit={(event) => { event.preventDefault(); onSave(draft.trim()) }}>
    <label htmlFor="component-label" className="text-xs font-semibold">Label for {getFactoryComponent(machine.componentType).name.toLowerCase()}</label>
    <div className="mt-2 flex gap-2">
      <input id="component-label" type="text" maxLength={60} value={draft} disabled={locked} onChange={(event) => setDraft(event.target.value)} placeholder={machine.label ?? 'Add a label'} className="min-w-0 flex-1 rounded-md border border-[#b3c0ca] bg-white px-2 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b] disabled:opacity-50" />
      <button type="submit" disabled={locked || !changed} className="rounded-md border border-[#b3c0ca] bg-white px-3 text-xs font-semibold hover:bg-[#e7eff6] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]">Save</button>
    </div>
    <p className="mt-1 text-[11px] leading-4 text-[#4c606e]">Clear the field and save to remove the custom label.</p>
  </form>
}

function ComponentShape({ component }: { component: FactoryComponent }) {
  return (
    <svg viewBox="0 0 56 56" fill="none" className="size-8 shrink-0" style={{ color: component.color }} aria-hidden="true">
      <path d="m7 38 24-12 18 9-24 12L7 38Z" fill="#9aaab3" />
      <path d="M7 38v7l18 9v-7L7 38Zm18 9 24-12v7L25 54v-7Z" fill="#526a76" />
      {component.shape === 'conveyor' && <>
        <path d="m5 21 30-15 16 8-30 15L5 21Z" fill="currentColor" />
        <path d="m13 17 16 8m-9-12 16 8m-9-12 16 8" stroke="#dce9e7" strokeWidth="2" />
        <path d="m5 21 16 8 30-15" stroke="#29484b" strokeWidth="2" />
      </>}
      {component.shape === 'workstation' && <>
        <path d="m5 22 27-13 19 10-27 14L5 22Z" fill="currentColor" />
        <path d="m5 22 19 11 27-14v7L24 40 5 29v-7Z" fill="#8198a4" />
        <path d="m10 22 22-10 14 7-22 11-14-8Z" stroke="#d1dfe4" strokeWidth="1.5" />
      </>}
      {component.shape === 'cutter' && <>
        <path d="m10 14 20-10 17 9v23L27 46 10 37V14Z" fill="currentColor" />
        <path d="m13 24 15 8 14-7v10l-14 7-15-8V24Z" fill="#294b62" />
        <circle cx="28" cy="32" r="5" fill="#b9d6df" />
      </>}
      {component.shape === 'press' && <>
        <path d="m11 11 19-9 16 8v7l-19 9-16-8v-7Z" fill="currentColor" />
        <path d="M14 21v16m29-23v21M28 26v13" stroke="#55646b" strokeWidth="4" />
        <path d="m18 36 12-6 12 6-13 7-11-7Z" fill="currentColor" />
      </>}
      {component.shape === 'scanner' && <>
        <path d="m11 12 19-9 16 8v7l-19 9-16-8v-7Z" fill="currentColor" />
        <path d="M14 21v18m29-21v18" stroke="currentColor" strokeWidth="6" />
        <path d="m18 27 17 8" stroke="#adede7" strokeWidth="2" />
      </>}
      {component.shape === 'hopper' && <>
        <path d="m10 12 19-9 17 9v22l-19 10-17-10V12Z" fill="currentColor" />
        <path d="m15 13 14-7 12 6-14 7-12-6Z" fill="#d6c4a0" />
        <path d="m17 18 11 6 11-5m-22 5 11 6 11-5" stroke="#eadfc9" strokeWidth="2" />
      </>}
      {component.shape === 'output' && <>
        <path d="m9 19 19-10 18 9-19 10-18-9Z" fill="#bdcbd3" />
        <path d="M9 19v18l18 9V28L9 19Zm18 9 19-10v18L27 46V28Z" fill="currentColor" />
        <path d="m16 18 6-3 7 3-7 4-6-4Zm12-6 6-3 6 3-6 4-6-4Z" fill="#dce8ec" />
      </>}
    </svg>
  )
}

function LengthButton({ label, symbol, length, onResize, disabled }: { label: string; symbol: string; length: number; onResize: (length: number) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled ?? (length < MIN_LENGTH || length > MAX_LENGTH)}
      onClick={() => onResize(length)}
      className="size-10 cursor-pointer rounded-md border border-[#b3c0ca] bg-white text-base font-semibold hover:bg-[#e7eff6] disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]"
    >
      {symbol}
    </button>
  )
}

export function ComponentSidebar({ editorMode, machineCount, selectedMachine, onSaveLabel, selectedConveyor, selectedStorage, selectedCount, selectedGroupSize, selectedLocked, canUngroup, onGroup, onUngroup, onToggleLock, onResize, canResizeConveyor, onResizeStorage, canResizeStorage, canDelete, onDelete, canUndo, onUndo, onSelect, onCancel }: {
  selectedMachine?: PlacedMachine
  onSaveLabel: (label: string) => void
  canDelete: boolean
  onDelete: () => void
  canUndo: boolean
  onUndo: () => void
  selectedConveyor?: PlacedMachine
  selectedStorage?: PlacedMachine
  selectedCount: number
  selectedGroupSize: number
  selectedLocked: boolean
  canUngroup: boolean
  onGroup: () => void
  onUngroup: () => void
  onToggleLock: () => void
  onResize: (length: number) => void
  canResizeConveyor: (length: number) => boolean
  onResizeStorage: (axis: 'length' | 'breadth', size: number) => void
  canResizeStorage: (axis: 'length' | 'breadth', size: number) => boolean
  editorMode: EditorMode
  machineCount: number
  onSelect: (type: FactoryComponentType) => void
  onCancel: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [selectionExpanded, setSelectionExpanded] = useState(false)
  const selected = editorMode.mode === 'placement'
    ? FACTORY_COMPONENTS.find((component) => component.type === editorMode.componentType)
    : undefined

  return (
    <aside
      aria-labelledby="component-palette-title"
      className={`pointer-events-auto absolute top-[92px] left-7 z-10 rounded-xl border border-[#b3c0ca] bg-[#f6f9fb]/95 p-4 text-[#263844] shadow-[0_6px_24px_#2638440a] max-sm:top-20 max-sm:left-[18px] max-sm:p-3 ${expanded ? 'w-[272px] max-sm:w-[238px]' : 'w-[160px]'}`}
    >
      <h2 id="component-palette-title" className="text-base font-semibold tracking-[-0.3px]">
        <button type="button" aria-expanded={expanded} aria-controls="component-palette-content" onClick={() => setExpanded((value) => !value)} className="flex min-h-9 w-full cursor-pointer items-center justify-between gap-3 rounded-md text-left hover:text-[#28649b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]">
          Components
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}><path d="m3.5 6 4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </h2>
      <div id="component-palette-content" hidden={!expanded}>
      {selectedCount > 0 && <div className={`absolute top-0 left-[calc(100%+12px)] rounded-xl border border-[#b3c0ca] bg-[#f6f9fb]/95 p-3 shadow-[0_6px_24px_#2638440a] max-sm:fixed max-sm:top-20 max-sm:right-3 max-sm:left-auto ${selectionExpanded ? 'w-[250px] max-sm:w-[210px]' : 'w-[185px]'}`}>
      <button type="button" aria-expanded={selectionExpanded} aria-controls="selected-component-controls" onClick={() => setSelectionExpanded((value) => !value)} className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md text-left text-xs font-semibold hover:text-[#28649b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]">
        <span>{selectedGroupSize} {selectedGroupSize === 1 ? 'component' : 'components'} selected{selectedLocked ? ' · Locked' : ''}</span>
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={`size-4 shrink-0 ${selectionExpanded ? 'rotate-180' : ''}`}><path d="m3.5 6 4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div id="selected-component-controls" hidden={!selectionExpanded}>
      <div role="group" aria-label="Selection controls">
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" disabled={selectedCount < 2 || selectedLocked} onClick={onGroup} className="min-h-9 rounded-md border border-[#b3c0ca] bg-white px-2 text-xs font-semibold hover:bg-[#e7eff6] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]">Group</button>
          <button type="button" disabled={!canUngroup} onClick={onUngroup} className="min-h-9 rounded-md border border-[#b3c0ca] bg-white px-2 text-xs font-semibold hover:bg-[#e7eff6] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]">Ungroup</button>
          <button type="button" onClick={onToggleLock} className="col-span-2 min-h-9 rounded-md border border-[#b3c0ca] bg-white px-2 text-xs font-semibold hover:bg-[#e7eff6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]">{selectedLocked ? 'Unlock selected' : 'Lock selected'}</button>
        </div>
      </div>

      {selectedMachine && <ComponentLabelEditor key={selectedMachine.id} machine={selectedMachine} locked={selectedLocked} onSave={onSaveLabel} />}

      {selectedConveyor && (() => {
        const length = machineWidth(selectedConveyor.componentType, selectedConveyor.length)
        return <div className="mt-4 border-t border-[#d4dfe7] pt-4" role="group" aria-label="Conveyor length">
          <p className="text-xs font-semibold">Conveyor length</p>
          <div className="mt-3 flex items-center gap-2">
            <LengthButton label="Shorten conveyor" symbol="−" length={length - 1} disabled={!canResizeConveyor(length - 1)} onResize={onResize} />
            <span className="min-w-12 text-center text-xs tabular-nums">{Number(length.toFixed(1))} units</span>
            <LengthButton label="Lengthen conveyor" symbol="+" length={length + 1} disabled={!canResizeConveyor(length + 1)} onResize={onResize} />
          </div>
          <input type="range" aria-label="Conveyor length" min={MIN_LENGTH} max={MAX_LENGTH} value={length}
            onChange={(event) => onResize(Number(event.target.value))}
            className="mt-2 w-full cursor-pointer accent-[#28649b]" />
        </div>
      })()}

      {selectedStorage && <div className="mt-4 border-t border-[#d4dfe7] pt-4" role="group" aria-label={selectedStorage.componentType === 'workstation' ? 'Workstation size' : 'Deposit size'}>
        <p className="text-xs font-semibold">{selectedStorage.componentType === 'workstation' ? 'Workstation size' : 'Deposit size'}</p>
        {(['length', 'breadth'] as const).map((axis) => {
          const size = axis === 'length' ? machineWidth(selectedStorage.componentType, selectedStorage.length) : machineDepth(selectedStorage.componentType, selectedStorage.breadth)
          const minimum = axis === 'length' ? machineWidth(selectedStorage.componentType) : machineDepth(selectedStorage.componentType)
          return <div className="mt-3" key={axis}>
            <div className="flex items-center gap-2">
              <span className="min-w-[54px] text-xs font-medium capitalize">{axis}</span>
              <LengthButton label={`Decrease ${axis}`} symbol="−" length={size - 1} disabled={!canResizeStorage(axis, size - 1)} onResize={(value) => onResizeStorage(axis, value)} />
              <span className="min-w-8 text-center text-xs tabular-nums">{size}</span>
              <LengthButton label={`Increase ${axis}`} symbol="+" length={size + 1} disabled={!canResizeStorage(axis, size + 1)} onResize={(value) => onResizeStorage(axis, value)} />
            </div>
            <input type="range" aria-label={`${selectedStorage.componentType === 'workstation' ? 'Workstation' : 'Deposit'} ${axis}`} min={minimum} max={MAX_STORAGE_SIZE} value={size}
              onChange={(event) => onResizeStorage(axis, Number(event.target.value))}
              className="mt-1 w-full cursor-pointer accent-[#28649b]" />
          </div>
        })}
      </div>}
      </div>
      </div>}

      <div className="mt-2 flex flex-col gap-0.5" role="group" aria-label="Factory components">
        {FACTORY_COMPONENTS.map((component) => {
          const active = selected?.type === component.type
          return (
            <button
              key={component.type}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(component.type)}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', component.type) // Firefox needs data to start a drag
                event.dataTransfer.effectAllowed = 'copy'
                onSelect(component.type)
              }}
              onDragEnd={onCancel}
              className="group flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-md border border-transparent px-2 py-1 text-left hover:border-[#b3c0ca] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b] aria-pressed:border-[#28649b] aria-pressed:bg-[#e7eff6] max-sm:gap-2"
            >
              <ComponentShape component={component} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-5 font-semibold">{component.name}</span>
              </span>
              <svg viewBox="0 0 16 16" fill="none" className="size-4 shrink-0 text-[#28649b] opacity-0 group-aria-pressed:opacity-100" aria-hidden="true">
                <path d="m3 8 3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex gap-2 border-t border-[#d4dfe7] pt-2">
        {([['Undo', canUndo, onUndo, 'Ctrl/Cmd+Z'], [selectedGroupSize > 1 ? 'Delete group' : 'Delete', canDelete, onDelete, 'Del']] as const).map(([label, enabled, action, hint]) => (
          <button
            key={label}
            type="button"
            disabled={!enabled}
            title={hint}
            onClick={action}
            className="min-h-10 flex-1 cursor-pointer rounded-md border border-[#b3c0ca] bg-white text-xs font-semibold hover:bg-[#e7eff6] disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-2 border-t border-[#d4dfe7] pt-2">
        <div role="status" aria-live="polite" aria-atomic="true" className="text-xs leading-5 text-[#4c606e]">
          {selected ? (
            <>
              <p className="font-semibold text-[#28649b]">Placement mode</p>
              <p>{selected.name} selected.</p>
              {selected.type === 'conveyor-belt' && <p>Drag from a machine or belt to branch out. End a drag on another belt to merge.</p>}
            </>
          ) : null}
          <p>{machineCount} {machineCount === 1 ? 'component' : 'components'} placed</p>
        </div>
        {selected && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-2 flex min-h-10 w-full cursor-pointer items-center justify-between rounded-md px-2 text-xs font-semibold text-[#4c606e] hover:bg-[#e7eff6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]"
          >
            Cancel selection
            <kbd className="text-[11px] font-normal">Esc</kbd>
          </button>
        )}
      </div>
      </div>
    </aside>
  )
}
