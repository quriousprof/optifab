from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.core.schemas import OptimizeRequest, OptimizeResult
from app.optimizer.service import get_job, start_optimization

router = APIRouter(tags=["optimizer"])


@router.post("/optimize", status_code=202)
def launch_optimization(req: OptimizeRequest = OptimizeRequest()):
    job_id = start_optimization(method=req.method)
    return JSONResponse(
        status_code=202,
        content={"jobId": job_id, "status": "pending"},
    )


@router.get("/optimize/{job_id}", response_model=OptimizeResult)
def poll_optimization(job_id: str):
    result = get_job(job_id)
    if not result:
        raise HTTPException(404, f"Job '{job_id}' not found")
    return result
