"""FastAPI dependencies giving routers access to the services built in ``create_app``."""

from __future__ import annotations

from typing import cast

from fastapi import Request

from app.data.bar_service import BarService
from app.data.universe import Universe
from app.macro.service import MacroService
from app.storage.documents import DocumentStore
from app.storage.drawings import DrawingsRepository


def get_universe(request: Request) -> Universe:
    return cast("Universe", request.app.state.universe)


def get_bar_service(request: Request) -> BarService:
    return cast("BarService", request.app.state.bar_service)


def get_drawings(request: Request) -> DrawingsRepository:
    return cast("DrawingsRepository", request.app.state.drawings)


def get_layouts(request: Request) -> DocumentStore:
    return cast("DocumentStore", request.app.state.layouts)


def get_watchlists(request: Request) -> DocumentStore:
    return cast("DocumentStore", request.app.state.watchlists)


def get_macro_service(request: Request) -> MacroService:
    return cast("MacroService", request.app.state.macro_service)
