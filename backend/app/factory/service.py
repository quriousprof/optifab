"""In-memory factory state manager. Handles phase transitions and schedule storage."""

from __future__ import annotations

from app.core.schemas import FactoryState, MachineState, Schedule
from app.core.scenario import load_baseline, load_failure_state, load_scenario


class FactoryService:
    def __init__(self) -> None:
        self._scenario = load_scenario()
        self._baseline = load_baseline()
        self._failure_state = load_failure_state()
        self._schedules: dict[str, Schedule] = {
            self._baseline.scheduleId: self._baseline,
        }
        self._state = FactoryState(
            simulationTime=0,
            phase="baseline",
            activeScheduleId="baseline",
            failedMachineIds=[],
            blockedJobIds=[],
            machineStates={
                m["machineId"]: MachineState(status="idle", currentOperationId=None)
                for m in self._scenario["machines"]
            },
        )

    @property
    def scenario(self) -> dict:
        return self._scenario

    @property
    def state(self) -> FactoryState:
        return self._state

    def get_schedule(self, schedule_id: str) -> Schedule | None:
        return self._schedules.get(schedule_id)

    def store_schedule(self, schedule: Schedule) -> None:
        self._schedules[schedule.scheduleId] = schedule

    def trigger_failure(self) -> FactoryState:
        self._state = self._failure_state.model_copy()
        return self._state

    def apply_recovery(self, schedule_id: str) -> FactoryState | None:
        schedule = self._schedules.get(schedule_id)
        if not schedule:
            return None

        # Build machine states at failure time from the recovery schedule
        machine_states: dict[str, MachineState] = {}
        for m in self._scenario["machines"]:
            mid = m["machineId"]
            if mid == "F1":
                machine_states[mid] = MachineState(status="failed", currentOperationId=None)
                continue

            current_op = None
            for op in schedule.operations:
                if op.machineId == mid and op.start <= 6 < op.end:
                    current_op = op.operationId
                    break

            machine_states[mid] = MachineState(
                status="processing" if current_op else "idle",
                currentOperationId=current_op,
            )

        self._state = FactoryState(
            simulationTime=6,
            phase="recovered",
            activeScheduleId=schedule_id,
            failedMachineIds=["F1"],
            blockedJobIds=[],
            machineStates=machine_states,
        )
        return self._state

    def reset(self) -> FactoryState:
        self._state = FactoryState(
            simulationTime=0,
            phase="baseline",
            activeScheduleId="baseline",
            failedMachineIds=[],
            blockedJobIds=[],
            machineStates={
                m["machineId"]: MachineState(status="idle", currentOperationId=None)
                for m in self._scenario["machines"]
            },
        )
        return self._state


# Singleton instance
factory_service = FactoryService()
