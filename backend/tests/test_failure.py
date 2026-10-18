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
