from fastapi import APIRouter, Depends, HTTPException, status

from app.billing.trial import check_trial_status
from app.llm import get_llm_provider
from app.rbac.dependencies import require_permission
from app.rbac.models import User, log_usage_event
from app.schemas import SolveRequest, SolveResponse
from app.solving import SolveError, build_solve_prompt, compute_ground_truth, parse_solution_steps

router = APIRouter(prefix="/api", tags=["solve"])


@router.post("/solve", response_model=SolveResponse)
async def solve(
    payload: SolveRequest,
    user: User = Depends(require_permission("use_solve")),
    _trial: User = Depends(check_trial_status),
) -> SolveResponse:
    log_usage_event(user.id, "solve")
    if (payload.range_min is None) != (payload.range_max is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide both range_min and range_max, or neither.",
        )

    try:
        ground_truth = compute_ground_truth(
            payload.latex,
            payload.range_min,
            payload.range_max,
            payload.range_min_inclusive,
            payload.range_max_inclusive,
        )
    except SolveError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    prompt = build_solve_prompt(payload.latex, ground_truth)
    provider = get_llm_provider()

    # An empty step list is rare but not impossible (e.g. the model replies
    # with only prose despite the instructions) — retry a couple of times
    # before giving up, since output isn't deterministic between calls.
    steps: list[str] = []
    for _ in range(3):
        raw_response = await provider.solve_equation(prompt)
        steps = parse_solution_steps(raw_response)
        if steps:
            break
    if not steps:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI did not return a usable step-by-step solution.",
        )

    return SolveResponse(
        steps=steps,
        is_differential=ground_truth.is_differential,
        classification=ground_truth.classification,
        final_answer=ground_truth.answer_latex,
        domain_note=ground_truth.domain_note,
    )
