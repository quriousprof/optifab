"""Optimizer orchestration: runs QAOA and classical solvers, manages async jobs."""

from __future__ import annotations

import threading
import traceback
from uuid import uuid4

from app.config import settings
from app.core.schemas import OptimizeResult
from app.core.scenario import (
    get_fixed_operations, get_operations_to_reschedule,
    load_baseline, load_scenario,
)
from app.factory.service import factory_service
from app.optimizer.classical import solve_exhaustive, solve_greedy
from app.optimizer.decoder import build_schedule, compute_makespan
from app.optimizer.qaoa_solver import solve_qaoa
from app.optimizer.qubo import (
    build_qubo, decode_assignments, qubo_to_ising,
)

# In-memory job store
_jobs: dict[str, OptimizeResult] = {}


def get_job(job_id: str) -> OptimizeResult | None:
    return _jobs.get(job_id)


def start_optimization(method: str = "both") -> str:
    """Create an optimization job and run it in a background thread."""
    job_id = str(uuid4())
    _jobs[job_id] = OptimizeResult(jobId=job_id, status="pending")

    thread = threading.Thread(target=_run_optimization, args=(job_id, method), daemon=True)
    thread.start()
    return job_id


def _run_optimization(job_id: str, method: str) -> None:
    _jobs[job_id] = _jobs[job_id].model_copy(update={"status": "running"})

    try:
        result = _run_solvers(method)
        _jobs[job_id] = _jobs[job_id].model_copy(update={
            "status": "completed",
            **result,
        })
    except Exception as e:
        _jobs[job_id] = _jobs[job_id].model_copy(update={
            "status": "failed",
            "error": f"{type(e).__name__}: {e}\n{traceback.format_exc()}",
        })


def _run_solvers(method: str) -> dict:
    """Run the requested solver(s) synchronously (called from a thread)."""
    scenario = load_scenario()
    baseline = load_baseline()
    failed_machine = factory_service.state.failedMachineIds[0]
    fixed = get_fixed_operations(scenario, baseline, failed_machine)
    reschedulable = get_operations_to_reschedule(scenario, baseline, fixed, failed_machine)

    result: dict = {}

    # QAOA solver
    if method in ("qaoa", "both"):
        qubo_result = build_qubo(reschedulable, fixed)
        h, J, ising_offset = qubo_to_ising(qubo_result.Q)

        qaoa_out = solve_qaoa(
            Q=qubo_result.Q,
            h=h,
            J=J,
            offset=qubo_result.offset,
            p=settings.qaoa_depth,
            shots=settings.qaoa_shots,
            maxiter=settings.qaoa_optimizer_maxiter,
        )

        assignments = decode_assignments(
            qaoa_out["best_bitstring"],
            qubo_result.var_map,
            qubo_result.machine_map,
        )
        qaoa_schedule = build_schedule(
            assignments, fixed, reschedulable, scenario, f"qaoa-{_short_id()}",
        )
        factory_service.store_schedule(qaoa_schedule)

        result["qaoa_schedule"] = qaoa_schedule
        result["qaoa_makespan"] = compute_makespan(qaoa_schedule)
        result["qaoa_metadata"] = {
            "num_qubits": qaoa_out["num_qubits"],
            "circuit_depth": qaoa_out["depth"],
            "circuit_moments": qaoa_out["circuit_moment_count"],
            "optimizer_iterations": qaoa_out["optimizer_iterations"],
            "optimal_gammas": qaoa_out["optimal_gammas"],
            "optimal_betas": qaoa_out["optimal_betas"],
            "qubo_cost": qaoa_out["best_cost"],
            "assignments": assignments,
        }

    # Classical solver
    if method in ("classical", "both"):
        exhaustive = solve_exhaustive(reschedulable, fixed, scenario)
        factory_service.store_schedule(exhaustive["schedule"])

        result["classical_schedule"] = exhaustive["schedule"]
        result["classical_makespan"] = exhaustive["makespan"]

    return result


def _short_id() -> str:
    return str(uuid4())[:8]
