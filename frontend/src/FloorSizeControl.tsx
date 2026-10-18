import { useEffect, useState } from 'react'
import { MAX_FLOOR_SIZE, type FloorSize } from './factoryComponents'

export function FloorSizeControl({ floor, onApply }: { floor: FloorSize; onApply: (floor: FloorSize) => string | null }) {
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(String(floor.width))
  const [depth, setDepth] = useState(String(floor.depth))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setWidth(String(floor.width)); setDepth(String(floor.depth)) }, [floor.width, floor.depth])

  const apply = () => {
    const next = { width: Number(width), depth: Number(depth) }
    if (![next.width, next.depth].every((value) => Number.isInteger(value) && value >= 1 && value <= MAX_FLOOR_SIZE)) {
      setError(`Enter whole numbers from 1 to ${MAX_FLOOR_SIZE}.`)
      return
    }
    const message = onApply(next)
    setError(message)
    if (!message) setOpen(false)
  }
  return <div className="relative pointer-events-auto">
    <button type="button" aria-expanded={open} aria-controls="floor-size-editor" onClick={() => { setOpen((value) => !value); setError(null); setWidth(String(floor.width)); setDepth(String(floor.depth)) }} className="rounded-md text-left hover:text-[#28649b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]">
      <span className="floor-size">{floor.width} × {floor.depth} <span>scene units · Edit</span></span>
      <span className="grid-caption block">Grid spacing: 1 unit</span>
    </button>
    {open && <form id="floor-size-editor" onSubmit={(event) => { event.preventDefault(); apply() }} className="absolute bottom-[calc(100%+12px)] left-0 z-10 w-[240px] rounded-xl border border-[#b3c0ca] bg-[#f6f9fb] p-4 text-xs text-[#263844] shadow-[0_6px_24px_#2638441a]">
      <p className="mb-3 text-sm font-semibold">Factory floor size</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">Width<input type="number" min="1" max={MAX_FLOOR_SIZE} step="1" required value={width} onChange={(event) => setWidth(event.target.value)} className="min-w-0 rounded-md border border-[#b3c0ca] bg-white px-2 py-2" /></label>
        <label className="grid gap-1">Depth<input type="number" min="1" max={MAX_FLOOR_SIZE} step="1" required value={depth} onChange={(event) => setDepth(event.target.value)} className="min-w-0 rounded-md border border-[#b3c0ca] bg-white px-2 py-2" /></label>
      </div>
      {error && <p role="alert" className="mt-2 text-[#a3312c]">{error}</p>}
      <button type="submit" className="mt-3 min-h-9 w-full rounded-md border border-[#b3c0ca] bg-white font-semibold hover:bg-[#e7eff6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#28649b]">Apply size</button>
    </form>}
  </div>
}
