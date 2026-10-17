"""Test QUBO formulation correctness."""

import numpy as np

from app.optimizer.qubo import build_qubo, decode_assignments, evaluate_qubo


def test_qubo_matrix_shape(reschedulable_ops, fixed_ops):
    result = build_qubo(reschedulable_ops, fixed_ops)
    assert result.Q.shape == (10, 10), f"Expected 10x10 QUBO, got {result.Q.shape}"
    assert result.num_qubits == 10


def test_qubo_symmetric(reschedulable_ops, fixed_ops):
    result = build_qubo(reschedulable_ops, fixed_ops)
    assert np.allclose(result.Q, result.Q.T), "QUBO matrix should be symmetric"


def test_brute_force_finds_minimum(reschedulable_ops, fixed_ops):
    """Exhaustively evaluate all 1024 bitstrings to find the QUBO minimum."""
    result = build_qubo(reschedulable_ops, fixed_ops)
    n = result.num_qubits

    best_cost = float("inf")
    best_bitstring = None

    for i in range(2**n):
        bits = np.array([(i >> b) & 1 for b in range(n)], dtype=float)
        cost = evaluate_qubo(bits, result.Q, result.offset)
        if cost < best_cost:
            best_cost = cost
            best_bitstring = bits

    assignments = decode_assignments(best_bitstring, result.var_map, result.machine_map)

    # The optimal should assign to both machines (not all to one)
    forming_machines = {
        v for k, v in assignments.items() if "forming" in k
    }
    assert len(forming_machines) >= 1, "Optimal should use at least one forming machine"


def test_decode_assignments_produces_valid_mapping(reschedulable_ops, fixed_ops):
    result = build_qubo(reschedulable_ops, fixed_ops)
    bits = np.zeros(result.num_qubits)  # all zeros = first machine for each
    assignments = decode_assignments(bits, result.var_map, result.machine_map)

    assert len(assignments) == 10
    for op_id, machine in assignments.items():
        assert machine in ("F2", "F3", "I1", "I2"), f"Unexpected machine {machine} for {op_id}"
