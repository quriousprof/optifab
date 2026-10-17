# Backend — Agent Context

## Overview

FastAPI (Python) backend serving the factory digital twin API. **Not yet built** — only a `.gitkeep` and Docker Compose service definition exist.

See `../agents.md` for full project context (scenario, data contracts, failure rules).

## Target Architecture

The backend will provide:

### 1. REST API (FastAPI)

- Serve factory state conforming to `docs/factory-state.schema.json`
- Serve schedules conforming to `docs/schedule.schema.json`
- Accept failure triggers and return updated factory state
- Accept and validate recovery schedules against demo contract rules
- Port 8000 (defined in `compose.yaml`)

### 2. Gemini Integration (Google AI)

- **Failure analysis**: explain what went wrong, which jobs are affected, and why
- **Schedule explanation**: natural language description of the recovery schedule and tradeoffs
- **Decision support**: help operators understand the proposed recovery plan

### 3. QAOA Quantum Optimization

- **Input**: remaining unscheduled/interrupted operations after F1 failure at time 6
- **Problem**: job-shop scheduling — assign operations to available machines and time slots, minimizing makespan
- **Constraints**: operation precedence (cutting->forming->inspection), no machine overlap, no F1 after time 6, preserve completed/running operations
- **Output**: valid recovery schedule conforming to `schedule.schema.json`
- Compare quantum result against a classical solver baseline

### 4. Schedule Validation

The API must validate recovery schedules beyond what JSON Schema can check:
- Exactly one entry per operation (18 total)
- Matching job/stage/operation IDs
- `start < end` and correct duration for assigned machine
- Precedence: cutting before forming before inspection for each job
- No machine overlap (one operation per machine at a time)
- Completed and unaffected running operations preserved from baseline
- No F1 assignment at or after time 6

## Data Contracts

All in `docs/`:
- `six-job-scenario.json` — machine positions, processing times, failure definition
- `baseline-schedule.json` — pre-failure schedule (18 operations)
- `failure-state.json` — factory state at minute 6 post-failure
- `factory-state.schema.json` — JSON Schema for state snapshots
- `schedule.schema.json` — JSON Schema for schedule format
- `demo-contract.md` — authoritative rules

## Docker

```yaml
# From compose.yaml
backend:
  build:
    context: ./backend
  ports:
    - "8000:8000"
  volumes:
    - ./backend:/app
```

Dockerfile needs to be created.
