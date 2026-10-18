import { MAX_LENGTH, MAX_STORAGE_SIZE, MIN_LENGTH } from './connections'
import { FACTORY_COMPONENTS, machineDepth, machineWidth, type PlacedMachine, type FactoryComponent, type FactoryComponentType, type EditorMode } from './factoryComponents'

function ComponentShape({ component }: { component: FactoryComponent }) {
  return (
    <svg viewBox="0 0 56 56" fill="none" className="size-12 shrink-0" style={{ color: component.color }} aria-hidden="true">
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

export function ComponentSidebar({ editorMode, machineCount, selectedConveyor, selectedStorage, selectedCount, selectedGroupSize, selectedLocked, canUngroup, onGroup, onUngroup, onToggleLock, onResize, canResizeConveyor, onResizeStorage, canResizeStorage, canDelete, onDelete, canUndo, onUndo, onSelect, onCancel }: {
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
  const selected = editorMode.mode === 'placement'
    ? FACTORY_COMPONENTS.find((component) => component.type === editorMode.componentType)
    : undefined

  return (
    <aside
      aria-labelledby="component-palette-title"
      className="pointer-events-auto absolute top-[92px] left-7 z-10 max-h-[calc(100svh-228px)] w-[272px] overflow-y-auto rounded-xl border border-[#b3c0ca] bg-[#f6f9fb]/95 p-4 text-[#263844] shadow-[0_6px_24px_#2638440a] max-sm:top-20 max-sm:left-[18px] max-sm:w-[238px] max-sm:p-3"
    >
      <h2 id="component-palette-title" className="text-base font-semibold tracking-[-0.3px]">Components</h2>
      <p className="mt-1 text-xs leading-5 text-[#4c606e]">Drag onto the floor to build a line. Place machines on workstations to make a shared cell. Orange marks input; blue marks output.</p>

      {selectedCount > 0 && <div className="mt-4 border-t border-[#d4dfe7] pt-4" role="group" aria-label="Selection controls">
        <p className="text-xs font-semibold">{selectedGroupSize} {selectedGroupSize === 1 ? 'component' : 'components'} selected{selectedLocked ? ' · Locked' : ''}</p>
        <p className="mt-1 text-xs leading-4 text-[#4c606e]">Connected parts move together. Shift-click to group separate parts; Alt-drag one away to detach it.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={selectedCount < 2 || selectedLocked} onClick={onGroup} className="min-h-9 rounded-md border border-[#b3c0ca] bg-white px-2 text-xs font-semibold hover:bg-[#e7eff6] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]">Group</button>
          <button type="button" disabled={!canUngroup} onClick={onUngroup} className="min-h-9 rounded-md border border-[#b3c0ca] bg-white px-2 text-xs font-semibold hover:bg-[#e7eff6] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]">Ungroup</button>
          <button type="button" onClick={onToggleLock} className="col-span-2 min-h-9 rounded-md border border-[#b3c0ca] bg-white px-2 text-xs font-semibold hover:bg-[#e7eff6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]">{selectedLocked ? 'Unlock selected' : 'Lock selected'}</button>
        </div>
      </div>}

      {selectedConveyor && (() => {
        const length = machineWidth(selectedConveyor.componentType, selectedConveyor.length)
        return <div className="mt-4 border-t border-[#d4dfe7] pt-4" role="group" aria-label="Conveyor length">
          <p className="text-xs font-semibold">Conveyor length</p>
          <p className="mt-1 text-xs leading-4 text-[#4c606e]">The connected input stays fixed. Components beyond the output move with the belt.</p>
          <div className="mt-3 flex items-center gap-2">
            <LengthButton label="Shorten conveyor" symbol="−" length={length - 1} disabled={!canResizeConveyor(length - 1)} onResize={onResize} />
            <span className="min-w-12 text-center text-xs tabular-nums">{length} units</span>
            <LengthButton label="Lengthen conveyor" symbol="+" length={length + 1} disabled={!canResizeConveyor(length + 1)} onResize={onResize} />
          </div>
          <input type="range" aria-label="Conveyor length" min={MIN_LENGTH} max={MAX_LENGTH} value={length}
            onChange={(event) => onResize(Number(event.target.value))}
            className="mt-2 w-full cursor-pointer accent-[#28649b]" />
        </div>
      })()}

      {selectedStorage && <div className="mt-4 border-t border-[#d4dfe7] pt-4" role="group" aria-label={selectedStorage.componentType === 'workstation' ? 'Workstation size' : 'Deposit size'}>
        <p className="text-xs font-semibold">{selectedStorage.componentType === 'workstation' ? 'Workstation size' : 'Deposit size'}</p>
        <p className="mt-1 text-xs leading-4 text-[#4c606e]">{selectedStorage.componentType === 'workstation' ? 'Extend the deck in either direction. Mounted machines stay in place.' : 'Grow along the flow or across it.'}</p>
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

      <div className="mt-4 flex flex-col gap-2" role="group" aria-label="Factory components">
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
              className="group flex min-h-[76px] w-full cursor-pointer items-center gap-3 rounded-lg border border-transparent p-2 text-left hover:border-[#b3c0ca] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b] aria-pressed:border-[#28649b] aria-pressed:bg-[#e7eff6] max-sm:gap-2"
            >
              <ComponentShape component={component} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-5 font-semibold">{component.name}</span>
                <span className="mt-0.5 block text-xs leading-4 text-[#4c606e]">{component.description}</span>
              </span>
              <svg viewBox="0 0 16 16" fill="none" className="size-4 shrink-0 text-[#28649b] opacity-0 group-aria-pressed:opacity-100" aria-hidden="true">
                <path d="m3 8 3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex gap-2 border-t border-[#d4dfe7] pt-4">
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

      <div className="mt-4 border-t border-[#d4dfe7] pt-4">
        <div role="status" aria-live="polite" aria-atomic="true" className="text-xs leading-5 text-[#4c606e]">
          {selected ? (
            <>
              <p className="font-semibold text-[#28649b]">Placement mode</p>
              <p>{selected.name} selected.</p>
              <p className="mt-1">Move over the floor to preview. Click to place and press R to rotate. Place machines on a workstation deck; drag with the conveyor to lay a longer floor belt. Ends snap together: a blue output meets an orange input and both turn green.</p>
            </>
          ) : <p>Select a component to enter placement mode.</p>}
          <p className="mt-2">{machineCount} {machineCount === 1 ? 'component' : 'components'} placed</p>
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
    </aside>
  )
}
