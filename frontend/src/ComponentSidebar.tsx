import { FACTORY_COMPONENTS, type FactoryComponent, type FactoryComponentType, type EditorMode } from './factoryComponents'

function ComponentShape({ component }: { component: FactoryComponent }) {
  return (
    <svg viewBox="0 0 56 56" fill="none" className="size-12 shrink-0" style={{ color: component.color }} aria-hidden="true">
      {component.shape === 'cylinder' ? (
        <>
          <path d="M14 16v24c0 5 28 5 28 0V16" fill="currentColor" fillOpacity="0.72" />
          <path d="M28 16v28c8 0 14-1.5 14-4V16" fill="currentColor" />
          <ellipse cx="28" cy="16" rx="14" ry="6" fill="currentColor" />
          <ellipse cx="28" cy="16" rx="14" ry="6" fill="white" fillOpacity="0.2" />
          <path d="M14 16v24c0 5 28 5 28 0V16" stroke="currentColor" strokeWidth="1.2" />
        </>
      ) : (
        <>
          <path d="m7 22 25-13 17 10-25 14L7 22Z" fill="currentColor" fillOpacity="0.7" />
          <path d="M7 22v15l17 10V33L7 22Z" fill="currentColor" />
          <path d="m24 33 25-14v15L24 47V33Z" fill="currentColor" fillOpacity="0.85" />
          <path d="m7 22 25-13 17 10v15L24 47 7 37V22Zm0 0 17 11 25-14M24 33v14" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}

export function ComponentSidebar({ editorMode, onSelect, onCancel }: {
  editorMode: EditorMode
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
      <p className="mt-1 text-xs leading-5 text-[#4c606e]">Choose a component for placement.</p>

      <div className="mt-4 flex flex-col gap-2" role="group" aria-label="Factory components">
        {FACTORY_COMPONENTS.map((component) => {
          const active = selected?.type === component.type
          return (
            <button
              key={component.type}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(component.type)}
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

      <div className="mt-4 border-t border-[#d4dfe7] pt-4">
        <div role="status" aria-live="polite" aria-atomic="true" className="text-xs leading-5 text-[#4c606e]">
          {selected ? (
            <>
              <p className="font-semibold text-[#28649b]">Placement mode</p>
              <p>{selected.name} selected.</p>
            </>
          ) : <p>Select a component to enter placement mode.</p>}
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
