"""Decode machine assignments into a full 18-operation schedule via greedy sequencing."""

from __future__ import annotations

from app.core.schemas import Schedule, ScheduledOperation
from app.core.scenario import (
    FAILURE_TIME, FixedOperation, ReschedulableOperation,
    get_processing_time,
)


def build_schedule(
    assignments: dict[str, str],  # operation_id -> machine_id
    fixed_ops: list[FixedOperation],
    reschedulable_ops: list[ReschedulableOperation],
    scenario: dict,
    schedule_id: str = "recovery",
) -> Schedule:
    """Build a complete 18-op schedule from machine assignments + greedy sequencing.

    Args:
        assignments: Maps each reschedulable operation_id to its assigned machine_id.
        fixed_ops: Operations locked from the baseline.
        reschedulable_ops: Operations that were optimized.
        scenario: The full scenario dict for processing time lookups.
        schedule_id: ID for the resulting schedule.
    """
    result_ops: list[ScheduledOperation] = []

    # 1. Add all fixed operations as-is
    for f in fixed_ops:
        result_ops.append(ScheduledOperation(
            jobId=f.job_id, operationId=f.operation_id,
            stage=f.stage, machineId=f.machine_id,
            start=f.start, end=f.end,
        ))

    # 2. Track machine availability (earliest time each machine is free)
    machine_free: dict[str, int] = {}
    for f in fixed_ops:
        machine_free[f.machine_id] = max(machine_free.get(f.machine_id, 0), f.end)

    # 3. Build a lookup: job_id -> end time of each completed stage
    job_stage_end: dict[str, dict[str, int]] = {}
    for f in fixed_ops:
        job_stage_end.setdefault(f.job_id, {})[f.stage] = f.end

    # 4. Schedule forming operations first (inspection depends on forming)
    forming_ops = [op for op in reschedulable_ops if op.stage == "forming"]
    inspection_ops = [op for op in reschedulable_ops if op.stage == "inspection"]

    # Group forming ops by assigned machine, sort by earliest possible start
    forming_by_machine: dict[str, list[ReschedulableOperation]] = {}
    for op in forming_ops:
        machine = assignments[op.operation_id]
        forming_by_machine.setdefault(machine, []).append(op)

    # Schedule each machine's forming queue in earliest-start order
    for machine_id, ops in forming_by_machine.items():
        ops.sort(key=lambda o: o.earliest_start)
        for op in ops:
            duration = op.durations[machine_id]
            predecessor_end = job_stage_end.get(op.job_id, {}).get("cutting", 0)
            start = max(
                machine_free.get(machine_id, 0),
                predecessor_end,
                FAILURE_TIME,
            )
            end = start + duration
            result_ops.append(ScheduledOperation(
                jobId=op.job_id, operationId=op.operation_id,
                stage="forming", machineId=machine_id,
                start=start, end=end,
            ))
            machine_free[machine_id] = end
            job_stage_end.setdefault(op.job_id, {})["forming"] = end

    # 5. Schedule inspection operations
    insp_by_machine: dict[str, list[ReschedulableOperation]] = {}
    for op in inspection_ops:
        machine = assignments[op.operation_id]
        insp_by_machine.setdefault(machine, []).append(op)

    for machine_id, ops in insp_by_machine.items():
        # Sort by forming completion time (greedy: earliest available first)
        ops.sort(key=lambda o: job_stage_end.get(o.job_id, {}).get("forming", 0))
        for op in ops:
            duration = op.durations[machine_id]
            forming_end = job_stage_end.get(op.job_id, {}).get("forming", 0)
            start = max(machine_free.get(machine_id, 0), forming_end)
            end = start + duration
            result_ops.append(ScheduledOperation(
                jobId=op.job_id, operationId=op.operation_id,
                stage="inspection", machineId=machine_id,
                start=start, end=end,
            ))
            machine_free[machine_id] = end
            job_stage_end.setdefault(op.job_id, {})["inspection"] = end

    return Schedule(scheduleId=schedule_id, operations=result_ops)


def compute_makespan(schedule: Schedule) -> int:
    return max(op.end for op in schedule.operations)
