from fastapi import APIRouter, Depends, HTTPException, status

from app.billing.trial import check_trial_status
from app.mensuration import MensurationError, calculate
from app.rbac.dependencies import require_permission
from app.rbac.models import User, log_usage_event
from app.schemas import MensurationCalculateRequest, MensurationResultResponse

router = APIRouter(prefix="/api/mensuration", tags=["mensuration"])


@router.post("/calculate", response_model=MensurationResultResponse)
def calculate_mensuration(
    payload: MensurationCalculateRequest,
    user: User = Depends(require_permission("use_mensuration")),
    _trial: User = Depends(check_trial_status),
) -> MensurationResultResponse:
    log_usage_event(user.id, "mensuration")

    dimensions = {k: v for k, v in payload.dimensions.model_dump().items() if v is not None}
    try:
        result = calculate(payload.shape, dimensions, payload.unit)
    except MensurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return MensurationResultResponse(
        shape=result.shape,
        dimensions=result.dimensions,
        unit=result.unit,
        surface_area_steps=result.surface_area.steps,
        volume_steps=result.volume.steps,
        final_surface_area=result.surface_area.final_answer,
        final_volume=result.volume.final_answer,
        formulas_used=result.formulas_used,
    )
