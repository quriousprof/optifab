import { useState } from 'react'
import { changedOperations, disruptedOperations, type ScheduledOperation } from './api'
import type { Factory } from './useFactory'

const JOB_COLORS = ['#3973b8', '#b67e3c', '#378b91', '#7a5fb0', '#4c9a5a', '#b0587a']
const jobColor = (jobId: string) => JOB_COLORS[(Number(jobId.slice(1)) - 1) % JOB_COLORS.length]
const HATCH = 'repeating-linear-gradient(45deg, #d23b32 0 3px, #f6f9fb 3px 6px)'

/**
 * Production schedule: one row per machine on a minute axis (docs/phase-2-ui-decision.md).
 * Baseline stays visible as the original plan. After failure its cancelled operations are hatched red;
 * after recovery the applied schedule is drawn on top with moved operations outlined and their old slots ghosted.
 */
export function ScheduleChart({ factory, selectedLabel, onSelectMachine }: {
  factory: Factory
  selectedLabel: string | null
  onSelectMachine: (label: string) => void
}) {
  const { scenario, state, baseline, activeSchedule } = factory
  const [open, setOpen] = useState(true)
  if (!scenario || !state || !baseline) return null

  const recovered = state.phase === 'recovered' && !!activeSchedule && activeSchedule.scheduleId !== baseline.scheduleId
  const shown = recovered ? activeSchedule : baseline
  const failed = state.phase !== 'baseline'
  const changed = recovered ? changedOperations(baseline, shown) : new Set<string>()
  const disrupted = failed ? disruptedOperations(baseline, state.failedMachineIds, state.simulationTime) : new Set<string>()
  const blocked = new Set(state.blockedJobIds)
  const extent = Math.max(...baseline.operations.map((op) => op.end), ...shown.operations.map((op) => op.end)) + 1
  const makespan = Math.max(...shown.operations.map((op) => op.end))
  const percent = (minute: number) => `${(minute / extent) * 100}%`
  const ticks = Array.from({ length: Math.floor(extent / 2) + 1 }, (_, index) => index * 2)

  const bar = (op: ScheduledOperation, kind: 'solid' | 'ghost') => {
    const cancelled = kind === 'ghost' || (!recovered && disrupted.has(op.operationId))
    const moved = kind === 'solid' && changed.has(op.operationId)
    return <button
      key={`${kind}-${op.operationId}`}
      type="button"
      onClick={() => onSelectMachine(op.machineId)}
      title={`${op.operationId} on ${op.machineId} [${op.start}, ${op.end})${cancelled ? ' — cancelled by the failure' : moved ? ' — moved by recovery' : ''}${blocked.has(op.jobId) ? ' — job blocked' : ''}`}
      className="absolute top-[2px] bottom-[2px] cursor-pointer overflow-hidden rounded-[3px] px-1 text-left text-[10px] leading-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-[#28649b]"
      style={{
        left: percent(op.start), width: percent(op.end - op.start),
        background: kind === 'ghost' ? 'transparent' : cancelled ? HATCH : jobColor(op.jobId),
        color: cancelled ? '#8f2a23' : 'white',
        border: kind === 'ghost' ? '1px dashed #d23b32' : moved ? '2px solid #f2b01e' : cancelled ? '1px solid #d23b32' : '1px solid transparent',
        opacity: kind === 'ghost' ? 0.8 : 1,
        zIndex: kind === 'ghost' ? 0 : 1,
      }}
    >{cancelled && kind === 'solid' ? <span className="rounded-sm bg-[#f6f9fb] px-0.5">{op.jobId} ✕</span> : op.jobId}</button>
  }

  return <section aria-label="Production schedule"
    className="pointer-events-auto absolute right-[344px] bottom-[88px] left-[316px] z-10 rounded-xl border border-[#b3c0ca] bg-[#f6f9fb]/95 p-3 text-xs text-[#263844] shadow-[0_6px_24px_#2638440a] max-lg:hidden">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">
        Production schedule <span className="font-normal text-[#4c606e]">· {recovered ? `recovery ${shown.scheduleId}` : 'baseline'} · {makespan} min</span>
      </h2>
      <button type="button" className="cursor-pointer rounded-md border border-[#b3c0ca] bg-white px-2 py-0.5 text-xs font-semibold hover:bg-[#e7eff6]" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
    </div>
    {open && <>
      <div className="mt-2">
        {scenario.machines.map(({ machineId }) => {
          const isFailed = state.failedMachineIds.includes(machineId)
          return <div key={machineId} className={`flex h-[18px] items-stretch border-b border-[#e1e9ef] ${selectedLabel === machineId ? 'bg-[#dff6fa]' : isFailed ? 'bg-[#fbe9e7]' : ''}`}>
            <button type="button" onClick={() => onSelectMachine(machineId)} className={`w-8 shrink-0 cursor-pointer text-left font-semibold ${isFailed ? 'text-[#b3362f]' : ''}`}>{machineId}</button>
            <div className="relative flex-1">
              {ticks.map((minute) => <span key={minute} className="absolute top-0 bottom-0 border-l border-[#e1e9ef]" style={{ left: percent(minute) }} />)}
              {recovered && baseline.operations.filter((op) => op.machineId === machineId && changed.has(op.operationId)).map((op) => bar(op, 'ghost'))}
              {shown.operations.filter((op) => op.machineId === machineId).map((op) => bar(op, 'solid'))}
              {failed && <span className="absolute top-0 bottom-0 z-[2] w-[2px] bg-[#d23b32]" style={{ left: percent(state.simulationTime) }} aria-hidden="true" />}
            </div>
          </div>
        })}
        <div className="flex">
          <span className="w-8 shrink-0" />
          <div className="relative h-4 flex-1 text-[10px] text-[#4c606e]">
            {ticks.map((minute) => <span key={minute} className="absolute -translate-x-1/2" style={{ left: percent(minute) }}>{minute}</span>)}
            {failed && <span className="absolute -translate-x-1/2 font-semibold text-[#b3362f]" style={{ left: percent(state.simulationTime), top: 0, background: '#f6f9fb' }}>▲{state.simulationTime}</span>}
          </div>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-[#4c606e]">
        Minutes · bar colour = job
        {failed && <> · <span className="font-semibold text-[#b3362f]">red line = failure</span>{!recovered && ' · hatched = cancelled'}</>}
        {recovered && ' · gold outline = moved, dashed red = original slot'}
      </p>
    </>}
  </section>
}
