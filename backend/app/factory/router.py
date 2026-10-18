from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.scenario import DEFAULT_FAILED_MACHINE, FORMING_MACHINES
from app.core.schemas import FactoryState, Schedule
from app.factory.service import factory_service

router = APIRouter(tags=["factory"])


@router.get("/state", response_model=FactoryState)
def get_state():
    return factory_service.state


@router.get("/scenario")
def get_scenario():
    return factory_service.scenario


@router.get("/schedule/{schedule_id}", response_model=Schedule)
def get_schedule(schedule_id: str):
    schedule = factory_service.get_schedule(schedule_id)
    if not schedule:
        raise HTTPException(404, f"Schedule '{schedule_id}' not found")
    return schedule


class TriggerFailureRequest(BaseModel):
    machineId: str = DEFAULT_FAILED_MACHINE


@router.post("/failure/trigger", response_model=FactoryState)
def trigger_failure(req: TriggerFailureRequest = TriggerFailureRequest()):
    if req.machineId not in FORMING_MACHINES:
        raise HTTPException(400, f"Only forming machines {FORMING_MACHINES} can fail, got '{req.machineId}'")
    if factory_service.state.phase != "baseline":
        raise HTTPException(400, "A failure is already active; reset first")
    return factory_service.trigger_failure(req.machineId)


@router.post("/failure/reset", response_model=FactoryState)
def reset_failure():
    return factory_service.reset()


class ApplyRecoveryRequest(BaseModel):
    scheduleId: str


@router.post("/recovery/apply", response_model=FactoryState)
def apply_recovery(req: ApplyRecoveryRequest):
    result = factory_service.apply_recovery(req.scheduleId)
    if not result:
        raise HTTPException(404, f"Schedule '{req.scheduleId}' not found")
    return result
