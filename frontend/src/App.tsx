import { useState } from 'react'
import { FactoryViewport, FLOOR_SIZE } from './FactoryViewport'
import { ComponentSidebar } from './ComponentSidebar'
import type { EditorMode } from './factoryComponents'

export function App() {
  const [fitVersion, setFitVersion] = useState(0)
  const [editorMode, setEditorMode] = useState<EditorMode>({ mode: 'navigate' })
  const fit = () => setFitVersion((version) => version + 1)

  return (
    <main
      className="factory-app"
      aria-label="Factory floor viewer"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          if (editorMode.mode === 'placement') setEditorMode({ mode: 'navigate' })
          else fit()
        }
      }}
      onPointerDown={(event) => {
        if (event.target instanceof HTMLCanvasElement) event.target.focus()
      }}
      onContextMenu={(event) => {
        if (event.target instanceof HTMLCanvasElement) event.preventDefault()
      }}
    >
      <FactoryViewport fitVersion={fitVersion} isPlacing={editorMode.mode === 'placement'} />

      <ComponentSidebar
        editorMode={editorMode}
        onSelect={(componentType) => setEditorMode({ mode: 'placement', componentType })}
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
          <span>Drag to move; Shift-drag to rotate</span>
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
