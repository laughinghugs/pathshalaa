from typing import Any

from pydantic import BaseModel


class GoogleLoginRequest(BaseModel):
    id_token: str


class LoginResponse(BaseModel):
    token: str
    name: str
    email: str


class RecognizeResponse(BaseModel):
    # Already-validated AICommand dicts (see app/commands.py) — plain dicts
    # here rather than the AICommand union itself, since they're validated
    # and dumped upstream in recognize_router.py.
    commands: list[dict[str, Any]]


class GraphRequest(BaseModel):
    latex: str


class SolveRequest(BaseModel):
    latex: str


class SolveResponse(BaseModel):
    steps: list[str]
    is_differential: bool
    classification: str
    final_answer: str


class CalibrationStatusResponse(BaseModel):
    sample_count: int


class CalibrationSampleResponse(BaseModel):
    id: int
