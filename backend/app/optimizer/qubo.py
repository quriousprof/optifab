"""Build a QUBO matrix for the factory recovery scheduling problem.

The QUBO encodes machine assignments for 10 reschedulable operations (4 forming + 6 inspection)
as 10 binary variables. The objective is load balancing across machines, which correlates with
minimum makespan.

Variables:
  - a_i (forming): 0 = first eligible machine, 1 = second eligible machine
  - b_j (inspection): 0 = first eligible machine, 1 = second eligible machine

Objective: minimize sum of (machine_load)^2 across all machines in each stage.
This is naturally quadratic in binary variables -> direct QUBO.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.core.scenario import FixedOperation, ReschedulableOperation


@dataclass
class QUBOResult:
    Q: np.ndarray                      # n x n QUBO matrix
    offset: float                      # constant term (doesn't affect optimization)
    var_map: list[str]                 # index -> operation_id
    machine_map: list[tuple[str, str]] # index -> (machine_if_0, machine_if_1)
    num_qubits: int


def build_qubo(
    reschedulable_ops: list[ReschedulableOperation],
    fixed_ops: list[FixedOperation],
    forming_weight: float = 1.0,
    inspection_weight: float = 0.3,
) -> QUBOResult:
    """Build a QUBO matrix for machine assignment.

    Each binary variable x_i: 0 = first eligible machine, 1 = second eligible machine.
    Objective: minimize weighted sum of squared loads across machines in each stage.

    Args:
        reschedulable_ops: Operations needing machine assignment.
        fixed_ops: Operations already locked (their load is fixed overhead).
        forming_weight: Weight for forming stage load balance.
        inspection_weight: Weight for inspection stage load balance.
    """
    forming = [op for op in reschedulable_ops if op.stage == "forming"]
    inspection = [op for op in reschedulable_ops if op.stage == "inspection"]

    n = len(forming) + len(inspection)
    all_ops = forming + inspection

    # Variable mapping: index i -> operation, machine_if_0, machine_if_1
    var_map = [op.operation_id for op in all_ops]
    machine_map = [(op.eligible_machines[0], op.eligible_machines[1]) for op in all_ops]

    Q = np.zeros((n, n))
    offset = 0.0

    # --- Forming stage: load_m0^2 + load_m1^2 ---
    # m0, m1 are the two surviving forming machines (F2, F3)
    if forming:
        m0, m1 = forming[0].eligible_machines[0], forming[0].eligible_machines[1]

        # Fixed load on each forming machine (from still-running operations)
        r0 = sum(
            max(f.end - 6, 0) for f in fixed_ops
            if f.stage == "forming" and f.machine_id == m0
        )
        r1 = sum(
            max(f.end - 6, 0) for f in fixed_ops
            if f.stage == "forming" and f.machine_id == m1
        )

        # For each forming variable i (index 0..len(forming)-1):
        #   x_i = 0 -> assigned to m0, adds d0_i to load_m0
        #   x_i = 1 -> assigned to m1, adds d1_i to load_m1
        # load_m0 = r0 + sum_i d0_i * (1 - x_i)
        # load_m1 = r1 + sum_i d1_i * x_i
        d0 = np.array([op.durations[m0] for op in forming], dtype=float)
        d1 = np.array([op.durations[m1] for op in forming], dtype=float)
        nf = len(forming)

        # Expand load_m0^2 + load_m1^2
        # load_m0 = (r0 + sum(d0)) - sum(d0_i * x_i)  = C0 - sum(d0_i * x_i)
        # load_m1 = r1 + sum(d1_i * x_i)               = r1 + sum(d1_i * x_i)
        c0 = r0 + d0.sum()

        # load_m0^2 = C0^2 - 2*C0*sum(d0_i*x_i) + (sum(d0_i*x_i))^2
        # load_m1^2 = r1^2 + 2*r1*sum(d1_i*x_i) + (sum(d1_i*x_i))^2

        # Constant terms
        offset += forming_weight * (c0**2 + r1**2)

        # Linear terms (diagonal of Q)
        for i in range(nf):
            # From load_m0^2: -2*C0*d0_i*x_i + d0_i^2 * x_i  (since x_i^2 = x_i for binary)
            # From load_m1^2: +2*r1*d1_i*x_i + d1_i^2 * x_i
            Q[i, i] += forming_weight * (-2 * c0 * d0[i] + d0[i]**2 + 2 * r1 * d1[i] + d1[i]**2)

        # Quadratic terms (off-diagonal)
        for i in range(nf):
            for j in range(i + 1, nf):
                # From (sum d0*x)^2: +2*d0_i*d0_j
                # From (sum d1*x)^2: +2*d1_i*d1_j
                coeff = forming_weight * 2 * (d0[i] * d0[j] + d1[i] * d1[j])
                Q[i, j] += coeff
                Q[j, i] += coeff

    # --- Inspection stage: load_m0^2 + load_m1^2 ---
    if inspection:
        im0, im1 = inspection[0].eligible_machines[0], inspection[0].eligible_machines[1]

        # No fixed inspection load (none are running at failure time)
        ir0 = 0.0
        ir1 = 0.0

        id0 = np.array([op.durations[im0] for op in inspection], dtype=float)
        id1 = np.array([op.durations[im1] for op in inspection], dtype=float)
        ni = len(inspection)
        idx_offset = len(forming)  # inspection vars start after forming vars

        ic0 = ir0 + id0.sum()

        offset += inspection_weight * (ic0**2 + ir1**2)

        for i in range(ni):
            qi = idx_offset + i
            Q[qi, qi] += inspection_weight * (
                -2 * ic0 * id0[i] + id0[i]**2 + 2 * ir1 * id1[i] + id1[i]**2
            )

        for i in range(ni):
            for j in range(i + 1, ni):
                qi, qj = idx_offset + i, idx_offset + j
                coeff = inspection_weight * 2 * (id0[i] * id0[j] + id1[i] * id1[j])
                Q[qi, qj] += coeff
                Q[qj, qi] += coeff

    return QUBOResult(
        Q=Q, offset=offset,
        var_map=var_map, machine_map=machine_map,
        num_qubits=n,
    )


def qubo_to_ising(Q: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    """Convert a QUBO matrix Q to Ising model: h (local fields), J (couplings), offset.

    Mapping: x_i = (1 - s_i) / 2 where s_i in {-1, +1}.
    H_ising = sum_i h_i * s_i + sum_{i<j} J_ij * s_i * s_j + offset
    """
    n = Q.shape[0]
    Q_sym = (Q + Q.T) / 2.0

    h = np.zeros(n)
    J = np.zeros((n, n))
    offset = 0.0

    for i in range(n):
        offset += Q_sym[i, i] / 4.0
        h[i] = -Q_sym[i, i] / 4.0  # note the sign from (1-s)/2 substitution

    for i in range(n):
        for j in range(i + 1, n):
            J[i, j] = Q_sym[i, j] / 4.0
            offset += Q_sym[i, j] / 4.0
            h[i] -= Q_sym[i, j] / 4.0
            h[j] -= Q_sym[i, j] / 4.0

    return h, J, offset


def evaluate_qubo(bitstring: np.ndarray, Q: np.ndarray, offset: float) -> float:
    """Evaluate the QUBO cost for a binary assignment vector."""
    return float(bitstring @ Q @ bitstring) + offset


def decode_assignments(
    bitstring: np.ndarray,
    var_map: list[str],
    machine_map: list[tuple[str, str]],
) -> dict[str, str]:
    """Convert a binary bitstring to operation_id -> machine_id mapping."""
    return {
        var_map[i]: machine_map[i][int(bitstring[i])]
        for i in range(len(var_map))
    }
