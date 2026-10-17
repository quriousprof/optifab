"""Test QAOA solver produces valid results (runs actual Cirq simulation)."""

import numpy as np
import pytest

from app.core.validation import validate_schedule
from app.optimizer.decoder import build_schedule, compute_makespan
from app.optimizer.qaoa_solver import build_qaoa_circuit, solve_qaoa
from app.optimizer.qubo import (
    build_qubo, decode_assignments, evaluate_qubo, qubo_to_ising,
)


def test_qaoa_circuit_builds(reschedulable_ops, fixed_ops):
    """Verify the circuit builds without error."""
    import cirq

    result = build_qubo(reschedulable_ops, fixed_ops)
    h, J, _ = qubo_to_ising(result.Q)
    qubits = cirq.LineQubit.range(result.num_qubits)

    circuit = build_qaoa_circuit(qubits, h, J, [0.5], [0.3])
    assert len(circuit.moments) > 0
    assert circuit.are_all_measurements_terminal()


def test_qaoa_returns_valid_bitstring(reschedulable_ops, fixed_ops):
    """Run a quick QAOA (low iterations) and check output format."""
    result = build_qubo(reschedulable_ops, fixed_ops)
    h, J, offset = qubo_to_ising(result.Q)

    qaoa_out = solve_qaoa(
        Q=result.Q, h=h, J=J, offset=result.offset,
        p=1, shots=256, maxiter=10,
    )

    assert qaoa_out["best_bitstring"] is not None
    assert len(qaoa_out["best_bitstring"]) == 10
    assert qaoa_out["num_qubits"] == 10
    assert all(b in (0, 1) for b in qaoa_out["best_bitstring"])


def test_qaoa_schedule_is_valid(reschedulable_ops, fixed_ops, scenario, get_duration):
    """Run QAOA and verify the decoded schedule passes validation."""
    result = build_qubo(reschedulable_ops, fixed_ops)
    h, J, offset = qubo_to_ising(result.Q)

    qaoa_out = solve_qaoa(
        Q=result.Q, h=h, J=J, offset=result.offset,
        p=2, shots=512, maxiter=30,
    )

    assignments = decode_assignments(
        qaoa_out["best_bitstring"], result.var_map, result.machine_map,
    )
    schedule = build_schedule(
        assignments, fixed_ops, reschedulable_ops, scenario, "test-qaoa",
    )

    assert len(schedule.operations) == 18
    errors = validate_schedule(schedule, scenario, fixed_ops, get_duration)
    assert errors == [], f"QAOA schedule invalid: {errors}"


@pytest.mark.slow
def test_qaoa_quality_vs_exhaustive(reschedulable_ops, fixed_ops, scenario, get_duration):
    """Full-depth QAOA should find a schedule within 15% of exhaustive optimal."""
    from app.optimizer.classical import solve_exhaustive

    exhaustive = solve_exhaustive(reschedulable_ops, fixed_ops, scenario)
    optimal_makespan = exhaustive["makespan"]

    result = build_qubo(reschedulable_ops, fixed_ops)
    h, J, offset = qubo_to_ising(result.Q)

    qaoa_out = solve_qaoa(
        Q=result.Q, h=h, J=J, offset=result.offset,
        p=2, shots=1024, maxiter=100,
    )

    assignments = decode_assignments(
        qaoa_out["best_bitstring"], result.var_map, result.machine_map,
    )
    schedule = build_schedule(
        assignments, fixed_ops, reschedulable_ops, scenario, "test-qaoa-quality",
    )
    qaoa_makespan = compute_makespan(schedule)

    gap = (qaoa_makespan - optimal_makespan) / optimal_makespan
    assert gap <= 0.15, (
        f"QAOA makespan {qaoa_makespan} is {gap:.0%} worse than optimal {optimal_makespan}"
    )
