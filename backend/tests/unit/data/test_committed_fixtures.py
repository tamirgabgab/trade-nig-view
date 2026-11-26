"""Universe-wide checks of the committed offline fixtures (``backend/fixtures``).

The files are produced by ``scripts/make-fixtures.ps1`` on a machine that can reach Yahoo. A
symbol whose file is missing is skipped (the generator reports download failures itself), so
this module passes on a fresh checkout and checks every file once they exist.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic_settings import SettingsConfigDict

from app.config import Settings
from app.data.providers.fixtures import fixture_filename, read_fixture, read_intraday_fixture
from app.data.sessions import session_days
from app.data.universe import Universe
from app.data.validate import validate_bars
from app.main import create_app
from app.models.bars import SECONDS_PER_DAY
from app.models.symbols import SymbolInfo


class RepoSettings(Settings):
    """Repo defaults (real universe and fixtures), ignoring the developer's ``.env``."""

    model_config = SettingsConfigDict(env_file=None)


DEFAULTS = RepoSettings()
FIXTURES = DEFAULTS.fixtures_dir
UNIVERSE = Universe.load(DEFAULTS.universe_file)
SYMBOLS = [info.symbol for info in UNIVERSE.symbols]
# Share of 1h sessions that must have a daily bar with the same session date. Not 100%: Yahoo
# occasionally serves a holiday session's hours without a daily bar, or the reverse.
MIN_SESSION_MATCH = 0.9


def fixture_path(interval_dir: str, symbol: str) -> Path:
    path = FIXTURES / interval_dir / fixture_filename(symbol)
    if not path.is_file():
        pytest.skip(f"no fixture {interval_dir}/{path.name} (run scripts/make-fixtures.ps1)")
    return path


def info_of(symbol: str) -> SymbolInfo:
    info = UNIVERSE.resolve(symbol)
    assert info is not None
    return info


@pytest.fixture(scope="module")
def client(tmp_path_factory: pytest.TempPathFactory) -> Iterator[TestClient]:
    settings = RepoSettings(offline=True, chartlab_data_dir=tmp_path_factory.mktemp("data"))
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.mark.parametrize("symbol", SYMBOLS)
def test_daily_fixture_is_clean(symbol: str) -> None:
    frame = read_fixture(fixture_path("daily", symbol))
    clean, report = validate_bars(frame, symbol=symbol)
    assert report.ok, report
    assert len(clean) == len(frame) > 0
    assert np.all(frame.adj_close > 0)


@pytest.mark.parametrize("symbol", SYMBOLS)
def test_hourly_fixture_is_clean_and_matches_daily_sessions(symbol: str) -> None:
    hourly = read_intraday_fixture(fixture_path("1h", symbol))
    clean, report = validate_bars(hourly, symbol=symbol)
    assert report.ok, report
    assert len(clean) == len(hourly) > 0
    assert np.all(hourly.time % 1800 == 0), "1h bars start on the hour or half hour"

    info = info_of(symbol)
    sessions = np.unique(session_days(hourly.time, info.timezone, info.session_start_minutes))
    daily_days = read_fixture(fixture_path("daily", symbol)).time // SECONDS_PER_DAY
    matched = np.isin(sessions, daily_days).mean()
    assert matched >= MIN_SESSION_MATCH, f"only {matched:.0%} of 1h sessions have a daily bar"


@pytest.mark.parametrize("interval", ["1h", "4h", "1D", "1W", "1M"])
@pytest.mark.parametrize("symbol", SYMBOLS)
def test_api_serves_every_interval_offline(client: TestClient, symbol: str, interval: str) -> None:
    fixture_path("1h" if interval in ("1h", "4h") else "daily", symbol)
    fixture_path("daily", symbol)
    response = client.get("/api/bars", params={"symbol": symbol, "interval": interval})
    assert response.status_code == 200, response.text
    bars = response.json()["bars"]
    assert len(bars) > 0
    times = [bar["time"] for bar in bars]
    assert times == sorted(times)
    for bar in bars:
        assert bar["low"] <= min(bar["open"], bar["close"]) <= max(bar["open"], bar["close"])
        assert max(bar["open"], bar["close"]) <= bar["high"]
