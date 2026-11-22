"""FastAPI application factory.

Run with ``uv run uvicorn app.main:app --reload``.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import bars, health, quotes, symbols
from app.config import Settings, get_settings
from app.data.bar_service import BarService
from app.data.cache.bar_cache import BarCache
from app.data.providers.base import DataProvider
from app.data.providers.fixtures import FixtureProvider
from app.data.providers.tiingo import TiingoProvider
from app.data.providers.yahoo import YahooProvider
from app.data.universe import Universe
from app.errors import register_error_handlers

API_PREFIX = "/api"

logger = logging.getLogger(__name__)


def build_providers(settings: Settings) -> list[DataProvider]:
    """Provider chain from ``DATA_PROVIDERS``; OFFLINE=1 serves committed fixtures only."""
    if settings.offline:
        return [FixtureProvider(settings.fixtures_dir)]
    providers: list[DataProvider] = []
    for provider_id in settings.data_providers:
        if provider_id == "yahoo":
            providers.append(YahooProvider())
        elif provider_id == "tiingo":
            if settings.tiingo_api_key is None:
                logger.info("Tiingo disabled: TIINGO_API_KEY is not set")
                continue
            providers.append(TiingoProvider(settings.tiingo_api_key.get_secret_value()))
        else:
            logger.warning("Ignoring unknown data provider '%s' in DATA_PROVIDERS", provider_id)
    return providers


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the ASGI app. Tests pass their own ``settings``; production uses the environment."""
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level)

    app = FastAPI(
        title="ChartLab API",
        version=__version__,
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
    )
    app.dependency_overrides[get_settings] = lambda: settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.chartlab_cors_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )
    register_error_handlers(app)

    universe = Universe.load(settings.universe_file)
    app.state.universe = universe
    app.state.bar_service = BarService(
        universe,
        BarCache(settings.chartlab_data_dir / "bars.db"),
        build_providers(settings),
        refresh_ttl_s=settings.refresh_ttl_s,
    )

    for router in (health.router, symbols.router, bars.router, quotes.router):
        app.include_router(router, prefix=API_PREFIX)
    return app


app = create_app()
