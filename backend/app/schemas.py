from pydantic import BaseModel


class GoogleLoginRequest(BaseModel):
    id_token: str


class LoginResponse(BaseModel):
    token: str
    name: str
    email: str


class RecognizeResponse(BaseModel):
    latex: str


class GraphRequest(BaseModel):
    latex: str


class CalibrationStatusResponse(BaseModel):
    sample_count: int


class CalibrationSampleResponse(BaseModel):
    id: int
