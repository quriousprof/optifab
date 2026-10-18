# Optifab Backend API Reference

**Base URL:** `http://localhost:8000`

All endpoints under `/api` return JSON. The backend uses CORS to allow requests from `http://localhost:3000`.

---

## Frontend Integration Flow

The frontend follows this sequence to drive the demo:

1. **App load** → `GET /api/state` + `GET /api/scenario` + `GET /api/schedule/baseline`
2. **User triggers failure on F1** → `POST /api/failure/trigger`
3. **Show AI analysis** (optional) → `POST /api/ai/analyze-failure`
4. **Start optimization** → `POST /api/optimize`
5. **Poll until complete** → `GET /api/optimize/{jobId}` (repeat while `status` is `"pending"` or `"running"`)
6. **Display results** — the completed result contains both QAOA and classical schedules with makespans
7. **User picks a recovery schedule** → `POST /api/recovery/apply`
8. **Show AI explanation** (optional) → `POST /api/ai/explain-schedule`
9. **Reset** → `POST /api/failure/reset` (returns to baseline)

---

## Health Check

### `GET /`

Returns backend status.

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| status | `"ok"` | Always `"ok"` if the server is running |
| version | string | Backend version |

---

## Factory State

### `GET /api/state`

Returns the current factory state snapshot. This is the primary state object the frontend renders from.

**Response — FactoryState:**

| Field | Type | Description |
|-------|------|-------------|
| schemaVersion | `"1.0"` | Always `"1.0"` |
| scenarioId | `"six-job-demo"` | Always `"six-job-demo"` |
| simulationTime | integer | Current simulated minute (0 at baseline, 6 at failure) |
| phase | `"baseline"` \| `"failed"` \| `"recovered"` | Current demo phase |
| activeScheduleId | string | ID of the schedule currently in effect (e.g. `"baseline"`, or a recovery schedule ID) |
| failedMachineIds | string[] | Machine IDs that have failed (empty in baseline, `["F1"]` after failure) |
| blockedJobIds | string[] | Job IDs blocked by the failure (e.g. `["J1", "J5"]`) |
| machineStates | object | Map of machine ID → MachineState for all 9 machines |

**MachineState:**

| Field | Type | Description |
|-------|------|-------------|
| status | `"idle"` \| `"processing"` \| `"failed"` \| `"blocked"` | Current display state for the machine |
| currentOperationId | string \| null | The operation ID running on this machine (e.g. `"J3-forming"`), or null if idle/failed/blocked |

**Machine IDs (always present in machineStates):** `C1`, `C2`, `C3`, `C4`, `F1`, `F2`, `F3`, `I1`, `I2`

---

### `GET /api/scenario`

Returns the full scenario definition: machine positions, job processing times, and failure parameters. Used to build the 3D scene layout and processing time lookups.

**Response — Scenario:**

| Field | Type | Description |
|-------|------|-------------|
| schemaVersion | `"1.0"` | Always `"1.0"` |
| scenarioId | `"six-job-demo"` | Always `"six-job-demo"` |
| timeUnit | `"minute"` | Time unit for all processing times |
| failure | object | `{ "machineId": "F1", "at": 6 }` |
| layout | object | Coordinate system info and floor dimensions |
| stages | string[] | `["cutting", "forming", "inspection"]` |
| machines | Machine[] | Array of 9 machine definitions |
| jobs | Job[] | Array of 6 job definitions |

**Machine (within machines array):**

| Field | Type | Description |
|-------|------|-------------|
| machineId | string | e.g. `"C1"`, `"F2"`, `"I1"` |
| stage | `"cutting"` \| `"forming"` \| `"inspection"` | Which production stage this machine belongs to |
| position | [number, number] | `[x, z]` coordinates in scene units for 3D placement |

**Job (within jobs array):**

| Field | Type | Description |
|-------|------|-------------|
| jobId | string | `"J1"` through `"J6"` |
| release | 0 | All jobs available at time 0 |
| cuttingMinutes | integer | Processing time on any cutting machine |
| formingMinutes | object | `{ "F1": int, "F2": int, "F3": int }` — processing time varies by forming machine |
| inspectionMinutes | integer | Processing time on any inspection machine |

---

### `GET /api/schedule/{scheduleId}`

