# Backend API Flow — Frontend Integration Guide

This document explains the demo lifecycle through the backend API, what each response means for the UI, and where each endpoint maps to frontend components.

---

## Demo Lifecycle

The demo has three phases. The frontend drives the transitions by calling the API in order:

```
BASELINE  ──trigger──>  FAILED  ──optimize + apply──>  RECOVERED  ──reset──>  BASELINE
```

---

## Phase 1: App Load (Baseline)

The frontend makes three calls on startup to build the initial scene.

### `GET /api/scenario`

Returns the factory definition — machine positions, job processing times, failure parameters.

| Response field | Frontend use |
|---|---|
| `machines[].position` (`[x, z]`) | Place 9 machine meshes in the 3D scene. Three columns: cutting at x=-6, forming at x=0, inspection at x=6 |
| `machines[].stage` | Determines machine shape/color and which column it belongs to |
| `machines[].machineId` | Label displayed on each machine mesh (C1–C4, F1–F3, I1–I2) |
| `jobs[].formingMinutes` | Per-machine processing times, shown in the inspector panel when a machine is selected |
| `failure.machineId` and `failure.at` | The frontend knows F1 is the failure target and time 6 is the trigger point |

Called once, cached for the session.

### `GET /api/state`

Returns the current factory snapshot.

| Response field | Frontend use |
|---|---|
| `phase` | Controls which UI mode is active: baseline (normal), failed (alert), recovered (resolved) |
| `simulationTime` | Position of the Gantt chart playhead (0 at baseline, 6 at failure) |
| `machineStates` | Each machine's visual state — `"idle"`, `"processing"`, `"failed"`, or `"blocked"` — plus `currentOperationId` if active |
| `failedMachineIds` | Machines to render with failure visuals (red, alarm icon) |
| `blockedJobIds` | Jobs to highlight as blocked in the sidebar and Gantt chart |
| `activeScheduleId` | Which schedule to fetch for the Gantt chart |

This is the primary state object. Every phase transition returns an updated FactoryState, so the frontend can re-render from a single consistent object.

### `GET /api/schedule/baseline`

Returns the pre-failure schedule — 18 operations across 9 machines.

| Response field | Frontend use |
|---|---|
| `operations[].machineId` | Gantt chart row — one row per machine |
| `operations[].start` / `end` | Gantt bar position and width on the minute axis |
| `operations[].jobId` | Bar color — each job (J1–J6) gets a distinct color |
| `operations[].operationId` | Bar label (e.g. "J1-forming") |
| `operations[].stage` | Can be used for bar styling or grouping |

Renders the production schedule Gantt below the 3D viewport. Clicking a bar should select/focus that machine in the scene.

---

## Phase 2: Failure

The user triggers the failure, then the system optimizes a recovery.

### `POST /api/failure/trigger`

No request body. Transitions factory from baseline to failed.

**What changes in the response (FactoryState):**

| Field | Value | What the frontend does |
|---|---|---|
| `phase` | `"failed"` | Switch to failure UI mode |
| `simulationTime` | `6` | Move Gantt playhead to minute 6, draw a vertical red failure line |
| `failedMachineIds` | `["F1"]` | Render F1 with failure visuals (red color, alarm icon/label) |
| `blockedJobIds` | `["J1", "J5"]` | Highlight J1 and J5 bars on the Gantt, show blocked badge in sidebar |
| `machineStates.F1.status` | `"failed"` | Red mesh, "FAILED" label |
| `machineStates.F2.status` | `"processing"` | Active animation, shows `currentOperationId: "J3-forming"` |
| `machineStates.F3.status` | `"processing"` | Active animation, shows `currentOperationId: "J2-forming"` |
| `machineStates.I1.status` | `"blocked"` | Amber/warning visual — healthy but waiting on a blocked job |

The baseline Gantt stays visible for comparison. Operations that can no longer proceed (J1-forming on F1 at [2,8) and J5-forming on F1 at [8,15)) should be visually marked as cancelled/disrupted. Do not show any recovery bars yet.

**Request body (optional):** `{ "machineId": "F1" | "F2" | "F3" }`, default F1. Other machines are rejected with 400.

**Where to place the trigger:** A "Simulate failure" button in the inspector of any forming machine (F1–F3), visible only during baseline phase.

### `POST /api/ai/analyze-failure` (optional, requires Gemini key)

No request body. Must be called after failure trigger (returns 400 if phase is not "failed").

**Response:** `{ "analysis": "..." }` — a natural-language explanation of what broke, which jobs are affected, cascading impact, and available capacity.

**Where to display:** An "AI failure analysis" card in the recovery panel (`TwinPanel.tsx`). It shows loading, the text, or the backend's reason when unavailable (503 no key, 502 Gemini error), with Retry/Regenerate. The demo works without a key.

### `POST /api/optimize`

No required body (defaults to `{ "method": "both" }` which runs QAOA and classical).

**Response (HTTP 202):** `{ "jobId": "uuid", "status": "pending" }`

The optimization runs in the background (QAOA takes ~10–15 seconds). The frontend must poll for results.

**When to call:** Automatically after the failure trigger, or via an "Optimize Recovery" button.

### `GET /api/optimize/{jobId}`

