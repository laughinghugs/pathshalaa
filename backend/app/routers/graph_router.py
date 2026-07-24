from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app.google_auth import GoogleUser
from app.graphing import GraphError, build_graph
from app.schemas import GraphRequest

router = APIRouter(prefix="/api", tags=["graph"])


@router.post("/graph")
def graph(payload: GraphRequest, user: GoogleUser = Depends(get_current_user)) -> dict:
    try:
        return build_graph(payload.latex)
    except GraphError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
