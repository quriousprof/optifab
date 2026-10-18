import { FAILABLE_MACHINES, type Stage } from './api'
import type { PlacedMachine } from './factoryComponents'
import type { Factory } from './useFactory'

const STAGE_OF: Partial<Record<PlacedMachine['componentType'], Stage>> = { 'cutting-machine': 'cutting', 'forming-machine': 'forming', 'inspection-machine': 'inspection' }
const button = 'pointer-events-auto cursor-pointer rounded-md border border-[#b3c0ca] bg-white px-2.5 py-1 text-xs font-semibold hover:bg-[#e7eff6] disabled:cursor-default disabled:opacity-40'

/** Rendered inside the selected machine's card: backend ID, live state, and the failure trigger. */
export function MachineInspector({ machine, factory, onRelabel }: { machine: PlacedMachine; factory: Factory; onRelabel: (label: string) => void }) {
  const stage = STAGE_OF[machine.componentType]
  if (!stage) return null
  const { scenario, state, busy } = factory
  const machineState = machine.label ? state?.machineStates[machine.label] : undefined
  const ids = scenario?.machines.filter((item) => item.stage === stage).map((item) => item.machineId) ?? []
  const affected = machine.label && factory.baseline
    ? [...new Set(factory.baseline.operations.filter((op) => op.machineId === machine.label && state?.blockedJobIds.includes(op.jobId)).map((op) => op.jobId))]
    : []
  return <div className="twin-inspector">
    <label>Machine ID{' '}
      <select value={machine.label ?? ''} onChange={(event) => onRelabel(event.target.value)}>
        {!ids.includes(machine.label ?? '') && <option value={machine.label ?? ''}>{machine.label ?? '—'} (not in scenario)</option>}
        {ids.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
    </label>
    <dl>
      <dt>Stage</dt><dd>{stage}</dd>
      <dt>State</dt><dd data-status={machineState?.status}>{machineState?.status ?? 'not linked'}</dd>
      {machineState?.currentOperationId && <><dt>Running</dt><dd>{machineState.currentOperationId}</dd></>}
      {affected.length > 0 && <><dt>Blocked jobs</dt><dd>{affected.join(', ')}</dd></>}
    </dl>
    {state?.phase === 'baseline' && machine.label && FAILABLE_MACHINES.includes(machine.label) &&
      <button type="button" className={button} disabled={!!busy} onClick={() => factory.fail(machine.label!)}>
        Simulate failure at minute {scenario?.failure.at ?? 6}
      </button>}
  </div>
}

/** Floating card for the failure → optimize → apply → reset lifecycle. */
export function RecoveryPanel({ factory }: { factory: Factory }) {
  const { state, optimizeResult: result, busy, error, analysis, explanation } = factory
  if (!state) return error ? <aside className={panel}><p className="text-[#b3362f]">Backend unreachable: {error}</p></aside> : null
  const options = result?.status === 'completed' ? [
    { name: 'QAOA (10-qubit Cirq)', schedule: result.qaoa_schedule, makespan: result.qaoa_makespan },
    { name: 'Classical (optimal)', schedule: result.classical_schedule, makespan: result.classical_makespan },
  ] : []
  return <aside className={panel} aria-live="polite">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">
        {state.phase === 'baseline' ? 'Baseline running' : state.phase === 'failed' ? `${state.failedMachineIds.join(', ')} failed at minute ${state.simulationTime}` : `Recovered: ${state.activeScheduleId}`}
      </h2>
      <button type="button" className={button} disabled={!!busy || state.phase === 'baseline'} onClick={factory.reset}>Reset</button>
    </div>
    {state.phase === 'baseline' && <p className="mt-1 text-[#4c606e]">Select a forming machine (F1–F3) to simulate a failure.</p>}
    {state.blockedJobIds.length > 0 && <p className="mt-1">Blocked jobs: {state.blockedJobIds.join(', ')}</p>}
    {busy && <p className="mt-2 text-[#4c606e]">{busy === 'optimizing' ? 'Optimizing recovery schedule (QAOA ~10–15 s)…' : `${busy[0].toUpperCase()}${busy.slice(1)}…`}</p>}
    {error && <p className="mt-2 text-[#b3362f]">{error} {state.phase === 'failed' && <button type="button" className={button} onClick={factory.optimize}>Retry</button>}</p>}
    {state.phase === 'failed' && options.map(({ name, schedule, makespan }) => schedule &&
      <div key={schedule.scheduleId} className="mt-2 flex items-center justify-between gap-2">
        <span>{name}: <strong>{makespan} min</strong></span>
        <button type="button" className={button} disabled={!!busy} onClick={() => factory.apply(schedule.scheduleId)}>Apply</button>
      </div>)}
    {result?.qaoa_metadata && <p className="mt-1 text-[#4c606e]">{result.qaoa_metadata.num_qubits} qubits · p={result.qaoa_metadata.circuit_depth} · {result.qaoa_metadata.optimizer_iterations} COBYLA evals</p>}
    {(explanation ?? analysis) && <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-[#4c606e]">{explanation ?? analysis}</p>}
  </aside>
}

const panel = 'pointer-events-auto absolute right-7 bottom-24 z-10 w-[300px] rounded-xl border border-[#b3c0ca] bg-[#f6f9fb]/95 p-4 text-xs text-[#263844] shadow-[0_6px_24px_#2638440a] max-sm:right-[18px] max-sm:w-[238px]'
