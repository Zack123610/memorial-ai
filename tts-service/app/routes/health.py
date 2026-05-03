from __future__ import annotations

from fastapi import APIRouter, Request

from ..schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    runner = request.app.state.runner
    return HealthResponse(
        status="ok",
        model_loaded=runner.loaded,
        device=runner.device,
        dtype=runner.dtype_name,
        model_id=runner.model_id,
    )
