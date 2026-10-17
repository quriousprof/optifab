"""Test classical solvers produce valid schedules."""

from app.core.scenario import get_processing_time
from app.core.validation import validate_schedule
from app.optimizer.classical import solve_exhaustive, solve_greedy


def test_greedy_produces_valid_schedule(reschedulable_ops, fixed_ops, scenario, get_duration):
    result = solve_greedy(reschedulable_ops, fixed_ops, scenario)
    schedule = result["schedule"]

    assert len(schedule.operations) == 18
    errors = validate_schedule(schedule, scenario, fixed_ops, get_duration)
    assert errors == [], f"Greedy schedule invalid: {errors}"
    assert result["makespan"] > 0


def test_exhaustive_produces_valid_schedule(reschedulable_ops, fixed_ops, scenario, get_duration):
    result = solve_exhaustive(reschedulable_ops, fixed_ops, scenario)
    schedule = result["schedule"]

    assert len(schedule.operations) == 18
    errors = validate_schedule(schedule, scenario, fixed_ops, get_duration)
    assert errors == [], f"Exhaustive schedule invalid: {errors}"
    assert result["makespan"] > 0


def test_exhaustive_at_least_as_good_as_greedy(reschedulable_ops, fixed_ops, scenario):
    greedy = solve_greedy(reschedulable_ops, fixed_ops, scenario)
    exhaustive = solve_exhaustive(reschedulable_ops, fixed_ops, scenario)
    assert exhaustive["makespan"] <= greedy["makespan"]


def test_no_f1_in_recovery(reschedulable_ops, fixed_ops, scenario):
    """Neither solver should assign anything to F1 after failure."""
    for solver in (solve_greedy, solve_exhaustive):
        result = solver(reschedulable_ops, fixed_ops, scenario)
        for op in result["schedule"].operations:
            if op.machineId == "F1" and op.end > 6:
                raise AssertionError(f"{op.operationId} assigned to F1 after failure")
