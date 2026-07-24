from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.auth import get_current_user
from app.calibration import get_calibration_samples
from app.google_auth import GoogleUser
from app.llm import get_llm_provider
from app.llm.base import HandwritingExample
from app.schemas import RecognizeResponse

router = APIRouter(prefix="/api", tags=["recognize"])

ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}


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

    provider = get_llm_provider()
    latex = await provider.recognize_equation(image_bytes, image.content_type, examples=examples or None)
    return RecognizeResponse(latex=latex)
