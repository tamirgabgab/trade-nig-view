"""FastAPI dependencies giving routers access to the services built in ``create_app``."""

from __future__ import annotations

from typing import cast

from fastapi import Request

from app.data.bar_service import BarService
from app.data.universe import Universe


def get_universe(request: Request) -> Universe:
    return cast("Universe", request.app.state.universe)


def get_bar_service(request: Request) -> BarService:
    return cast("BarService", request.app.state.bar_service)
