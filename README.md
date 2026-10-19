# Optifab — Quantum-Enhanced Factory Recovery Optimizer

**Optifab** is a real-time factory digital twin that uses **Google Quantum AI (Cirq)** and **Gemini** to recover production schedules when machines fail. It casts job-shop rescheduling as a QUBO (Quadratic Unconstrained Binary Optimization) problem and solves it with the **Quantum Approximate Optimization Algorithm (QAOA)**, then compares the result against a classical exhaustive search — all visualized in an interactive 3D factory floor.

Built for the **Google AI Builder Cup 2026**.

---

## The Problem

Modern manufacturing relies on tightly coupled schedules. When a critical machine goes down, the ripple effect blocks downstream jobs, idles expensive equipment, and delays delivery. Rescheduling is NP-hard — even modest factories face combinatorial explosion when reassigning operations across surviving machines under precedence, capacity, and timing constraints.

Traditional approaches use hand-tuned heuristics or expensive commercial solvers. Neither scales gracefully, and neither gives operators an intuitive understanding of *why* a particular recovery plan was chosen.

## The Solution

Optifab demonstrates a **quantum-classical hybrid approach** to manufacturing failure recovery:

1. **3D Digital Twin** — An interactive Three.js factory viewport where operators see machine states, job flow, and schedule timelines in real time.
2. **QAOA Optimizer** — The rescheduling problem is encoded as a QUBO and solved with a parameterized quantum circuit (10 qubits, p=2 layers) using Google Cirq's simulator. COBYLA tunes the variational parameters over 1024-shot evaluations.
3. **Classical Benchmark** — An exhaustive search runs in parallel, proving optimality for comparison and validating the quantum solution quality.
4. **Gemini AI Copilot** — Google's Gemini model explains the failure impact in plain language and narrates the tradeoffs in the recovery schedule, turning raw optimization output into operator-friendly insights.
5. **Google Cloud Deployment** — Cloud Build, Artifact Registry, Cloud Run, and Firestore provide a fully managed, serverless production stack.

## Unique Selling Points

- **Quantum meets manufacturing** — Demonstrates a concrete, domain-relevant application of QAOA beyond toy problems. The QUBO formulation (minimizing sum-of-squared machine loads) naturally encodes load balancing as a quadratic objective, making it a textbook fit for quantum annealing and gate-model variational algorithms.
- **Side-by-side quantum vs classical** — Every optimization run produces both a QAOA result and a provably optimal classical solution. Operators (and judges) can see exactly where quantum gets close and where the gap remains — honest benchmarking, not hype.
- **Gemini-powered explainability** — Raw schedules are hard to interpret. Gemini analyzes the failure cascade and explains recovery tradeoffs in natural language, bridging the gap between optimization output and operational decision-making.
- **Interactive 3D digital twin** — Not a static dashboard. Operators can build factory layouts, place machines, wire conveyors, trigger failures, and watch the recovery unfold on a live Gantt chart overlaid on the 3D scene.
- **End-to-end on Google Cloud** — Every core technology is Google: Cirq for quantum circuits, Gemini for AI, Firestore for persistence, Cloud Build + Cloud Run + Artifact Registry for deployment.

---

## Demo Scenario

The demo uses a **six-job, nine-machine factory** with three production stages:

| Stage | Machines | Notes |
|-------|----------|-------|
| Cutting | C1, C2, C3, C4 | Any machine, uniform processing time per job |
| Forming | F1, F2, F3 | Machine-dependent processing times |
| Inspection | I1, I2 | Any machine, uniform processing time per job |

Each job flows sequentially: **Cutting → Forming → Inspection**.

### Processing Times (minutes)

| Job | Cutting | F1 | F2 | F3 | Inspection |
|-----|---------|----|----|----|----|
| J1 | 2 | 6 | 8 | 7 | 2 |
| J2 | 3 | 4 | 5 | 6 | 2 |
| J3 | 2 | 5 | 7 | 6 | 3 |
| J4 | 4 | 3 | 4 | 5 | 2 |
| J5 | 3 | 7 | 8 | 9 | 3 |
| J6 | 2 | 4 | 6 | 5 | 2 |

### The Failure

At **simulated minute 6**, forming machine **F1 fails permanently**:
- J1-forming (running on F1) is interrupted — all partial work is lost, must restart on F2 or F3
- J5-forming (queued on F1) is blocked — must be reassigned to a surviving machine
- 6 downstream inspection operations may shift due to changed forming timelines
- The baseline makespan of **18 minutes** is no longer achievable

### What Gets Optimized

**10 binary decision variables:**
- 4 forming assignments: each blocked forming op → F2 (0) or F3 (1)
- 6 inspection assignments: each inspection op → I1 (0) or I2 (1)

