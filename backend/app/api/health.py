"""``GET /api/health`` — liveness and configuration summary."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app import __version__
from app.api.deps import get_bar_service
from app.config import Settings, get_settings
from app.data.bar_service import BarService

router = APIRouter(tags=["health"])


class ProviderStatus(BaseModel):
    """One market-data provider in the active chain (in priority order)."""

    id: str
    enabled: bool


class HealthResponse(BaseModel):
    """Response body of ``GET /api/health``."""

    status: Literal["ok"]
    version: str
    offline: bool
    providers: list[ProviderStatus]


@router.get("/health", response_model=HealthResponse)
def health(
    settings: Annotated[Settings, Depends(get_settings)],
    service: Annotated[BarService, Depends(get_bar_service)],
) -> HealthResponse:
    """Report that the API is up, its version, offline mode and the active data providers."""
    return HealthResponse(
        status="ok",
        version=__version__,
        offline=settings.offline,
        providers=[ProviderStatus(id=pid, enabled=True) for pid in service.provider_ids],
    )
