"""FastAPI application entry point.

Sets up middleware, routers, exception handlers, and OpenAPI configuration.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration

from app.core.settings import get_settings

settings = get_settings()

logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """App startup/shutdown hooks."""
    logger.info("Starting Boet API in %s mode", settings.APP_ENV)

    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            integrations=[FastApiIntegration()],
            traces_sample_rate=0.1 if settings.is_production else 1.0,
            environment=settings.APP_ENV,
        )
        logger.info("Sentry initialized")

    yield

    logger.info("Shutting down Boet API")


app = FastAPI(
    title="Boet API",
    description="Boet – familjeapp backend",
    version="0.1.0",
    lifespan=lifespan,
    # OpenAPI is exposed at /api/docs (Swagger UI) and /api/openapi.json
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS – allow the frontend in development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.APP_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health", tags=["meta"])
async def health() -> dict[str, str]:
    """Health check endpoint. Used by Cloud Run probes and CI."""
    return {"status": "ok", "version": app.version}


from app.auth.router import router as auth_router
from app.calendar.router import router as calendar_router
from app.chat.router import router as chat_router
from app.families.invite_router import router as invites_router
from app.families.router import router as families_router

app.include_router(auth_router, prefix="/api/v1/users", tags=["users"])
app.include_router(families_router, prefix="/api/v1/families", tags=["families"])
app.include_router(calendar_router, prefix="/api/v1/families", tags=["calendar"])
app.include_router(chat_router, prefix="/api/v1/families", tags=["chat"])
app.include_router(invites_router, prefix="/api/v1/invites", tags=["invites"])

# Future routers (uncomment as modules are implemented):
# from app.dashboard.router import router as dashboard_router
# from app.billing.router import router as billing_router
