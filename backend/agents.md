# Backend — Agent Context

## Overview

FastAPI (Python) backend serving the factory digital twin API. Uses Google Cirq for QAOA quantum optimization and Google Gemini for AI-powered failure analysis. Managed with `uv`, runs on port 8000.

See `../agents.md` for full project context (scenario, data contracts, failure rules).

## Directory Structure

```
backend/
  app/
    main.py               # FastAPI app, CORS, router mounts
    config.py              # pydantic-settings (OPTIFAB_ env prefix)
    core/
      schemas.py           # Pydantic v2 models (Schedule, FactoryState, OptimizeResult)
      scenario.py          # Load docs/ fixtures, compute fixed vs reschedulable ops
      validation.py        # Enforce all demo-contract scheduling rules
    factory/
      router.py            # GET /api/state, GET /api/schedule/{id}, POST trigger/reset/apply
      service.py           # In-memory state manager (baseline→failed→recovered)
    optimizer/
      router.py            # POST /api/optimize, GET /api/optimize/{job_id}
      service.py           # Orchestrate QAOA + classical, async job tracking
      qubo.py              # Build 10x10 QUBO matrix for machine assignments
      qaoa_solver.py       # Cirq QAOA circuit construction + scipy COBYLA optimization
      classical.py         # Greedy + exhaustive (1024 combos) solvers
      decoder.py           # Bitstring → machine assignments → full 18-op schedule
    gemini/
      router.py            # POST /api/ai/analyze-failure, POST /api/ai/explain-schedule
      service.py           # google-genai async client + prompt templates
  tests/
    conftest.py            # Shared fixtures (scenario, baseline, fixed/reschedulable ops)
    test_validation.py     # Schedule validation correctness
    test_qubo.py           # QUBO matrix properties and brute-force optimality
    test_classical.py      # Greedy and exhaustive solver validity
    test_qaoa.py           # Cirq circuit build, bitstring validity, schedule quality
  pyproject.toml           # uv project config with dependencies
  Dockerfile               # Python 3.12-slim + uv
  .env.example             # Environment variable template
```

## Tech Stack

- **FastAPI** — REST API framework
- **Google Cirq** (`cirq-core`) — QAOA quantum circuit construction and simulation
- **scipy** — COBYLA optimizer for QAOA parameter tuning
- **Google Gemini** (`google-genai`) — Failure analysis and schedule explanation
- **Pydantic v2** — Request/response validation
- **uv** — Package management

## QAOA Architecture (10 Qubits)

The quantum solver optimizes **machine assignments** for 10 reschedulable operations:
- 4 forming ops × 2 eligible machines (F2, F3) = 4 binary variables
- 6 inspection ops × 2 eligible machines (I1, I2) = 6 binary variables
- **Total: 10 qubits** — well within laptop simulator limits

**Pipeline:** scenario → QUBO matrix → Ising conversion → Cirq QAOA circuit → scipy COBYLA → best bitstring → decode to assignments → greedy sequencing → full 18-op schedule → validation

**QUBO objective:** minimize sum of squared machine loads (load balancing proxy for makespan).

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/state` | Current factory state |
| GET | `/api/scenario` | Scenario definition |
| GET | `/api/schedule/{id}` | Get schedule by ID |
| POST | `/api/failure/trigger` | Trigger a forming-machine failure (`{"machineId"}`, default F1) |
| POST | `/api/failure/reset` | Reset to baseline |
| POST | `/api/optimize` | Start QAOA + classical (202 + job ID) |
| GET | `/api/optimize/{job_id}` | Poll optimization status |
| POST | `/api/recovery/apply` | Apply recovery schedule |
| POST | `/api/ai/analyze-failure` | Gemini failure analysis |
| POST | `/api/ai/explain-schedule` | Gemini schedule explanation |

## Commands

```sh
cd backend
uv sync                                    # Install dependencies
uv run uvicorn app.main:app --reload       # Dev server on port 8000
uv run pytest tests/                       # Run all tests
uv run pytest tests/ -m "not slow"         # Skip QAOA quality test
```

## Environment Variables

```sh
OPTIFAB_GEMINI_API_KEY=   # Required for /api/ai/* endpoints
OPTIFAB_QAOA_DEPTH=2      # QAOA circuit layers (default: 2)
OPTIFAB_QAOA_SHOTS=1024   # Measurement shots per evaluation (default: 1024)
OPTIFAB_QAOA_OPTIMIZER_MAXITER=100  # COBYLA max iterations (default: 100)
```
