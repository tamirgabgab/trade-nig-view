"""``GET /api/indicators`` and ``POST /api/indicators/compute``."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models.bars import date_to_ts
from tests.conftest import IsolatedSettings
from tests.golden.models import golden_ema, golden_sma

E2E_DATA = Path(__file__).resolve().parents[3] / "frontend" / "e2e" / "data"


@pytest.fixture
def long_client(tmp_path: Path) -> Iterator[TestClient]:
    """The synthetic e2e universe: thousands of daily bars per symbol (lookback needs history)."""
    settings: Settings = IsolatedSettings(
        offline=True,
        chartlab_data_dir=tmp_path / "data",
        universe_file=E2E_DATA / "universe.toml",
        fixtures_dir=E2E_DATA,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def epoch(day: str) -> int:
    return date_to_ts(date.fromisoformat(day))


def test_lists_the_registry(client: TestClient) -> None:
    response = client.get("/api/indicators")
    assert response.status_code == 200
    body = response.json()
    by_id = {item["id"]: item for item in body}
    assert {"sma", "ema", "wma", "smma"} <= by_id.keys()
    ema = by_id["ema"]
    assert ema["category"] == "moving_averages"
    assert ema["overlay"] is True
    assert ema["learn_slug"] == "ema"
    assert [p["name"] for p in ema["params"]] == ["length", "source", "offset"]
    length = ema["params"][0]
    assert length == {
        "name": "length",
        "type": "int",
        "default": 9,
        "label": "Length",
        "min": 1.0,
        "max": 5000.0,
        "step": 1.0,
        "options": [],
    }
    assert ema["params"][1]["options"][:3] == ["close", "open", "high"]
    assert ema["outputs"][0]["plot"] == "line"


def test_computes_on_all_bars_with_defaults(client: TestClient) -> None:
    bars = client.get("/api/bars", params={"symbol": "AAA"}).json()["bars"]
    response = client.post("/api/indicators/compute", json={"symbol": "AAA", "id": "sma"})
    assert response.status_code == 200
    body = response.json()
    assert body["params"] == {"source": "close", "length": 9, "offset": 0}
    assert body["time"] == [bar["time"] for bar in bars]
    values = body["outputs"]["ma"]
    assert values[:8] == [None] * 8
    expected = golden_sma([bar["close"] for bar in bars], 9)
    np.testing.assert_allclose(values[8:], expected[8:], rtol=1e-12)
    assert body["warmup"] == 8
    assert body["lookback"] == 250


def test_start_end_window_matches_the_full_history(long_client: TestClient) -> None:
    """The lookback contract: values inside [start, end] equal a full-history computation."""
    request = {"symbol": "AAPL", "id": "smma", "params": {"length": 9}}
    full = long_client.post("/api/indicators/compute", json=request).json()
    window = long_client.post(
        "/api/indicators/compute",
        json={**request, "start": epoch("2025-03-03"), "end": epoch("2026-06-30")},
    ).json()
    assert window["time"][0] == "2025-03-03"
    assert window["time"][-1] == "2026-06-30"
    first = full["time"].index("2025-03-03")
    expected = full["outputs"]["ma"][first : first + len(window["time"])]
    np.testing.assert_allclose(window["outputs"]["ma"], expected, rtol=1e-9)


def test_ema_window_equals_golden_full_history(long_client: TestClient) -> None:
    bars = long_client.get(
        "/api/bars", params={"symbol": "NVDA", "limit": 50_000, "adjusted": "false"}
    ).json()["bars"]
    golden = golden_ema([bar["close"] for bar in bars], 50)
    body = long_client.post(
        "/api/indicators/compute",
        json={
            "symbol": "NVDA",
            "id": "ema",
            "params": {"length": 50},
            "adjusted": False,
            "start": epoch("2026-01-02"),
        },
    ).json()
    assert body["lookback"] == 1250
    first = [bar["time"] for bar in bars].index(body["time"][0])
    np.testing.assert_allclose(body["outputs"]["ma"], golden[first:], rtol=1e-9)


def test_until_hides_later_bars(client: TestClient) -> None:
    body = client.post(
        "/api/indicators/compute",
        json={"symbol": "AAA", "id": "ema", "params": {"length": 3}, "until": "2026-02-05"},
    ).json()
    assert body["time"][-1] <= "2026-02-05"


def test_heikin_ashi_bars_feed_the_indicator(client: TestClient) -> None:
    ha = client.get("/api/bars", params={"symbol": "AAA", "transform": "heikin_ashi"}).json()
    body = client.post(
        "/api/indicators/compute",
        json={"symbol": "AAA", "id": "sma", "params": {"length": 1}, "transform": "heikin_ashi"},
    ).json()
    np.testing.assert_allclose(body["outputs"]["ma"], [bar["close"] for bar in ha["bars"]])


def test_intraday_times_are_epoch_seconds(client: TestClient) -> None:
    bars = client.get("/api/bars", params={"symbol": "AAA", "interval": "1h"}).json()["bars"]
    body = client.post(
        "/api/indicators/compute",
        json={"symbol": "AAA", "interval": "1h", "id": "wma", "params": {"length": 2}},
    ).json()
    assert body["time"] == [bar["time"] for bar in bars]
    assert isinstance(body["time"][0], int)


def test_invalid_params_are_a_problem_json_422(client: TestClient) -> None:
    response = client.post(
        "/api/indicators/compute",
        json={"symbol": "AAA", "id": "sma", "params": {"length": 0}},
    )
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "invalid_params"
    assert "'length' must be >= 1" in response.json()["detail"]


def test_unknown_indicator_and_symbol_are_404(client: TestClient) -> None:
    unknown = client.post("/api/indicators/compute", json={"symbol": "AAA", "id": "zzz"})
    assert unknown.status_code == 404
    assert unknown.json()["code"] == "indicator_not_found"
    missing = client.post("/api/indicators/compute", json={"symbol": "NOPE", "id": "sma"})
    assert missing.status_code == 404
    assert missing.json()["code"] == "symbol_not_found"


def test_empty_window_returns_no_bars(client: TestClient) -> None:
    body = client.post(
        "/api/indicators/compute",
        json={"symbol": "AAA", "id": "sma", "start": epoch("2030-01-01")},
    ).json()
    assert body["time"] == []
    assert body["outputs"] == {"ma": []}
