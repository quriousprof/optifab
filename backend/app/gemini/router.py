from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.factory.service import factory_service
from app.gemini.service import analyze_failure, explain_schedule

router = APIRouter(prefix="/ai", tags=["gemini"])


def _require_key():
    if not settings.gemini_api_key:
        raise HTTPException(503, "Gemini API key not configured (set OPTIFAB_GEMINI_API_KEY)")


@router.post("/analyze-failure")
async def analyze_failure_endpoint():
    _require_key()
    state = factory_service.state
    if state.phase != "failed":
        raise HTTPException(400, "No active failure to analyze")

    try:
        analysis = await analyze_failure(state, factory_service.scenario)
    except Exception as e:  # network errors, bad key, quota: surface a readable reason instead of a bare 500
        raise HTTPException(502, f"Gemini request failed: {e}") from e
    return {"analysis": analysis}


class ExplainRequest(BaseModel):
    scheduleId: str


@router.post("/explain-schedule")
async def explain_schedule_endpoint(req: ExplainRequest):
    _require_key()
    baseline = factory_service.get_schedule("baseline")
    recovery = factory_service.get_schedule(req.scheduleId)
    if not recovery:
        raise HTTPException(404, f"Schedule '{req.scheduleId}' not found")

    recovery_makespan = max(op.end for op in recovery.operations)
    classical = factory_service.get_schedule("classical-exhaustive")
    classical_makespan = max(op.end for op in classical.operations) if classical else None

    try:
        explanation = await explain_schedule(
            baseline, recovery, recovery_makespan, classical_makespan,
        )
    except Exception as e:
        raise HTTPException(502, f"Gemini request failed: {e}") from e
    return {"explanation": explanation}
