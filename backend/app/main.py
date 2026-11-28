"""FastAPI application factory.

Run with ``uv run python -m uvicorn --factory app.main:create_app --reload``. Importing this
module must not create ``data/bars.db`` (tech debt T1), so ``app`` is built lazily.
"""

from __future__ import annotations

import logging
from typing import cast

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import (
    analysis,
    backtest,
    bars,
    drawings,
    forecast,
    health,
    home,
    indicators,
    layouts,
    learn,
    macro,
    planner,
    quotes,
    regime,
    risk,
    scenario,
    scenarios,
    simulate,
    strategies,
    symbols,
    synthetic,
    trade_plan,
    volatility,
    watchlists,
    withdraw,
    withdraw_study,
)
from app.backtest.python_loader import PythonStrategies
from app.config import Settings, get_settings
from app.data.bar_service import BarService
from app.data.cache.bar_cache import BarCache
from app.data.providers.base import DataProvider, ProviderError
from app.data.providers.fixtures import FixtureProvider
from app.data.providers.synthetic import SyntheticProvider
from app.data.providers.tiingo import TiingoProvider
from app.data.providers.yahoo import YahooProvider
from app.data.universe import Universe
from app.errors import register_error_handlers
from app.macro.boi import BoiSource
from app.macro.fixtures import MacroFixtureSource
from app.macro.service import MacroCache, MacroService
from app.models.bars import BarFrame
from app.models.synthetic import is_synthetic
from app.storage.documents import DocumentStore
from app.storage.drawings import DrawingsRepository
from app.storage.synthetic import SyntheticSymbols

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


def close_stores(app: FastAPI) -> None:
    """Close the connections to ``app.db`` an app opened (a throw-away app, before its data
    directory is deleted)."""
    for name in ("drawings", "layouts", "watchlists", "scenarios", "strategies", "synthetic"):
        getattr(app.state, name).close()


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

    app_db = settings.chartlab_data_dir / "app.db"
    app.state.synthetic = synthetic_symbols = SyntheticSymbols(app_db)
    universe = Universe.load(settings.universe_file).with_extra(synthetic_symbols)
    app.state.universe = universe
    app.state.macro_service = macro_service = MacroService(
        MacroCache(settings.chartlab_data_dir / "bars.db"),
        [MacroFixtureSource(settings.fixtures_dir)] if settings.offline else [BoiSource()],
        ttl_s=settings.macro_ttl_s,
    )

    def source_daily(symbol: str) -> tuple[BarFrame, bool, tuple[str, ...]]:
        """A shuffled copy's source: a market symbol's daily history (resolved again each time)."""
        info = universe.resolve(symbol)
        if info is None or is_synthetic(info):
            raise ProviderError(f"{symbol} is not a market symbol in the universe")
        cached = cast("BarService", app.state.bar_service).daily(info)
        return cached.frame, cached.stale, cached.warnings

    app.state.bar_service = BarService(
        universe,
        BarCache(settings.chartlab_data_dir / "bars.db"),
        build_providers(settings),
        refresh_ttl_s=settings.refresh_ttl_s,
        provider_limits=not settings.offline,
        synthetic=SyntheticProvider(synthetic_symbols.definition, macro_service.get, source_daily),
    )
    app.state.drawings = DrawingsRepository(app_db)
    app.state.layouts = DocumentStore(app_db, "layouts", layouts.LayoutNotFoundError)
    app.state.watchlists = DocumentStore(app_db, "watchlists", watchlists.WatchlistNotFoundError)
    app.state.scenarios = DocumentStore(app_db, "scenarios", scenarios.ScenarioNotFoundError)
    app.state.strategies = DocumentStore(app_db, "strategies", strategies.StrategyNotFoundError)
    app.state.python_strategies = PythonStrategies(settings.strategies_dir)

    for router in (
        health.router,
        symbols.router,
        synthetic.router,
        bars.router,
        quotes.router,
        indicators.router,
        learn.router,
        drawings.router,
        layouts.router,
        watchlists.router,
        analysis.router,
        forecast.router,
        volatility.router,
        trade_plan.router,
        risk.router,
        regime.router,
        macro.router,
        planner.router,
        home.router,
        scenario.router,
        scenarios.router,
        strategies.router,
        backtest.router,
        simulate.router,
        withdraw.router,
        withdraw_study.router,
    ):
        app.include_router(router, prefix=API_PREFIX)
    return app


def __getattr__(name: str) -> FastAPI:
    """Lazy ``app.main:app`` for launchers that predate ``--factory`` (e.g. a ``dev.ps1`` still in
    memory while it pulls this version). Importing the module stays side-effect free."""
    if name == "app":
        return create_app()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
