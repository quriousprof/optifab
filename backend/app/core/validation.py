"""Validate recovery schedules against the demo contract rules."""

from __future__ import annotations

from app.core.schemas import Schedule, ScheduledOperation
from app.core.scenario import (
    CUTTING_MACHINES, FAILURE_TIME, FAILED_MACHINE,
    FORMING_MACHINES, INSPECTION_MACHINES, FixedOperation,
)


STAGE_MACHINES = {
    "cutting": CUTTING_MACHINES,
    "forming": FORMING_MACHINES,
    "inspection": INSPECTION_MACHINES,
}

EXPECTED_OPS = {
    f"J{j}-{stage}"
    for j in range(1, 7)
    for stage in ("cutting", "forming", "inspection")
}


def validate_schedule(
    schedule: Schedule,
    scenario: dict,
    fixed_ops: list[FixedOperation],
    get_duration: callable,
) -> list[str]:
    """Return a list of violation messages. Empty list means the schedule is valid."""
    errors: list[str] = []
    ops = schedule.operations

    # 1. Exactly 18 operations with correct IDs
    op_ids = {op.operationId for op in ops}
    if len(ops) != 18:
        errors.append(f"Expected 18 operations, got {len(ops)}")
    missing = EXPECTED_OPS - op_ids
    if missing:
        errors.append(f"Missing operations: {sorted(missing)}")
    extra = op_ids - EXPECTED_OPS
    if extra:
        errors.append(f"Unexpected operations: {sorted(extra)}")

    op_map: dict[str, ScheduledOperation] = {op.operationId: op for op in ops}

    for op in ops:
        # 2. start < end and correct duration
        if op.start >= op.end:
            errors.append(f"{op.operationId}: start ({op.start}) >= end ({op.end})")
            continue

        expected_dur = get_duration(op.jobId, op.stage, op.machineId)
        actual_dur = op.end - op.start
        if actual_dur != expected_dur:
            errors.append(
                f"{op.operationId}: duration {actual_dur} != expected {expected_dur} "
                f"on {op.machineId}"
            )

        # 3. Stage-to-machine mapping
        allowed = STAGE_MACHINES.get(op.stage, [])
        if op.machineId not in allowed:
            errors.append(
                f"{op.operationId}: machine {op.machineId} not allowed for stage {op.stage}"
            )

    # 4. Precedence per job
    for j in range(1, 7):
        job = f"J{j}"
        cutting_id = f"{job}-cutting"
        forming_id = f"{job}-forming"
        inspection_id = f"{job}-inspection"

        if cutting_id in op_map and forming_id in op_map:
            if op_map[cutting_id].end > op_map[forming_id].start:
                errors.append(
                    f"{job}: cutting ends at {op_map[cutting_id].end} "
                    f"but forming starts at {op_map[forming_id].start}"
                )
        if forming_id in op_map and inspection_id in op_map:
            if op_map[forming_id].end > op_map[inspection_id].start:
                errors.append(
                    f"{job}: forming ends at {op_map[forming_id].end} "
                    f"but inspection starts at {op_map[inspection_id].start}"
                )

    # 5. No machine overlap
    by_machine: dict[str, list[ScheduledOperation]] = {}
    for op in ops:
        by_machine.setdefault(op.machineId, []).append(op)

    for machine_id, machine_ops in by_machine.items():
        sorted_ops = sorted(machine_ops, key=lambda o: o.start)
        for i in range(len(sorted_ops) - 1):
            a, b = sorted_ops[i], sorted_ops[i + 1]
            if a.end > b.start:
                errors.append(
                    f"{machine_id}: overlap between {a.operationId} [{a.start},{a.end}) "
                    f"and {b.operationId} [{b.start},{b.end})"
                )

    # 6. Fixed operations preserved
    fixed_map = {f.operation_id: f for f in fixed_ops}
    for op in ops:
        if op.operationId in fixed_map:
            f = fixed_map[op.operationId]
            if (op.machineId != f.machine_id or op.start != f.start or op.end != f.end):
                errors.append(
                    f"{op.operationId}: fixed op changed from "
                    f"{f.machine_id}[{f.start},{f.end}) to "
                    f"{op.machineId}[{op.start},{op.end})"
                )

    # 7. No F1 assignment at or after failure time
    for op in ops:
        if op.machineId == FAILED_MACHINE and op.end > FAILURE_TIME:
            errors.append(
                f"{op.operationId}: assigned to {FAILED_MACHINE} "
                f"[{op.start},{op.end}) which extends past failure time {FAILURE_TIME}"
            )

    return errors
