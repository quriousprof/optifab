from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ScheduledOperation(BaseModel):
    jobId: str
    operationId: str
    stage: Literal["cutting", "forming", "inspection"]
    machineId: str
    start: int
    end: int


class Schedule(BaseModel):
    schemaVersion: Literal["1.0"] = "1.0"
    scenarioId: Literal["six-job-demo"] = "six-job-demo"
    scheduleId: str
    timeUnit: Literal["minute"] = "minute"
    operations: list[ScheduledOperation]


class MachineState(BaseModel):
    status: Literal["idle", "processing", "failed", "blocked"]
    currentOperationId: str | None


class FactoryState(BaseModel):
    schemaVersion: Literal["1.0"] = "1.0"
    scenarioId: Literal["six-job-demo"] = "six-job-demo"
    simulationTime: int
    phase: Literal["baseline", "failed", "recovered"]
    activeScheduleId: str
    failedMachineIds: list[str]
    blockedJobIds: list[str]
    machineStates: dict[str, MachineState]


class OptimizeRequest(BaseModel):
    method: Literal["qaoa", "classical", "both"] = "both"


class OptimizeResult(BaseModel):
    jobId: str
    status: Literal["pending", "running", "completed", "failed"]
    qaoa_schedule: Schedule | None = None
    classical_schedule: Schedule | None = None
    qaoa_makespan: int | None = None
    classical_makespan: int | None = None
    qaoa_metadata: dict | None = None
    error: str | None = None
