"""Load scenario fixtures from docs/ and compute problem decomposition at failure time."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from app.config import settings
from app.core.schemas import FactoryState, Schedule

STAGES = ("cutting", "forming", "inspection")
FAILURE_TIME = 6
FAILED_MACHINE = "F1"

CUTTING_MACHINES = ["C1", "C2", "C3", "C4"]
FORMING_MACHINES = ["F1", "F2", "F3"]
INSPECTION_MACHINES = ["I1", "I2"]

# Surviving forming machines after F1 failure
SURVIVING_FORMING = ["F2", "F3"]


def _docs() -> Path:
    return Path(settings.docs_path)


def load_scenario() -> dict:
    return json.loads((_docs() / "six-job-scenario.json").read_text())


def load_baseline() -> Schedule:
    data = json.loads((_docs() / "baseline-schedule.json").read_text())
    return Schedule(**data)


def load_failure_state() -> FactoryState:
    data = json.loads((_docs() / "failure-state.json").read_text())
    return FactoryState(**data)


def get_processing_time(scenario: dict, job_id: str, stage: str, machine_id: str) -> int:
    """Return the processing time for a job on a specific machine at a given stage."""
    job = next(j for j in scenario["jobs"] if j["jobId"] == job_id)
    if stage == "cutting":
        return job["cuttingMinutes"]
    elif stage == "forming":
        return job["formingMinutes"][machine_id]
    else:  # inspection
        return job["inspectionMinutes"]


@dataclass
class FixedOperation:
    """An operation whose schedule is locked (completed or running unaffected)."""
    job_id: str
    operation_id: str
    stage: str
    machine_id: str
    start: int
    end: int


@dataclass
class ReschedulableOperation:
    """An operation that needs (re)scheduling after the failure."""
    job_id: str
    operation_id: str
    stage: str
    eligible_machines: list[str]
    durations: dict[str, int]  # machine_id -> processing time
    earliest_start: int  # based on predecessor completion, not machine availability


def get_fixed_operations(scenario: dict, baseline: Schedule) -> list[FixedOperation]:
    """Return operations that are completed or running-unaffected at the failure time."""
    fixed: list[FixedOperation] = []
    for op in baseline.operations:
        # Completed before failure
        if op.end <= FAILURE_TIME:
            fixed.append(FixedOperation(
                job_id=op.jobId, operation_id=op.operationId,
                stage=op.stage, machine_id=op.machineId,
                start=op.start, end=op.end,
            ))
        # Running on an unaffected machine at failure time
        elif op.start < FAILURE_TIME and op.machineId != FAILED_MACHINE:
            fixed.append(FixedOperation(
                job_id=op.jobId, operation_id=op.operationId,
                stage=op.stage, machine_id=op.machineId,
                start=op.start, end=op.end,
            ))
    return fixed


def get_operations_to_reschedule(
    scenario: dict, baseline: Schedule, fixed: list[FixedOperation],
) -> list[ReschedulableOperation]:
    """Return operations needing (re)scheduling after the failure."""
    fixed_ids = {f.operation_id for f in fixed}
    ops: list[ReschedulableOperation] = []

    for op in baseline.operations:
        if op.operationId in fixed_ids:
            continue

        if op.stage == "forming":
            eligible = SURVIVING_FORMING
            durations = {
                m: get_processing_time(scenario, op.jobId, "forming", m)
                for m in eligible
            }
            # Earliest start: predecessor (cutting) must be done
            cutting = next(f for f in fixed if f.job_id == op.jobId and f.stage == "cutting")
            earliest = max(cutting.end, FAILURE_TIME)
        elif op.stage == "inspection":
            eligible = INSPECTION_MACHINES
            durations = {
                m: get_processing_time(scenario, op.jobId, "inspection", m)
                for m in eligible
            }
            # Earliest start depends on whether forming is fixed or also reschedulable
            forming_fixed = next(
                (f for f in fixed if f.job_id == op.jobId and f.stage == "forming"), None
            )
            if forming_fixed:
                earliest = forming_fixed.end
            else:
                # Forming is also reschedulable — earliest will be computed during decoding
                earliest = FAILURE_TIME
        else:
            # Cutting — all cutting is completed before t=6, shouldn't reach here
            continue

        ops.append(ReschedulableOperation(
            job_id=op.jobId,
            operation_id=op.operationId,
            stage=op.stage,
            eligible_machines=eligible,
            durations=durations,
            earliest_start=earliest,
        ))

    return ops
