// Typed client for the FastAPI backend (see docs/api.md). Types mirror backend/app/core/schemas.py.

import { machineDepth, machineWidth, type FloorSize, type PlacedMachine } from './factoryComponents.ts'

export type Stage = 'cutting' | 'forming' | 'inspection'
export type MachineStatus = 'idle' | 'processing' | 'failed' | 'blocked'
export type Phase = 'baseline' | 'failed' | 'recovered'

export type ScheduledOperation = { jobId: string; operationId: string; stage: Stage; machineId: string; start: number; end: number }
export type Schedule = { scheduleId: string; operations: ScheduledOperation[] }
export type MachineState = { status: MachineStatus; currentOperationId: string | null }
export type FactoryState = {
  simulationTime: number
  phase: Phase
  activeScheduleId: string
  failedMachineIds: string[]
  blockedJobIds: string[]
  machineStates: Record<string, MachineState>
}
export type Scenario = {
  failure: { machineId: string; at: number }
  stages: Stage[]
  machines: { machineId: string; stage: Stage; position: [number, number] }[]
  jobs: { jobId: string; cuttingMinutes: number; formingMinutes: Record<string, number>; inspectionMinutes: number }[]
}
export type OptimizeResult = {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  qaoa_schedule: Schedule | null
  classical_schedule: Schedule | null
  qaoa_makespan: number | null
  classical_makespan: number | null
  qaoa_metadata: { num_qubits: number; circuit_depth: number; circuit_moments: number; optimizer_iterations: number; qubo_cost: number; assignments: Record<string, string> } | null
  error: string | null
}

/** Machines the backend lets the user fail (forming only; see backend/app/core/scenario.py). */
export const FAILABLE_MACHINES = ['F1', 'F2', 'F3']

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch(`/api${path}`, method === 'GET' ? undefined : {
    method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, data.detail ?? response.statusText)
  return data as T
}

export const getScenario = () => request<Scenario>('/scenario')
export const getState = () => request<FactoryState>('/state')
export const getSchedule = (id: string) => request<Schedule>(`/schedule/${encodeURIComponent(id)}`)
export const triggerFailure = (machineId: string) => request<FactoryState>('/failure/trigger', { machineId })
export const resetFailure = () => request<FactoryState>('/failure/reset', {})
export const applyRecovery = (scheduleId: string) => request<FactoryState>('/recovery/apply', { scheduleId })
export const analyzeFailure = () => request<{ analysis: string }>('/ai/analyze-failure', {})
export const explainSchedule = (scheduleId: string) => request<{ explanation: string }>('/ai/explain-schedule', { scheduleId })

export type LayoutSummary = { name: string; updatedAt: string }
export const listLayouts = () => request<LayoutSummary[]>('/layouts')
export const getLayout = (name: string) => request<{ machines: PlacedMachine[]; floor?: FloorSize }>(`/layouts/${encodeURIComponent(name)}`)
export const saveLayout = (name: string, machines: PlacedMachine[], floor: FloorSize) => request<LayoutSummary>(`/layouts/${encodeURIComponent(name)}`, {
  machines: machines.map((machine) => ({ ...machine, length: machineWidth(machine.componentType, machine.length), breadth: machineDepth(machine.componentType, machine.breadth) })),
  floor,
}, 'PUT')
export const deleteLayout = (name: string) => request<{ deleted: string }>(`/layouts/${encodeURIComponent(name)}`, undefined, 'DELETE')

/** Starts an optimization job and polls every second until it finishes (QAOA takes ~10–15 s). */
export async function optimize(method: 'qaoa' | 'classical' | 'both' = 'both'): Promise<OptimizeResult> {
  const { jobId } = await request<{ jobId: string }>('/optimize', { method })
  for (;;) {
    const result = await request<OptimizeResult>(`/optimize/${jobId}`)
    if (result.status === 'completed' || result.status === 'failed') return result
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

/** Baseline operations the failure cancels: on a failed machine and not finished by the failure minute. */
export function disruptedOperations(baseline: Schedule, failedMachineIds: string[], time: number): Set<string> {
  return new Set(baseline.operations.filter((op) => failedMachineIds.includes(op.machineId) && op.end > time).map((op) => op.operationId))
}

/** Operation IDs whose machine or timing differs from the baseline — for highlighting on the Gantt. */
export function changedOperations(baseline: Schedule, schedule: Schedule): Set<string> {
  const original = new Map(baseline.operations.map((op) => [op.operationId, op]))
  return new Set(schedule.operations.filter((op) => {
    const before = original.get(op.operationId)
    return !before || before.machineId !== op.machineId || before.start !== op.start || before.end !== op.end
  }).map((op) => op.operationId))
}
