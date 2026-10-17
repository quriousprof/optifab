# Docs — Agent Context

## Overview

Shared data contracts, schemas, and fixtures that define the demo scenario. These files are the **single source of truth** for both frontend and backend — neither side invents its own IDs, times, or rules.

See `../agents.md` for full project context.

## File Reference

| File | Format | Purpose |
|------|--------|---------|
| `demo-contract.md` | Markdown | **Authoritative rules** — scheduling constraints, failure semantics, ID conventions, ownership boundary |
| `phase-2-ui-decision.md` | Markdown | UI/interaction design decisions for the 3D digital twin (viewport modes, selection, Gantt chart, state rendering) |
| `six-job-scenario.json` | JSON | Machine positions (`[x,z]` scene units), job processing times (per machine for forming), failure definition (F1 at t=6) |
| `baseline-schedule.json` | JSON | Complete pre-failure schedule — 18 operations (6 jobs x 3 stages) with machine/start/end |
| `failure-state.json` | JSON | Factory state snapshot at minute 6: F1 failed, F2 processing J3-forming, F3 processing J2-forming, I1 blocked, J1/J5 blocked |
| `factory-state.schema.json` | JSON Schema | Validates factory state objects: schemaVersion, phase (baseline/failed/recovered), machineStates (9 machines), blockedJobIds |
| `schedule.schema.json` | JSON Schema | Validates schedule objects: 18 operations, each with jobId, operationId, stage, machineId, start, end. Enforces stage-to-machine mapping. |

## Key Facts

- All times are **integer simulated minutes**, intervals are half-open `[start, end)`
- Machine IDs: C1-C4 (cutting), F1-F3 (forming), I1-I2 (inspection) — **9 total**
- Job IDs: J1-J6 — **6 total**
- Operation IDs: `J{n}-{stage}` (e.g., `J1-forming`) — **18 total**
- F1 fails at time 6; jobs J1 and J5 are directly affected
- Layout: cutting at x=-6, forming at x=0, inspection at x=6 (three columns)
- Positions are scene units, not physical measurements

## Changing Contracts

Changes to IDs, processing times, or failure semantics require updating the fixture, schema, and demo-contract.md together. The baseline schedule must also be regenerated.
