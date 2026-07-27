from fastapi import APIRouter, Depends, HTTPException, status

from app.billing.trial import check_trial_status
from app.graphing import GraphError, build_graph
from app.rbac.dependencies import require_permission
from app.rbac.models import User, log_usage_event
from app.schemas import GraphRequest

router = APIRouter(prefix="/api", tags=["graph"])


@router.post("/graph")
def graph(
    payload: GraphRequest,
    user: User = Depends(require_permission("use_graph")),
    _trial: User = Depends(check_trial_status),
) -> dict:
    log_usage_event(user.id, "graph")
    try:
        return build_graph(payload.latex)
    except GraphError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
