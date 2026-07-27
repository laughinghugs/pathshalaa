from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.billing.trial import check_trial_status
from app.calibration import (
    ONBOARDING_SOURCE,
    count_calibration_samples,
    store_calibration_sample,
    store_correction,
)
from app.rbac.dependencies import require_permission
from app.rbac.models import User
from app.schemas import CalibrationSampleResponse, CalibrationStatusResponse

router = APIRouter(prefix="/api/calibration", tags=["calibration"])

ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}


async def _read_valid_image(image: UploadFile) -> bytes:
    if image.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image type")
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty image")
    return image_bytes


@router.get("/status", response_model=CalibrationStatusResponse)
def calibration_status(
    user: User = Depends(require_permission("use_canvas")),
    _trial: User = Depends(check_trial_status),
) -> CalibrationStatusResponse:
    return CalibrationStatusResponse(sample_count=count_calibration_samples(user.google_sub))


@router.post("/samples", response_model=CalibrationSampleResponse, status_code=status.HTTP_201_CREATED)
async def add_calibration_sample(
    label: str = Form(...),
    image: UploadFile = File(...),
    user: User = Depends(require_permission("use_canvas")),
    _trial: User = Depends(check_trial_status),
) -> CalibrationSampleResponse:
    label = label.strip()
    if not label:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Label is required")

    image_bytes = await _read_valid_image(image)
    sample_id = store_calibration_sample(
        user.google_sub, label, image_bytes, image.content_type, source=ONBOARDING_SOURCE
    )
    return CalibrationSampleResponse(id=sample_id)


@router.post("/corrections", response_model=CalibrationSampleResponse, status_code=status.HTTP_201_CREATED)
async def add_correction(
    corrected_label: str = Form(...),
    image: UploadFile = File(...),
    user: User = Depends(require_permission("use_canvas")),
    _trial: User = Depends(check_trial_status),
) -> CalibrationSampleResponse:
    corrected_label = corrected_label.strip()
    if not corrected_label:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Corrected label is required")

    image_bytes = await _read_valid_image(image)
    sample_id = store_correction(user.google_sub, image_bytes, image.content_type, corrected_label)
    return CalibrationSampleResponse(id=sample_id)
