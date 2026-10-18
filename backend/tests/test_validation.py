"""Test schedule validation against the demo contract rules."""

from app.core.schemas import Schedule, ScheduledOperation
from app.core.validation import validate_schedule


def test_baseline_is_valid(baseline, scenario, fixed_ops, get_duration):
    errors = validate_schedule(baseline, scenario, fixed_ops, get_duration)
    assert errors == [], f"Baseline should be valid but got: {errors}"


def test_wrong_duration_detected(baseline, scenario, fixed_ops, get_duration):
    ops = [op.model_copy() for op in baseline.operations]
    # Corrupt J1-cutting duration
    for op in ops:
        if op.operationId == "J1-cutting":
            op.end = op.start + 99
            break
    bad = Schedule(scheduleId="bad", operations=ops)
    errors = validate_schedule(bad, scenario, fixed_ops, get_duration)
    assert any("duration" in e for e in errors)


def test_overlap_detected(baseline, scenario, fixed_ops, get_duration):
    ops = [op.model_copy() for op in baseline.operations]
    # Make two operations overlap on C1
    for op in ops:
        if op.operationId == "J5-cutting":
            op.start = 0  # overlaps with J1-cutting on C1 [0,2)
            op.end = 3
            break
    bad = Schedule(scheduleId="bad", operations=ops)
    errors = validate_schedule(bad, scenario, fixed_ops, get_duration)
    assert any("overlap" in e for e in errors)


def test_precedence_violation_detected(baseline, scenario, fixed_ops, get_duration):
    ops = [op.model_copy() for op in baseline.operations]
    # Make J1-forming start before J1-cutting ends
    for op in ops:
        if op.operationId == "J1-forming":
            op.start = 0
            op.end = 6
            break
    bad = Schedule(scheduleId="bad", operations=ops)
    errors = validate_schedule(bad, scenario, fixed_ops, get_duration)
    assert any("cutting" in e and "forming" in e for e in errors)
