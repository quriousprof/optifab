import { useEffect, useState } from 'react'
import { ApiError, deleteLayout, getLayout, listLayouts, saveLayout, type LayoutSummary } from './api'
import type { PlacedMachine } from './factoryComponents'

/** Top-right Save / Open menu for factory layouts stored by the backend. */
export function LayoutMenu({ machines, onLoad }: { machines: PlacedMachine[]; onLoad: (machines: PlacedMachine[]) => void }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<LayoutSummary[]>([])
  const [name, setName] = useState('')
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null)

  // Run an API call; show its failure inline instead of throwing.
  const attempt = async (action: () => Promise<void>) => {
    try { await action() } catch (error) { setStatus({ text: error instanceof ApiError ? String(error.message) : 'Backend unreachable', error: true }) }
  }
  const refresh = () => attempt(async () => setSaved(await listLayouts()))
  useEffect(() => { if (open) void refresh() }, [open])

  const save = () => attempt(async () => {
    await saveLayout(name.trim(), machines)
    setStatus({ text: `Saved “${name.trim()}”` })
    await refresh()
  })

  return (
    <div className="layout-menu">
      <button className="fit-button" type="button" aria-expanded={open} onClick={() => { setOpen(!open); setStatus(null) }}>Layouts</button>
      {open && (
        <div className="layout-panel">
          <form onSubmit={(event) => { event.preventDefault(); void save() }}>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Layout name" aria-label="Layout name" maxLength={60} />
            <button type="submit" disabled={!name.trim() || !machines.length}>Save</button>
          </form>
          <ul>
            {saved.map((layout) => (
              <li key={layout.name}>
                <button className="layout-open" type="button" title={`Saved ${new Date(layout.updatedAt).toLocaleString()}`}
                  onClick={() => attempt(async () => { onLoad((await getLayout(layout.name)).machines); setName(layout.name); setOpen(false) })}>{layout.name}</button>
                <button type="button" aria-label={`Delete ${layout.name}`} onClick={() => attempt(async () => { await deleteLayout(layout.name); await refresh() })}>✕</button>
              </li>
            ))}
          </ul>
          {!saved.length && <p className="layout-status">No saved layouts yet.</p>}
          {status && <p className="layout-status" data-error={status.error}>{status.text}</p>}
        </div>
      )}
    </div>
  )
}