Returns a schedule by its ID. The frontend uses this to render the Gantt chart.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| scheduleId | `"baseline"` for the pre-failure schedule, or a recovery schedule ID returned by the optimizer |

**Response — Schedule:**

| Field | Type | Description |
|-------|------|-------------|
| schemaVersion | `"1.0"` | Always `"1.0"` |
| scenarioId | `"six-job-demo"` | Always `"six-job-demo"` |
| scheduleId | string | The schedule's identifier |
| timeUnit | `"minute"` | Always `"minute"` |
| operations | ScheduledOperation[] | Exactly 18 operations (6 jobs × 3 stages) |

**ScheduledOperation:**

| Field | Type | Description |
|-------|------|-------------|
| jobId | string | `"J1"` through `"J6"` |
| operationId | string | Stable ID: `"{jobId}-{stage}"` (e.g. `"J1-forming"`) |
| stage | `"cutting"` \| `"forming"` \| `"inspection"` | Production stage |
| machineId | string | The assigned machine (e.g. `"C1"`, `"F2"`, `"I1"`) |
| start | integer | Start time in simulated minutes (inclusive) |
| end | integer | End time in simulated minutes (exclusive). Duration = end - start |

**404** if the schedule ID is not found.

**Notes for Gantt rendering:**
- Each operation becomes a bar on the row for its `machineId`, spanning `[start, end)`.
- A job's current machine at any time `t` is the machine of its operation where `start <= t < end`.
- Between operations, the job is waiting (no bar visible).
- In a recovery schedule, interrupted operations get a new machine and full new time range under the same `operationId`.

---

## Failure Control

### `POST /api/failure/trigger`

Triggers a forming-machine failure at simulated time 6. Transitions the factory from `"baseline"` to `"failed"` phase.

**Request body (optional):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| machineId | `"F1"` \| `"F2"` \| `"F3"` | `"F1"` | Forming machine to fail. Only forming machines can fail (two forming survivors keep the QAOA problem at 10 qubits). |

**400** if `machineId` is not a forming machine, or a failure is already active (reset first).

**Response:** FactoryState (same shape as `GET /api/state`), computed from the baseline schedule. For the default F1 failure:
- `phase`: `"failed"`
- `simulationTime`: `6`
- `failedMachineIds`: `["F1"]`
- `blockedJobIds`: `["J1", "J5"]`
- `machineStates.F1.status`: `"failed"`
- `machineStates.F2.status`: `"processing"` (J3-forming still running)
- `machineStates.F3.status`: `"processing"` (J2-forming still running)
- `machineStates.I1.status`: `"blocked"` (downstream of failed job)

Failing `F2` blocks `["J3", "J4"]`; failing `F3` blocks `["J2", "J6"]`.

After triggering, the baseline schedule remains visible for comparison. The minute-6 failure line and affected operations should be visually marked on the Gantt chart. Do not show a recovery schedule until the optimizer returns one.

---

### `POST /api/failure/reset`

Resets the factory back to the initial baseline state at time 0. Clears the failure and all recovery schedules.

**Request body:** none

**Response:** FactoryState with `phase: "baseline"`, `simulationTime: 0`, empty `failedMachineIds` and `blockedJobIds`, all machines idle.

---

## Optimization

### `POST /api/optimize`

Starts the optimization process for the active failure (**400** if the factory is not in the `"failed"` phase). Runs both the QAOA quantum solver and a classical exhaustive solver in the background. Returns immediately with a job ID for polling.

**Request body (optional):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| method | `"qaoa"` \| `"classical"` \| `"both"` | `"both"` | Which solver(s) to run |

**Response (HTTP 202 Accepted):**

| Field | Type | Description |
|-------|------|-------------|
| jobId | string | UUID to poll for results |
| status | `"pending"` | Initial status |

---

### `GET /api/optimize/{jobId}`

Poll for optimization results. Keep polling while `status` is `"pending"` or `"running"` (recommended interval: 1 second).

**Response — OptimizeResult:**

