# Six-job factory demo contract (v1.0)

This document fixes the shared input and output for the UI and optimizer. The machine-readable fixtures are [`six-job-scenario.json`](six-job-scenario.json), [`baseline-schedule.json`](baseline-schedule.json), and [`schedule.schema.json`](schedule.schema.json). All times are integer simulated minutes; intervals are half-open: `[start, end)`.

## Factory and IDs

There are three stages in order: cutting, forming, inspection. Each job visits **one** eligible machine at each stage. The layout has four cutting machines (`C1`–`C4`), three forming machines (`F1`, `F2`, `F3`), and two inspection machines (`I1`, `I2`). `F1` is the canonical ID of the machine selected for the demo failure; the UI must display that exact ID. The stage counts are **4:3:2**, nine machines total.

Place the stages in three columns from input to output, using the scene positions in the scenario fixture. The `[x, z]` coordinates are visual scene units, not measured metres. Conveyors connect the stage columns; they indicate possible movement, not individual scheduled transfers. All machines in a stage are functionally interchangeable for that stage, although forming times vary by machine and job.

| Job | Cutting (any C) | Forming F1 | Forming F2 | Forming F3 | Inspection (any I) |
| --- | ---: | ---: | ---: | ---: | ---: |
| J1 | 2 | 6 | 8 | 7 | 2 |
| J2 | 3 | 4 | 5 | 6 | 2 |
| J3 | 2 | 5 | 7 | 6 | 3 |
| J4 | 4 | 3 | 4 | 5 | 2 |
| J5 | 3 | 7 | 8 | 9 | 3 |
| J6 | 2 | 4 | 6 | 5 | 2 |

Every number is the processing time in simulated minutes for one operation on that machine. For example, `J1` cutting takes two minutes on any cutting machine. The six jobs are the entire v1 scenario; no new jobs arrive during the demo.

## Scheduling and failure rules

1. All six jobs are available at simulated time `0`.
2. Each machine processes at most one operation at a time.
3. Each job's operations must run in order: cutting, then forming, then inspection. An operation starts no earlier than its predecessor ends.
4. `F1` fails at simulated time `6` and remains unavailable until the demo is reset. An operation on `F1` may not run at or after time `6` in a recovery schedule.
5. Completed operations stay completed at their original machine and time.
6. An operation running on `F1` at time `6` is interrupted. Its work before the failure is lost; the **whole operation restarts** on an eligible surviving machine no earlier than time `6`. Its cutting predecessor stays completed.
7. Operations already running on unaffected machines finish as originally planned. They keep their machine, start, and end times in the recovery schedule.
8. Transport time is zero in the scheduling model. Conveyors show connectivity only.
9. The failure event occurs at a fixed **simulated** time, regardless of real time spent viewing the scene. Reset restores the baseline and clears the failure.

The baseline schedule in this directory is a complete, feasible pre-failure plan. At time `6`, `J1-forming` is running on `F1` and is interrupted. `J5-forming` is planned next on `F1` and cannot start there. These are the directly affected operations. Other waiting operations may be delayed indirectly when recovery uses their machines.

## Schedule JSON contract

`schedule.schema.json` is the structural contract for both baseline and recovered schedules. Each schedule contains **exactly one entry per job operation**: 18 entries for six jobs with three operations each. Entry IDs are stable: `J1-cutting`, `J1-forming`, `J1-inspection`, and likewise for `J2`–`J6`. An entry records `jobId`, `operationId`, `stage`, `machineId`, `start`, and `end`. `end` is exclusive; processing duration is `end - start`. A recovery schedule gives an interrupted operation a new machine and full new duration under the **same operation ID**. It does not add a second entry for the discarded partial run.

Example:

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

The schema checks shape, IDs, and nonnegative integer times. The API/optimizer must also validate the semantic rules that JSON Schema cannot express: one entry per operation, matching job/stage/operation IDs, `start < end`, exact duration for the assigned machine, precedence, no machine overlap, preserved completed and unaffected running operations, and no `F1` assignment intersecting `[6, infinity)` after failure. Only a validated recovery schedule should be sent to the digital twin.

The UI reads machine IDs and operation times from the returned schedule. A job's current machine at time `t` is the machine of its entry where `start <= t < end`; between operations it is waiting. The scene should not invent separate job routes or timing.

## Factory state and scene boundary

`factory-state.schema.json` defines the current simulation snapshot; `failure-state.json` is the fixed post-failure fixture at minute `6`. `phase` is `baseline`, `failed`, or `recovered`. In the failed phase, `activeScheduleId: "baseline"` identifies the plan used for comparison, but playback stops at the failure until a validated recovery schedule is applied. `machineStates` provides the display state and current operation for each machine. `blockedJobIds` identifies jobs directly affected by the failed machine. Scene placement and the Phase 2 interaction are fixed in `phase-2-ui-decision.md`.

## Ownership boundary

The UI owner maintains the factory scene, selection, machine state display, and schedule rendering against this contract. The optimizer owner consumes the scenario fixture and returns schedules conforming to the schema and scheduling rules. Changes to IDs, processing times, or failure semantics require updating the fixture, schema or document as needed, and the baseline schedule together.
