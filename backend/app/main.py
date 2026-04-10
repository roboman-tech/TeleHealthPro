import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    admin,
    appointments,
    auth,
    clinical,
    fhir,
    notifications,
    providers,
    records,
    telehealth,
    websocket_notifications,
    websocket_telehealth,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    import app.models  # noqa: F401 — metadata for Alembic / runtime
    import app.domain.lifecycle  # noqa: F401 — canonical appointment/session semantics (docstring)
    from app.services.clinical_repository import init_schema

    logger.info("Schema: run `alembic upgrade head` when deploying.")
    await init_schema()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(providers.router)
    app.include_router(records.router)
    app.include_router(clinical.router)
    app.include_router(appointments.router)
    app.include_router(notifications.router)
    app.include_router(telehealth.router)
    app.include_router(admin.router)
    app.include_router(fhir.router)
    app.include_router(websocket_notifications.router)
    app.include_router(websocket_telehealth.router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
