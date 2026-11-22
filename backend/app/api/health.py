"""``GET /api/health`` — liveness and configuration summary."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app import __version__
from app.config import Settings, get_settings

router = APIRouter(tags=["health"])


class ProviderStatus(BaseModel):
    """Availability of one market-data provider (populated from R1 on)."""

    id: str
    enabled: bool


class HealthResponse(BaseModel):
    """Response body of ``GET /api/health``."""

    status: Literal["ok"]
    version: str
    offline: bool
    providers: list[ProviderStatus]


@router.get("/health", response_model=HealthResponse)
def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    """Report that the API is up, its version, and whether it runs in offline mode."""
    return HealthResponse(status="ok", version=__version__, offline=settings.offline, providers=[])