The QUBO objective minimizes the sum of squared machine loads across surviving machines, producing balanced utilization and indirectly minimizing makespan.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Cloud Run)                  │
│   React + Three.js/R3F + Tailwind CSS                   │
│   3D Viewport │ Gantt Chart │ Gemini Cards │ Inspector   │
│                        │                                │
│                   Caddy (reverse proxy)                  │
│                   /api/* → backend                       │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                    Backend (Cloud Run)                   │
│   FastAPI + Uvicorn                                     │
│                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│   │   Factory     │  │  Optimizer   │  │   Gemini     │ │
│   │   Service     │  │              │  │   Service    │ │
│   │              │  │  QUBO Builder │  │              │ │
│   │  Scenario    │  │  QAOA (Cirq) │  │  Analyze     │ │
│   │  State Mgmt  │  │  Classical   │  │  Explain     │ │
│   │  Phases      │  │  Decoder     │  │              │ │
│   └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│   ┌──────────────────────────────────────────────────┐  │
│   │  Layouts Store (Firestore or local JSON)         │  │
│   └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Google Cloud Technologies

| Technology | Component | Purpose |
|---|---|---|
| **Cirq** | `optimizer/qaoa_solver.py` | Build and simulate 10-qubit QAOA circuits with ZZ/Rz/Rx gates |
| **Gemini** | `gemini/service.py` | Natural-language failure analysis and schedule explanation |
| **Cloud Run** | Frontend + Backend | Serverless container deployment with auto-scaling |
| **Cloud Build** | `cloudbuild.yaml` | Multi-image CI/CD pipeline (native x86 builds) |
| **Artifact Registry** | `asia-south1-docker.pkg.dev` | Container image storage |
| **Firestore** | `layouts/store.py` | Persistent factory layout storage |

---

## Quantum Approach: QAOA on Cirq

### QUBO Formulation

The rescheduling problem is encoded as a load-balancing QUBO:

```
minimize: (load_F2)^2 + (load_F3)^2 + w * [(load_I1)^2 + (load_I2)^2]
```

Where each load is a linear function of binary variables (machine assignments), and squaring produces the quadratic terms that populate the QUBO matrix Q.

### Ising Conversion

The QUBO is converted to an Ising Hamiltonian via `x_i = (1 - Z_i) / 2`, yielding local fields **h** and coupling matrix **J** that map directly to quantum gates.

### Circuit Structure

For each of `p` layers (default p=2):

1. **Initial state**: Hadamard on all 10 qubits → equal superposition
2. **Cost unitary**: `exp(-iγH_C)` — ZZ gates for couplings, Rz for local fields
3. **Mixer unitary**: `exp(-iβH_M)` — Rx gates on all qubits
4. **Measurement**: Sample bitstrings, evaluate QUBO cost

### Parameter Optimization

- **COBYLA** (derivative-free) minimizes the average QUBO cost over 1024 shots
- Up to 100 iterations, starting from random parameters in [0, π]
- Final sampling uses 4096 shots to find the best bitstring

### Schedule Decoding

The best bitstring is decoded into machine assignments, then a greedy scheduler places operations respecting precedence constraints and machine availability, producing a complete 18-operation recovery schedule.

---

## Demo Lifecycle

### Phase 1 — Baseline
The factory loads with a pre-computed optimal schedule (makespan = 18 min). All 9 machines are idle. The 3D scene shows the factory layout, and the Gantt chart displays the baseline timeline.

### Phase 2 — Failure
The operator triggers F1's failure. The scene updates: F1 turns red, blocked machines turn orange. The Gantt chart draws a failure line at minute 6. Gemini (optionally) narrates the cascade.

### Phase 3 — Recovery
QAOA and classical optimizers run in parallel (~10-15s). Results appear side-by-side with metadata: qubit count, circuit depth, optimizer iterations, makespan comparison. The operator picks a schedule to apply.

### Phase 4 — Reset
One click restores the baseline. The cycle can be repeated with different failure machines (F1, F2, or F3).

---

## Project Structure

```
optifab-google-ai-builder/
├── frontend/                   React + Three.js digital twin
│   ├── src/
│   │   ├── App.tsx             Main app orchestrator
│   │   ├── FactoryViewport.tsx 3D canvas and machine rendering
│   │   ├── MachineMesh.tsx     Machine/conveyor geometry and status colors
│   │   ├── useFactory.ts       Backend state management and API calls
│   │   ├── ScheduleChart.tsx   Gantt chart with baseline/recovery overlay
│   │   ├── api.ts              Typed API client
│   │   └── ...
│   ├── Caddyfile               Caddy config for compose deployment
│   ├── Caddyfile.cloudrun      Caddy config for Cloud Run (PORT + BACKEND_URL)
│   └── Dockerfile              Multi-stage: npm ci → vite build → caddy
│
├── backend/                    FastAPI optimization backend
│   ├── app/
│   │   ├── main.py             FastAPI app, CORS, router mounting
│   │   ├── config.py           Pydantic settings (OPTIFAB_ prefix)
│   │   ├── core/
│   │   │   ├── scenario.py     Scenario loading, failure decomposition
│   │   │   └── schemas.py      Pydantic models (Schedule, FactoryState, etc.)
│   │   ├── factory/
│   │   │   ├── service.py      In-memory state, phase transitions
│   │   │   └── router.py       /state, /scenario, /failure/*, /recovery/*
│   │   ├── optimizer/
│   │   │   ├── qaoa_solver.py  Cirq QAOA circuit + COBYLA optimization
│   │   │   ├── qubo.py         QUBO matrix construction from machine loads
│   │   │   ├── decoder.py      Bitstring → schedule greedy builder
│   │   │   ├── classical.py    Exhaustive search (2^10 combinations)
│   │   │   ├── service.py      Async job orchestration
│   │   │   └── router.py       /optimize endpoints
│   │   ├── gemini/
│   │   │   ├── service.py      Gemini API calls for analysis/explanation
│   │   │   └── router.py       /ai/analyze-failure, /ai/explain-schedule
│   │   └── layouts/
│   │       ├── store.py        Firestore or local JSON persistence
│   │       └── router.py       /layouts CRUD
│   └── Dockerfile              uv sync → python:3.12-slim → uvicorn
│
├── docs/                       Shared contracts and fixtures
│   ├── demo-contract.md        Scenario rules and scheduling constraints
│   ├── six-job-scenario.json   Machine positions, processing times, failure def
│   ├── baseline-schedule.json  Pre-computed optimal baseline (18 ops)
│   └── api.md                  Full API reference
│
├── cloudbuild.yaml             Cloud Build pipeline (backend + frontend)
├── compose.yaml                Local development (docker compose up)
├── compose.prod.yaml           VM deployment with Caddy TLS
└── deploy-cloudrun.sh          One-command Cloud Run deployment
```

## Getting Started

### Prerequisites

- Node.js 22+ and npm
- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- Docker (for containerized deployment)
- Google Cloud SDK (for Cloud Run deployment)

### Local Development

**Frontend:**
```bash
cd frontend
npm install
npm run dev        # → http://localhost:3000
```

**Backend:**
```bash
cd backend
uv sync
cp .env.example .env   # Add your OPTIFAB_GEMINI_API_KEY
uv run uvicorn app.main:app --reload --port 8000
```

### Docker Compose

```bash
docker compose up --build
# Frontend: http://localhost:80
# Backend: http://localhost:8000
```

### Deploy to Cloud Run

```bash
GCP_PROJECT=your-project-id ./deploy-cloudrun.sh
```

This will:
1. Build both images on Cloud Build (native x86)
2. Push to Artifact Registry
3. Deploy backend to Cloud Run
4. Deploy frontend to Cloud Run with API proxy
5. Configure CORS automatically

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPTIFAB_GEMINI_API_KEY` | For AI features | `""` | Gemini API key from [AI Studio](https://aistudio.google.com/apikey) |
| `OPTIFAB_GEMINI_MODEL` | No | `gemini-flash-latest` | Gemini model to use |
| `OPTIFAB_GCP_PROJECT` | For Firestore | `""` | GCP project ID for layout persistence |
| `OPTIFAB_CORS_ORIGINS` | In production | `["http://localhost:3000"]` | Allowed CORS origins (JSON array) |
| `OPTIFAB_QAOA_DEPTH` | No | `2` | Number of QAOA layers |
| `OPTIFAB_QAOA_SHOTS` | No | `1024` | Measurement shots per evaluation |
| `OPTIFAB_QAOA_OPTIMIZER_MAXITER` | No | `100` | Max COBYLA iterations |

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/scenario` | GET | Scenario definition (machines, jobs, failure params) |
| `/api/state` | GET | Current factory state snapshot |
| `/api/schedule/{id}` | GET | Fetch a schedule by ID |
| `/api/failure/trigger` | POST | Trigger machine failure → failed phase |
| `/api/failure/reset` | POST | Reset to baseline |
| `/api/recovery/apply` | POST | Apply a recovery schedule |
| `/api/optimize` | POST | Start optimization (returns job ID, 202) |
| `/api/optimize/{jobId}` | GET | Poll optimization status/result |
| `/api/ai/analyze-failure` | POST | Gemini failure analysis |
| `/api/ai/explain-schedule` | POST | Gemini schedule explanation |
| `/api/layouts` | GET | List saved layouts |
| `/api/layouts/{name}` | GET/PUT/DELETE | Layout CRUD |

Full API documentation: [`docs/api.md`](docs/api.md)

---

## Team

Built by **Soham Ghugare** for the Google AI Builder Cup 2026.

## License

All rights reserved.
