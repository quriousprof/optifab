import { useCallback, useEffect, useState } from 'react'
import * as api from './api'
import type { FactoryState, OptimizeResult, Scenario, Schedule } from './api'

/**
 * Owns all backend state for the digital twin. The UI renders whatever FactoryState the API
 * returns; it never runs its own clock (docs/demo-contract.md).
 */
export function useFactory() {
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [state, setState] = useState<FactoryState | null>(null)
  const [schedules, setSchedules] = useState<Record<string, Schedule>>({})
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [busy, setBusy] = useState<'failing' | 'optimizing' | 'applying' | 'resetting' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const addSchedule = (schedule: Schedule) => setSchedules((all) => ({ ...all, [schedule.scheduleId]: schedule }))
  // Gemini endpoints 503 without a key; the demo works without them.
  const optional = <T,>(promise: Promise<T>, use: (value: T) => void) => promise.then(use).catch(() => {})

  const run = useCallback(async (label: NonNullable<typeof busy>, work: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await work()
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      return false
    } finally { setBusy(null) }
  }, [])

  useEffect(() => {
    run('resetting', async () => {
      const [loadedScenario, loadedState, baseline] = await Promise.all([api.getScenario(), api.getState(), api.getSchedule('baseline')])
      setScenario(loadedScenario)
      setState(loadedState)
      addSchedule(baseline)
      if (loadedState.activeScheduleId !== 'baseline') addSchedule(await api.getSchedule(loadedState.activeScheduleId))
    })
  }, [run])

  const optimize = useCallback(() => run('optimizing', async () => {
    const result = await api.optimize('both')
    setOptimizeResult(result)
    if (result.status === 'failed') throw new Error(result.error ?? 'Optimization failed')
    for (const schedule of [result.qaoa_schedule, result.classical_schedule]) if (schedule) addSchedule(schedule)
  }), [run])

  /** Fails a forming machine (F1–F3) at minute 6, then asks Gemini and the optimizer in parallel. */
  const fail = useCallback(async (machineId: string) => {
    const triggered = await run('failing', async () => {
      setState(await api.triggerFailure(machineId))
      setOptimizeResult(null)
      setExplanation(null)
      setAnalysis(null)
      optional(api.analyzeFailure(), ({ analysis }) => setAnalysis(analysis))
    })
    if (triggered) await optimize()
  }, [run, optimize])

  const apply = useCallback((scheduleId: string) => run('applying', async () => {
    setState(await api.applyRecovery(scheduleId))
    optional(api.explainSchedule(scheduleId), ({ explanation }) => setExplanation(explanation))
  }), [run])

  const reset = useCallback(() => run('resetting', async () => {
    setState(await api.resetFailure())
    setSchedules((all) => ({ baseline: all.baseline }))
    setOptimizeResult(null)
    setAnalysis(null)
    setExplanation(null)
  }), [run])

  return {
    scenario, state, schedules, optimizeResult, analysis, explanation, busy, error,
    baseline: schedules.baseline ?? null,
    activeSchedule: state ? schedules[state.activeScheduleId] ?? null : null,
    fail, optimize, apply, reset,
  }
}

export type Factory = ReturnType<typeof useFactory>
