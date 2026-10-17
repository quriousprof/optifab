"""QAOA solver using Google Cirq for the factory recovery scheduling problem.

Builds a parameterized QAOA circuit from an Ising Hamiltonian derived from the QUBO,
optimizes gamma/beta parameters with scipy COBYLA, and returns the best bitstring.
"""

from __future__ import annotations

import numpy as np
import cirq
from scipy.optimize import minimize

from app.optimizer.qubo import evaluate_qubo


def build_qaoa_circuit(
    qubits: list[cirq.LineQubit],
    h: np.ndarray,
    J: np.ndarray,
    gammas: list[float],
    betas: list[float],
) -> cirq.Circuit:
    """Construct a QAOA circuit with p layers.

    Circuit structure per layer:
      1. Cost unitary: exp(-i * gamma * H_C)
         - ZZ interactions for coupling terms J[i,j]
         - Rz rotations for local field terms h[i]
      2. Mixer unitary: exp(-i * beta * H_M) where H_M = sum(X_i)
         - Rx rotations on all qubits

    Args:
        qubits: List of cirq qubits.
        h: Local field coefficients, shape (n,).
        J: Coupling matrix (upper triangular used), shape (n, n).
        gammas: Cost layer angles, one per QAOA layer.
        betas: Mixer layer angles, one per QAOA layer.
    """
    n = len(qubits)
    p = len(gammas)
    moments: list[cirq.Operation | list[cirq.Operation]] = []

    # Initial superposition |+>^n
    moments.append(cirq.H.on_each(*qubits))

    for layer in range(p):
        gamma = gammas[layer]
        beta = betas[layer]

        # Cost unitary: ZZ couplings
        zz_ops = []
        for i in range(n):
            for j in range(i + 1, n):
                if abs(J[i, j]) > 1e-12:
                    # cirq.ZZPowGate with exponent e applies exp(i * pi * e * Z_i Z_j)
                    # We want exp(-i * gamma * J[i,j] * Z_i Z_j)
                    # So exponent = -gamma * J[i,j] / pi
                    exponent = -gamma * J[i, j] / np.pi
                    zz_ops.append(
                        cirq.ZZPowGate(exponent=exponent, global_shift=0.0).on(
                            qubits[i], qubits[j]
                        )
                    )
        if zz_ops:
            moments.append(zz_ops)

        # Cost unitary: Z local fields
        z_ops = []
        for i in range(n):
            if abs(h[i]) > 1e-12:
                # cirq.rz(rads) applies exp(-i * rads/2 * Z)
                # We want exp(-i * gamma * h[i] * Z)
                # So rads = 2 * gamma * h[i]
                z_ops.append(cirq.rz(2 * gamma * h[i]).on(qubits[i]))
        if z_ops:
            moments.append(z_ops)

        # Mixer unitary: X rotations
        # cirq.rx(rads) applies exp(-i * rads/2 * X)
        # We want exp(-i * beta * X) on each qubit
        # So rads = 2 * beta
        moments.append([cirq.rx(2 * beta).on(q) for q in qubits])

    # Measurement
    moments.append(cirq.measure(*qubits, key="result"))

    return cirq.Circuit(moments)


def solve_qaoa(
    Q: np.ndarray,
    h: np.ndarray,
    J: np.ndarray,
    offset: float,
    p: int = 2,
    shots: int = 1024,
    maxiter: int = 100,
) -> dict:
    """Run QAOA optimization and return the best bitstring with metadata.

    Args:
        Q: QUBO matrix (for cost evaluation).
        h: Ising local fields.
        J: Ising coupling matrix.
        offset: Ising constant offset.
        p: Number of QAOA layers (circuit depth).
        shots: Number of measurement shots per evaluation.
        maxiter: Maximum optimizer iterations.

    Returns:
        Dict with best_bitstring, best_cost, optimal parameters, and circuit metadata.
    """
    n = Q.shape[0]
    qubits = cirq.LineQubit.range(n)
    simulator = cirq.Simulator()

    eval_count = 0

    def objective(params: np.ndarray) -> float:
        nonlocal eval_count
        eval_count += 1

        gammas = params[:p].tolist()
        betas = params[p:].tolist()
        circuit = build_qaoa_circuit(qubits, h, J, gammas, betas)

        result = simulator.run(circuit, repetitions=shots)
        measurements = result.measurements["result"]

        # Average QUBO cost over all shots
        total_cost = 0.0
        for bitstring in measurements:
            total_cost += evaluate_qubo(bitstring.astype(float), Q, 0.0)
        return total_cost / len(measurements)

    # Random initial parameters in [0, pi]
    rng = np.random.default_rng(42)
    init_params = rng.uniform(0, np.pi, size=2 * p)

    # Optimize with COBYLA (derivative-free, handles noisy objectives)
    opt_result = minimize(
        objective, init_params,
        method="COBYLA",
        options={"maxiter": maxiter, "rhobeg": 0.5},
    )

    # Final sampling with more shots to find the best solution
    optimal_gammas = opt_result.x[:p].tolist()
    optimal_betas = opt_result.x[p:].tolist()
    final_circuit = build_qaoa_circuit(qubits, h, J, optimal_gammas, optimal_betas)
    final_result = simulator.run(final_circuit, repetitions=shots * 4)
    measurements = final_result.measurements["result"]

    # Find the best bitstring
    best_cost = float("inf")
    best_bitstring = None
    cost_distribution: dict[float, int] = {}

    for bitstring in measurements:
        cost = evaluate_qubo(bitstring.astype(float), Q, 0.0)
        cost_distribution[cost] = cost_distribution.get(cost, 0) + 1
        if cost < best_cost:
            best_cost = cost
            best_bitstring = bitstring.copy()

    return {
        "best_bitstring": best_bitstring,
        "best_cost": float(best_cost + offset),  # include offset for true QUBO value
        "optimal_gammas": optimal_gammas,
        "optimal_betas": optimal_betas,
        "num_qubits": n,
        "depth": p,
        "shots": shots,
        "final_shots": shots * 4,
        "optimizer_iterations": eval_count,
        "optimizer_success": opt_result.success,
        "circuit_moment_count": len(final_circuit.moments),
    }
