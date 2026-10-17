"""Classical solvers: greedy heuristic and exhaustive search for comparison."""

from __future__ import annotations

import itertools

from app.core.scenario import FixedOperation, ReschedulableOperation
from app.optimizer.decoder import build_schedule, compute_makespan


def solve_greedy(
    reschedulable_ops: list[ReschedulableOperation],
    fixed_ops: list[FixedOperation],
    scenario: dict,
) -> dict:
    """Shortest-processing-time-first greedy: assign each op to the machine giving earliest finish."""
    assignments: dict[str, str] = {}

    # Track machine availability from fixed ops
    machine_free: dict[str, int] = {}
    for f in fixed_ops:
        machine_free[f.machine_id] = max(machine_free.get(f.machine_id, 0), f.end)

    # Track forming completion per job (for inspection dependencies)
    job_forming_end: dict[str, int] = {}
    for f in fixed_ops:
        if f.stage == "forming":
            job_forming_end[f.job_id] = f.end

    # Schedule forming ops first
    forming = sorted(
        [op for op in reschedulable_ops if op.stage == "forming"],
        key=lambda o: min(o.durations.values()),  # shortest first
    )
    for op in forming:
        best_machine = None
        best_end = float("inf")
        for m in op.eligible_machines:
            start = max(machine_free.get(m, 0), op.earliest_start)
            end = start + op.durations[m]
            if end < best_end:
                best_end = end
                best_machine = m
        assignments[op.operation_id] = best_machine
        machine_free[best_machine] = best_end
        job_forming_end[op.job_id] = best_end

    # Schedule inspection ops
    inspection = sorted(
        [op for op in reschedulable_ops if op.stage == "inspection"],
        key=lambda o: job_forming_end.get(o.job_id, 0),  # earliest forming done first
    )
    for op in inspection:
        best_machine = None
        best_end = float("inf")
        for m in op.eligible_machines:
            forming_end = job_forming_end.get(op.job_id, 0)
            start = max(machine_free.get(m, 0), forming_end)
            end = start + op.durations[m]
            if end < best_end:
                best_end = end
                best_machine = m
        assignments[op.operation_id] = best_machine
        machine_free[best_machine] = best_end

    schedule = build_schedule(assignments, fixed_ops, reschedulable_ops, scenario, "classical-greedy")
    return {
        "assignments": assignments,
        "schedule": schedule,
        "makespan": compute_makespan(schedule),
    }


def solve_exhaustive(
    reschedulable_ops: list[ReschedulableOperation],
    fixed_ops: list[FixedOperation],
    scenario: dict,
) -> dict:
    """Enumerate all 2^N machine assignments, find the one with minimum makespan.

    Only feasible for small problems (N <= ~20). Our recovery problem has N=10 -> 1024 combos.
    """
    forming = [op for op in reschedulable_ops if op.stage == "forming"]
    inspection = [op for op in reschedulable_ops if op.stage == "inspection"]

    # Each op has exactly 2 eligible machines
    all_ops = forming + inspection
    machine_choices = [op.eligible_machines for op in all_ops]

    best_makespan = float("inf")
    best_assignments: dict[str, str] = {}

    for combo in itertools.product(*machine_choices):
        assignments = {
            all_ops[i].operation_id: combo[i]
            for i in range(len(all_ops))
        }
        schedule = build_schedule(assignments, fixed_ops, reschedulable_ops, scenario, "temp")
        makespan = compute_makespan(schedule)
        if makespan < best_makespan:
            best_makespan = makespan
            best_assignments = assignments.copy()

    schedule = build_schedule(
        best_assignments, fixed_ops, reschedulable_ops, scenario, "classical-exhaustive",
    )
    return {
        "assignments": best_assignments,
        "schedule": schedule,
        "makespan": best_makespan,
    }
