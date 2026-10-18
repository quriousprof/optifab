import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.scenario import (
    FORMING_MACHINES, compute_failure_state, get_fixed_operations,
    get_operations_to_reschedule,
)
from app.core.validation import validate_schedule
from app.main import app
from app.optimizer.classical import solve_exhaustive


def test_f1_failure_state_matches_fixture(scenario, baseline):
    fixture = json.loads((Path(settings.docs_path) / "failure-state.json").read_text())
    assert compute_failure_state(scenario, baseline, "F1").model_dump() == fixture


@pytest.mark.parametrize("machine", FORMING_MACHINES)
def test_any_forming_failure_yields_valid_recovery(machine, scenario, baseline, get_duration):
    fixed = get_fixed_operations(scenario, baseline, machine)
    ops = get_operations_to_reschedule(scenario, baseline, fixed, machine)
    assert len(ops) == 10  # still 10 qubits
    assert all(machine not in op.eligible_machines and len(op.eligible_machines) == 2 for op in ops)

    schedule = solve_exhaustive(ops, fixed, scenario)["schedule"]
    assert validate_schedule(schedule, scenario, fixed, get_duration, is_recovery=True, failed_machine=machine) == []


def test_trigger_api_flow():
    client = TestClient(app)
    client.post("/api/failure/reset")
    assert client.post("/api/failure/trigger", json={"machineId": "C1"}).status_code == 400
    assert client.post("/api/optimize").status_code == 400  # no failure yet

    state = client.post("/api/failure/trigger", json={"machineId": "F2"}).json()
    assert state["failedMachineIds"] == ["F2"] and state["blockedJobIds"] == ["J3", "J4"]
    assert client.post("/api/failure/trigger", json={"machineId": "F3"}).status_code == 400  # already failed

    # Default body stays backward compatible with the F1 demo.
    client.post("/api/failure/reset")
    assert client.post("/api/failure/trigger").json()["failedMachineIds"] == ["F1"]
    client.post("/api/failure/reset")


def test_ai_endpoints(monkeypatch):
    from app.gemini import router as gemini_router

    client = TestClient(app)
    client.post("/api/failure/reset")

    monkeypatch.setattr(settings, "gemini_api_key", "")
    assert client.post("/api/ai/analyze-failure").status_code == 503

    monkeypatch.setattr(settings, "gemini_api_key", "test")

    async def fake_analyze(state, scenario):
        return f"failed {state.failedMachineIds}"

    async def fake_explain(baseline, recovery, recovery_makespan, classical_makespan=None):
        return f"explained {recovery.scheduleId} in {recovery_makespan}"

    monkeypatch.setattr(gemini_router, "analyze_failure", fake_analyze)
    monkeypatch.setattr(gemini_router, "explain_schedule", fake_explain)

    assert client.post("/api/ai/analyze-failure").status_code == 400  # no failure yet
    client.post("/api/failure/trigger", json={"machineId": "F2"})
    assert client.post("/api/ai/analyze-failure").json() == {"analysis": "failed ['F2']"}
    assert client.post("/api/ai/explain-schedule", json={"scheduleId": "nope"}).status_code == 404
    assert client.post("/api/ai/explain-schedule", json={"scheduleId": "baseline"}).json()["explanation"].startswith("explained baseline")

    async def broken(*args, **kwargs):
        raise RuntimeError("quota exceeded")

    monkeypatch.setattr(gemini_router, "analyze_failure", broken)
    response = client.post("/api/ai/analyze-failure")
    assert response.status_code == 502 and "quota exceeded" in response.json()["detail"]
    client.post("/api/failure/reset")