| Field | Type | Present When | Description |
|-------|------|-------------|-------------|
| jobId | string | always | The job UUID |
| status | `"pending"` \| `"running"` \| `"completed"` \| `"failed"` | always | Current status |
| qaoa_schedule | Schedule \| null | completed | Full 18-operation recovery schedule from QAOA |
| classical_schedule | Schedule \| null | completed | Full 18-operation recovery schedule from exhaustive classical search |
| qaoa_makespan | integer \| null | completed | Total time (max operation end) of the QAOA schedule |
| classical_makespan | integer \| null | completed | Total time of the classical schedule (provably optimal) |
| qaoa_metadata | object \| null | completed | Quantum solver details (see below) |
| error | string \| null | failed | Error message if optimization failed |

**qaoa_metadata (when present):**

| Field | Type | Description |
|-------|------|-------------|
| num_qubits | integer | Number of qubits used (10 for this problem) |
| circuit_depth | integer | Number of QAOA layers (p) |
| circuit_moments | integer | Total moments in the Cirq circuit |
| optimizer_iterations | integer | Number of COBYLA evaluations performed |
| optimal_gammas | number[] | Optimized cost-layer angles |
| optimal_betas | number[] | Optimized mixer-layer angles |
| qubo_cost | number | QUBO objective value of the best solution |
| assignments | object | Map of operation ID → assigned machine ID for the rescheduled operations |

**Notes for the frontend:**
- Both `qaoa_schedule` and `classical_schedule` contain complete 18-operation schedules (including unchanged operations from the baseline). They can be rendered directly on the Gantt chart.
- Each schedule has a unique `scheduleId` that can be passed to `POST /api/recovery/apply`.
- The classical schedule is the provably optimal result. Comparing `qaoa_makespan` vs `classical_makespan` shows how close QAOA got to optimal.
- `qaoa_metadata.assignments` shows which machines the quantum solver chose for the 10 rescheduled operations.

**404** if the job ID is not found.

---

## Recovery

### `POST /api/recovery/apply`

Applies a recovery schedule and transitions the factory to the `"recovered"` phase.

**Request body:**

| Field | Type | Description |
|-------|------|-------------|
| scheduleId | string | The `scheduleId` from either `qaoa_schedule` or `classical_schedule` in the optimization result |

**Response:** FactoryState with `phase: "recovered"` and `activeScheduleId` set to the applied schedule. Machine states are updated to reflect the recovery schedule at time 6.

**404** if the schedule ID is not found.

---

## Gemini AI

These endpoints require the `OPTIFAB_GEMINI_API_KEY` environment variable. They return **503** if the key is not configured.

### `POST /api/ai/analyze-failure`

Asks Gemini to explain the failure impact in operator-friendly language.

**Request body:** none (uses current factory state internally)

**Precondition:** factory must be in `"failed"` phase (call `POST /api/failure/trigger` first). Returns **400** otherwise.

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| analysis | string | Gemini's natural-language analysis of the failure: what broke, cascading impact, available capacity, rescheduling priorities |

---

### `POST /api/ai/explain-schedule`

Asks Gemini to compare a recovery schedule against the baseline and explain tradeoffs.

**Request body:**

| Field | Type | Description |
|-------|------|-------------|
| scheduleId | string | The recovery schedule ID to explain |

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| explanation | string | Gemini's natural-language explanation: what changed, efficiency assessment, tradeoffs |

**404** if the schedule ID is not found.

---

## Error Responses

All error responses follow this shape:

| Field | Type | Description |
|-------|------|-------------|
| detail | string | Human-readable error message |

HTTP status codes used:
- **400** — bad request (e.g. triggering AI analysis or optimization before a failure, failing a non-forming machine)
- **404** — resource not found (schedule ID, job ID)
- **502** — Gemini request failed (network, bad key, quota); `detail` carries the reason
- **503** — service unavailable (Gemini API key not configured)

---

## Data Relationships

- **FactoryState.activeScheduleId** → can be used with `GET /api/schedule/{id}` to fetch the current schedule
- **OptimizeResult.qaoa_schedule.scheduleId** / **OptimizeResult.classical_schedule.scheduleId** → passed to `POST /api/recovery/apply` to pick which schedule to use
- **ScheduledOperation.machineId** → corresponds to keys in **FactoryState.machineStates** and entries in the scenario's `machines` array
- **ScheduledOperation.jobId** → corresponds to entries in the scenario's `jobs` array and **FactoryState.blockedJobIds**
