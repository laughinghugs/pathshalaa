from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.calibration import init_db as init_calibration_db
from app.config import get_settings
from app.routers import auth_router, calibration_router, graph_router, recognize_router

app = FastAPI(title="Pathshalaa API")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(recognize_router.router)
app.include_router(calibration_router.router)
app.include_router(graph_router.router)


@app.on_event("startup")
def on_startup() -> None:
    init_calibration_db()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
