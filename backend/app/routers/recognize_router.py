from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.auth import get_current_user
from app.calibration import get_calibration_samples
from app.commands import CommandValidationError, parse_ai_commands
from app.google_auth import GoogleUser
from app.llm import get_llm_provider
from app.llm.base import HandwritingExample
from app.plugins import build_recognition_prompt, get_active_plugins
from app.schemas import RecognizeResponse

router = APIRouter(prefix="/api", tags=["recognize"])

ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}

# Hardcoded to the math subject for this MVP. Structured so a future
# subject-selection param (e.g. from the request) just changes this list —
# nothing else in this function depends on which subjects are active.
ACTIVE_SUBJECT_IDS = ["math"]


@router.post("/recognize", response_model=RecognizeResponse)
async def recognize(
    image: UploadFile = File(...),
    user: GoogleUser = Depends(get_current_user),
) -> RecognizeResponse:
    if image.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image type")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty image")

    samples = get_calibration_samples(user.sub, limit=4)
    examples = [
        HandwritingExample(image_bytes=sample.image_bytes, mime_type=sample.mime_type, label=sample.label)
        for sample in samples
    ]

    active_plugins = get_active_plugins(ACTIVE_SUBJECT_IDS)
    prompt = build_recognition_prompt(active_plugins, has_examples=bool(examples))

    provider = get_llm_provider()
    raw_response = await provider.recognize_equation(
        image_bytes, image.content_type, prompt, examples=examples or None
    )

    allowed_types = {command_type for plugin in active_plugins for command_type in plugin.command_types}
    try:
        commands = parse_ai_commands(raw_response, allowed_types)
    except CommandValidationError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return RecognizeResponse(commands=[command.model_dump() for command in commands])
