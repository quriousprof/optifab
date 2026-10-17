# Optifab — Project Context for Agents

## Vision

Build a **3D factory digital twin** that displays the manufacturing pipeline, simulates machine failures, and proposes a new production schedule. The 3D factory is the **primary product experience** — the quantum component supports a real operational decision inside that environment, not as a separate demo.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19, React Three Fiber, Drei, Three.js, Tailwind CSS 4, Vite 7, TypeScript 5.9 | `frontend/` directory, port 3000 |
| Backend | FastAPI (Python) | `backend/` directory, port 8000, not yet built |
| AI/Decision support | Google Gemini | Failure analysis, schedule explanation, decision support |
| Quantum optimization | QAOA | Experimental backend for a small, clearly defined scheduling problem |
| Infrastructure | Google Cloud, Docker Compose | `compose.yaml` defines service layout |

## Architecture

```
frontend/    React / Three.js 3D factory viewport (built, in progress)
backend/     FastAPI API + optimization integration (to be built)
docs/        Shared demo contract, schemas, and fixtures
compose.yaml Container layout (frontend:3000, backend:8000)
```

## The Six-Job Factory Scenario

The demo models a manufacturing floor with **9 machines** across **3 stages** (cutting -> forming -> inspection) processing **6 jobs**:

- **Cutting**: 4 machines (C1-C4) — all interchangeable, fixed processing time per job
- **Forming**: 3 machines (F1, F2, F3) — interchangeable but processing times vary by machine and job
- **Inspection**: 2 machines (I1, I2) — all interchangeable, fixed processing time per job

Machine layout uses `[x, z]` scene-unit coordinates from `docs/six-job-scenario.json`. Three columns (cutting at x=-6, forming at x=0, inspection at x=6) connected by conveyors.

### Processing Times (minutes)

| Job | Cutting (any C) | F1 | F2 | F3 | Inspection (any I) |
|-----|---:|---:|---:|---:|---:|
| J1 | 2 | 6 | 8 | 7 | 2 |
| J2 | 3 | 4 | 5 | 6 | 2 |
| J3 | 2 | 5 | 7 | 6 | 3 |
| J4 | 4 | 3 | 4 | 5 | 2 |
| J5 | 3 | 7 | 8 | 9 | 3 |
| J6 | 2 | 4 | 6 | 5 | 2 |

### Failure Scenario

1. All 6 jobs available at simulated time 0
2. **F1 fails at simulated time 6** and stays unavailable until reset
3. At time 6: J1-forming is running on F1 (interrupted, work lost, must restart on F2/F3), J5-forming was planned next on F1 (must reschedule)
4. Completed operations stay completed; running operations on unaffected machines finish as planned
5. Transport time is zero; conveyors show connectivity only
6. The failure occurs at a fixed simulated time, independent of real wall-clock time

### Phases

- **baseline** — pre-failure schedule running normally
- **failed** — F1 down, affected jobs blocked, awaiting recovery schedule
- **recovered** — optimizer has returned a new schedule, production resumes

## Data Contracts (in `docs/`)

- **`six-job-scenario.json`** — machine positions, job processing times, failure definition
- **`baseline-schedule.json`** — complete pre-failure schedule (18 operations: 6 jobs x 3 stages)
- **`failure-state.json`** — factory state snapshot at minute 6 post-failure
- **`factory-state.schema.json`** — JSON Schema for factory state (phase, machine states, blocked jobs)
- **`schedule.schema.json`** — JSON Schema for schedules (18 operation entries with jobId, operationId, stage, machineId, start, end)
- **`demo-contract.md`** — authoritative rules for scheduling, failure, and IDs
- **`phase-2-ui-decision.md`** — UI/interaction design decisions for the digital twin

### Schedule Entry Format

```json
{
  "jobId": "J1",
  "operationId": "J1-forming",
  "stage": "forming",
  "machineId": "F1",
  "start": 2,
  "end": 8
}
```

Operation IDs are stable: `J1-cutting`, `J1-forming`, `J1-inspection`, etc. `end` is exclusive. Recovery schedules reuse the same operation ID with a new machine/time.

## Frontend State (Current)

The frontend currently implements a **component editor** (drag-and-drop placement, conveyor connections, undo/delete). It needs to transition to the **digital twin** mode defined in `phase-2-ui-decision.md`:

- Fixed 9-machine layout from `six-job-scenario.json`
- Machine selection with side panel (ID, stage, state, current operation)
- Visual states: idle, processing, failed, blocked (color + label)
- Three viewport modes: overview, inspection (zoom to selected), failure impact
- Production schedule Gantt chart below viewport (one row per machine, minute axis)
- Failure trigger on F1, baseline/recovery schedule comparison

## Backend (To Be Built)

The backend will:
1. Serve factory state and schedule data via FastAPI REST endpoints
2. Integrate Gemini for failure analysis and schedule explanation
3. Run QAOA-based quantum optimization for recovery scheduling
4. Validate recovery schedules against the demo contract rules

## Quantum Component (QAOA)

QAOA is used as an **experimental optimization backend** for the recovery scheduling problem:
- Input: remaining unscheduled/interrupted operations after F1 failure
- Problem: assign operations to machines and time slots minimizing makespan
- Output: a valid recovery schedule conforming to `schedule.schema.json`
- This is a small, well-defined combinatorial optimization problem suitable for QAOA demonstration
- The quantum solver should be compared against a classical baseline for the demo

## Key Rules

- All times are integer simulated minutes; intervals are half-open `[start, end)`
- Each machine processes at most one operation at a time
- Job operations must run in order: cutting -> forming -> inspection
- No F1 assignment at or after time 6 in recovery schedules
- The UI renders returned schedule/state data — it does not maintain its own simulation clock
- Factory state comes from `factory-state.schema.json`; the UI adapts to whatever state it receives
