import pytest

from app.core.scenario import (
    get_fixed_operations, get_operations_to_reschedule,
    get_processing_time, load_baseline, load_scenario,
)


@pytest.fixture
def scenario():
    return load_scenario()


@pytest.fixture
def baseline():
    return load_baseline()


@pytest.fixture
def fixed_ops(scenario, baseline):
    return get_fixed_operations(scenario, baseline)


@pytest.fixture
def reschedulable_ops(scenario, baseline, fixed_ops):
    return get_operations_to_reschedule(scenario, baseline, fixed_ops)


@pytest.fixture
def get_duration(scenario):
    def _get(job_id, stage, machine_id):
        return get_processing_time(scenario, job_id, stage, machine_id)
    return _get