Poll this endpoint every ~1 second while `status` is `"pending"` or `"running"`.

**When `status: "completed"`, the response contains:**

| Field | Frontend use |
|---|---|
| `qaoa_schedule` | Full 18-operation recovery schedule from the quantum solver. Render as an overlay on the Gantt (changed operations get a distinct visual — hatched, highlighted, or alternate shade) |
| `classical_schedule` | Full 18-operation recovery schedule from the optimal classical solver. Can be toggled as an alternative view |
| `qaoa_makespan` | Total production time with QAOA recovery (e.g. 29 minutes) |
| `classical_makespan` | Total production time with classical recovery (e.g. 24 minutes — provably optimal) |
| `qaoa_metadata.num_qubits` | Display "10 qubits" in a quantum info badge |
| `qaoa_metadata.circuit_depth` | Display "2-layer QAOA" |
| `qaoa_metadata.circuit_moments` | Circuit size for the info panel |
| `qaoa_metadata.optimizer_iterations` | How many COBYLA evaluations were run |
| `qaoa_metadata.assignments` | Map of operation → machine chosen by QAOA (e.g. `"J1-forming": "F3"`) — can be displayed in a summary table |

Both schedules include all 18 operations (unchanged ones are identical to baseline). The frontend can diff against baseline to identify which operations moved.

**Where to display:** A results panel/modal after optimization completes, showing both schedules side-by-side with makespan comparison. Let the user choose which schedule to apply.

**When `status: "failed"`:** The `error` field contains the error message. Show a "Retry" option.

---

## Phase 3: Recovery

### `POST /api/recovery/apply`

**Request body:** `{ "scheduleId": "classical-exhaustive" }` or the QAOA schedule's ID (from `qaoa_schedule.scheduleId` in the optimization result).

**What changes in the response (FactoryState):**

| Field | Value | What the frontend does |
|---|---|---|
| `phase` | `"recovered"` | Switch to recovered UI mode — success state |
| `activeScheduleId` | The applied schedule ID | Fetch this schedule for the Gantt if not already cached |
| `blockedJobIds` | `[]` | Clear all blocked highlights |
| `machineStates.F1.status` | `"failed"` | F1 stays failed (it doesn't come back) |
| `machineStates.F2.status` | `"processing"` | Still running J3-forming at time 6 |
| `machineStates.F3.status` | `"processing"` | Still running J2-forming at time 6 |
| `machineStates.I1.status` | `"idle"` | No longer blocked — recovery plan exists |

The Gantt now shows the recovery schedule as the active plan. The baseline can remain as a ghost/background layer for comparison. Operations that changed from baseline should be visually distinct.

**Where to place:** An "Apply" button next to each schedule option (QAOA / Classical) in the results panel.

### `POST /api/ai/explain-schedule` (optional, requires Gemini key)

**Request body:** `{ "scheduleId": "qaoa-8bc5d3c7" }` (the schedule to explain).

**Response:** `{ "explanation": "..." }` — natural-language comparison of the recovery vs baseline, tradeoffs, efficiency assessment.

**Where to display:** An "AI schedule explanation" card in the recovery panel, requested automatically when a recovery is applied, with the same loading/error/Regenerate handling.

---

## Reset

### `POST /api/failure/reset`

No request body. Returns FactoryState at time 0, baseline phase, all machines idle, no failures, no blocked jobs.

Clears all recovery state. The Gantt returns to baseline-only view. All machine visuals reset to idle.

**Where to place:** A "Reset Demo" button, always visible in the header or footer.

---

## Frontend Component Map

| API endpoint | Primary frontend component | Trigger |
|---|---|---|
| `GET /api/scenario` | `FactoryViewport` — builds 3D scene layout | App mount |
| `GET /api/state` | `FactoryViewport` + inspector panel — machine visuals and status | App mount, after every phase transition |
| `GET /api/schedule/{id}` | `ScheduleChart` (Gantt) — operation bars | App mount, after recovery applied |
| `POST /api/failure/trigger` | Inspector panel — "Trigger Failure" button on F1 | User click |
| `POST /api/optimize` | Automatic after failure, or "Optimize" button | After failure trigger |
| `GET /api/optimize/{jobId}` | Loading spinner → results panel | Polling (1s interval) |
| `POST /api/recovery/apply` | Results panel — "Apply" button per schedule | User click |
| `POST /api/failure/reset` | Header/footer — "Reset Demo" button | User click |
| `POST /api/ai/analyze-failure` | Inspector panel or AI card | After failure trigger |
| `POST /api/ai/explain-schedule` | Results panel — explanation section | After optimization completes |

---

## Data Relationships

- `FactoryState.activeScheduleId` → use with `GET /api/schedule/{id}` to fetch the current Gantt data
- `OptimizeResult.qaoa_schedule.scheduleId` / `OptimizeResult.classical_schedule.scheduleId` → pass to `POST /api/recovery/apply`
- `ScheduledOperation.machineId` → matches keys in `FactoryState.machineStates` and `scenario.machines[].machineId`
- `ScheduledOperation.jobId` → matches `FactoryState.blockedJobIds` and `scenario.jobs[].jobId`
- `ScheduledOperation.operationId` → matches `MachineState.currentOperationId` when a machine is processing
