import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import type { FactoryState, OptimizeResult, Scenario, Schedule } from './api'

/** One Gemini response: loading until it settles, then text or the backend's reason (503 = no key, 502 = Gemini failed). */
export type AiState = { status: 'idle' | 'loading' | 'done' | 'error'; text?: string; error?: string }
const IDLE: AiState = { status: 'idle' }

/**
 * Owns all backend state for the digital twin. The UI renders whatever FactoryState the API
 * returns; it never runs its own clock (docs/demo-contract.md).
 */
export function useFactory() {
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [state, setState] = useState<FactoryState | null>(null)
  const [schedules, setSchedules] = useState<Record<string, Schedule>>({})
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null)
  const [analysis, setAnalysis] = useState<AiState>(IDLE)
  const [explanation, setExplanation] = useState<AiState>(IDLE)
  const generation = useRef(0) // bumped on reset so a late Gemini reply can't land on a fresh baseline
  const [busy, setBusy] = useState<'failing' | 'optimizing' | 'applying' | 'resetting' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const addSchedule = (schedule: Schedule) => setSchedules((all) => ({ ...all, [schedule.scheduleId]: schedule }))
  // The demo works without Gemini: failures here only fill the AI card, never the main error banner.
  const ask = (set: (state: AiState) => void, call: () => Promise<string>) => {
    const mine = generation.current
    set({ status: 'loading' })
    call().then((text) => mine === generation.current && set({ status: 'done', text }))
      .catch((caught) => mine === generation.current && set({ status: 'error', error: caught instanceof Error ? caught.message : String(caught) }))
  }
  const analyze = useCallback(() => ask(setAnalysis, () => api.analyzeFailure().then((result) => result.analysis)), [])
  const explain = useCallback((scheduleId: string) => ask(setExplanation, () => api.explainSchedule(scheduleId).then((result) => result.explanation)), [])

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
      setExplanation(IDLE)
      analyze()
    })
    if (triggered) await optimize()
  }, [run, optimize, analyze])

  const apply = useCallback((scheduleId: string) => run('applying', async () => {
    setState(await api.applyRecovery(scheduleId))
    explain(scheduleId)
  }), [run, explain])

  const reset = useCallback(() => run('resetting', async () => {
    setState(await api.resetFailure())
    setSchedules((all) => ({ baseline: all.baseline }))
    setOptimizeResult(null)
    generation.current++
    setAnalysis(IDLE)
    setExplanation(IDLE)
  }), [run])

  return {
    scenario, state, schedules, optimizeResult, analysis, explanation, busy, error,
    baseline: schedules.baseline ?? null,
    activeSchedule: state ? schedules[state.activeScheduleId] ?? null : null,
    fail, optimize, apply, reset, analyze, explain,
  }
}

export type Factory = ReturnType<typeof useFactory>
