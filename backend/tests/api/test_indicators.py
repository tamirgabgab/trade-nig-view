"""``GET /api/indicators`` and ``POST /api/indicators/compute``."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data.sessions import session_days
from app.indicators.catalog import CATALOG
from app.main import create_app
from app.models.bars import date_to_ts
from tests.conftest import IsolatedSettings
from tests.golden.models import golden_ema, golden_sma, golden_vwap

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
        "option_labels": [],
        "requires": None,
    }
    assert ema["params"][1]["options"][:3] == ["close", "open", "high"]
    assert ema["outputs"][0]["plot"] == "line"
    assert ema["level_fill"] is None
    assert by_id["rsi"]["level_fill"] == [30.0, 70.0]


def test_lists_ma_types_with_display_names(client: TestClient) -> None:
    by_id = {item["id"]: item for item in client.get("/api/indicators").json()}
    assert len(by_id) == 29
    ma_type = by_id["ma"]["params"][0]
    assert ma_type["name"] == "ma_type"
    assert ma_type["type"] == "enum"
    assert ma_type["default"] == "sma"
    assert ma_type["options"][:4] == ["sma", "ema", "wma", "smma"]
    assert ma_type["option_labels"][:4] == ["SMA", "EMA", "WMA", "SMMA (RMA)"]
    assert len(ma_type["options"]) == len(ma_type["option_labels"]) == 15
    crosses = by_id["ma_cross"]["outputs"][2]
    assert crosses["plot"] == "markers"
    assert crosses["style"] == {"up": "#089981", "down": "#F23645"}
    assert by_id["envelope"]["category"] == "bands"
    assert {by_id[i]["category"] for i in ("prev_hlc", "pivots")} == {"structure"}
    assert by_id["prev_hlc"]["params"][0]["options"] == ["day", "week", "month"]
    assert by_id["pivots"]["outputs"][0]["style"] == {"shape": "circle", "position": "above"}
    assert [o["name"] for o in by_id["envelope"]["outputs"]] == ["upper", "basis", "lower"]


def test_ma_cross_marks_crossings(long_client: TestClient) -> None:
    body = long_client.post(
        "/api/indicators/compute",
        json={"symbol": "AAPL", "id": "ma_cross", "start": epoch("2024-01-02")},
    ).json()
    fast = np.array([np.nan if v is None else v for v in body["outputs"]["fast"]])
    slow = np.array([np.nan if v is None else v for v in body["outputs"]["slow"]])
    marks = body["outputs"]["crosses"]
    assert set(marks) <= {None, 1.0, -1.0}
    assert {1.0, -1.0} <= set(marks)
    for t, mark in enumerate(marks):
        if mark is not None and t > 0:
            assert np.sign(fast[t] - slow[t]) == mark
            assert np.sign(fast[t - 1] - slow[t - 1]) != mark
    assert body["lookback"] == 25 * 21


def test_envelope_with_an_ema_basis(long_client: TestClient) -> None:
    params = {"length": 10, "percent": 5.0, "ma_type": "ema"}
    body = long_client.post(
        "/api/indicators/compute", json={"symbol": "MSFT", "id": "envelope", "params": params}
    ).json()
    bars = long_client.get("/api/bars", params={"symbol": "MSFT"}).json()["bars"]
    expected = golden_ema([bar["close"] for bar in bars], 10)
    np.testing.assert_allclose(body["outputs"]["basis"][9:], expected[9:], rtol=1e-12)
    np.testing.assert_allclose(
        body["outputs"]["upper"][9:], np.array(expected[9:]) * 1.05, rtol=1e-12
    )
    assert body["warmup"] == 9


def test_hma_length_one_is_a_422(client: TestClient) -> None:
    response = client.post(
        "/api/indicators/compute",
        json={"symbol": "AAA", "id": "ma", "params": {"ma_type": "hma", "length": 1}},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_params"


def test_kama_lookback_covers_its_slow_seed(client: TestClient) -> None:
    body = client.post("/api/indicators/compute", json={"symbol": "AAA", "id": "kama"}).json()
    assert body["lookback"] == int(25 * (31 / 2) ** 2) + 10


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


def _nan(values: list[float | None]) -> np.ndarray:
    return np.array([np.nan if v is None else v for v in values], dtype=np.float64)


def _stress_params(indicator: str) -> dict[str, object]:
    """Inputs that need the most history: a large plot offset where there is one."""
    stress: dict[str, dict[str, object]] = {
        "ma": {"ma_type": "ema", "length": 9, "offset": 400},
        "t3": {"length": 5, "offset": 300},
        "kama": {"length": 10, "fast": 30, "slow": 30},
        "rsi": {"ma_type": "ema", "bb": True},
        "macd": {"signal_ma_type": "smma", "osc_ma_type": "wma"},
        "atr": {"ma_type": "ema"},
    }
    params = dict(stress.get(indicator, {}))
    names = {p.name for p in CATALOG[indicator].params}
    if "offset" in names and indicator != "lsma" and "offset" not in params:
        params = {**params, "offset": 500}
    return params


@pytest.mark.parametrize("indicator", sorted(CATALOG))
def test_every_indicator_window_matches_the_full_history(
    long_client: TestClient, indicator: str
) -> None:
    """The lookback contract for every spec, including large plot offsets (the offset moves older
    values into the window, so it needs that much more history)."""
    request = {"symbol": "AAPL", "id": indicator, "params": _stress_params(indicator)}
    full = long_client.post("/api/indicators/compute", json=request).json()
    window = long_client.post(
        "/api/indicators/compute", json={**request, "start": epoch("2025-03-03")}
    ).json()
    first = full["time"].index("2025-03-03")
    for name, values in window["outputs"].items():
        expected = _nan(full["outputs"][name][first:])
        np.testing.assert_allclose(_nan(values), expected, rtol=1e-9, equal_nan=True, err_msg=name)


def test_offset_adds_to_the_lookback(client: TestClient) -> None:
    body = client.post(
        "/api/indicators/compute",
        json={"symbol": "AAA", "id": "sma", "params": {"length": 9, "offset": 500}},
    ).json()
    assert body["lookback"] == 250 + 500


def test_lsma_regression_offset_needs_no_extra_history(client: TestClient) -> None:
    body = client.post(
        "/api/indicators/compute",
        json={"symbol": "AAA", "id": "lsma", "params": {"length": 9, "offset": 500}},
    ).json()
    assert body["lookback"] == 250


def test_kama_rejects_fast_longer_than_slow(client: TestClient) -> None:
    response = client.post(
        "/api/indicators/compute",
        json={"symbol": "AAA", "id": "kama", "params": {"fast": 60, "slow": 30}},
    )
    assert response.status_code == 422
    assert "'fast'" in response.json()["detail"]


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


def test_response_of_a_linear_ma(client: TestClient) -> None:
    response = client.post("/api/indicators/response", json={"id": "sma", "params": {"length": 9}})
    assert response.status_code == 200
    body = response.json()
    assert body["params"] == {"length": 9, "source": "close", "offset": 0}
    (out,) = body["outputs"]
    assert out["linear"] is True
    assert out["lag"] == pytest.approx(4.0)
    assert out["impulse"][:9] == pytest.approx([1 / 9] * 9)
    assert len(out["frequency"]["period"]) == len(out["frequency"]["magnitude_db"])


def test_response_of_an_adaptive_ma_has_no_impulse(client: TestClient) -> None:
    (out,) = client.post("/api/indicators/response", json={"id": "kama"}).json()["outputs"]
    assert out["linear"] is False
    assert out["reason"]
    assert out["impulse"] is None
    assert out["frequency"] is None
    assert out["step"]


def test_response_rejects_unknown_indicators_and_bad_params(client: TestClient) -> None:
    unknown = client.post("/api/indicators/response", json={"id": "nope"})
    assert unknown.status_code == 404
    bad = client.post("/api/indicators/response", json={"id": "sma", "params": {"length": 0}})
    assert bad.status_code == 422


def test_vwap_resets_each_session_on_intraday_bars(client: TestClient) -> None:
    bars = client.get("/api/bars", params={"symbol": "AAA", "interval": "1h"}).json()["bars"]
    body = client.post(
        "/api/indicators/compute",
        json={"symbol": "AAA", "interval": "1h", "id": "vwap", "params": {"source": "close"}},
    ).json()
    times = np.array([bar["time"] for bar in bars], dtype=np.int64)
    sessions = session_days(times, "America/New_York").tolist()
    closes = [bar["close"] for bar in bars]
    expected = golden_vwap(closes, [bar["volume"] for bar in bars], sessions)
    np.testing.assert_allclose(body["outputs"]["vwap"], expected, rtol=1e-12)
    first_bars = [i for i in range(len(bars)) if i == 0 or sessions[i] != sessions[i - 1]]
    assert len(first_bars) > 1
    assert all(body["outputs"]["vwap"][i] == pytest.approx(closes[i]) for i in first_bars)


@pytest.mark.parametrize("interval", ["1h", "4h"])
def test_vwap_window_starting_mid_history_matches_the_full_history(
    client: TestClient, interval: str
) -> None:
    request = {"symbol": "AAA", "interval": interval, "id": "vwap"}
    full = client.post("/api/indicators/compute", json=request).json()
    middle = full["time"][len(full["time"]) // 2 + 1]
    window = client.post("/api/indicators/compute", json={**request, "start": middle}).json()
    first = full["time"].index(middle)
    np.testing.assert_allclose(window["outputs"]["vwap"], full["outputs"]["vwap"][first:])


def test_vwap_is_empty_on_daily_bars(client: TestClient) -> None:
    body = client.post("/api/indicators/compute", json={"symbol": "AAA", "id": "vwap"}).json()
    assert body["time"]
    assert set(body["outputs"]["vwap"]) == {None}


def test_pivots_are_drawn_right_bars_to_the_left(long_client: TestClient) -> None:
    body = long_client.post(
        "/api/indicators/compute",
        json={"symbol": "NVDA", "id": "pivots", "params": {"left": 3, "right": 4}},
    ).json()
    assert body["display_shift"] == 4
    assert body["warmup"] == 7
    bars = long_client.get("/api/bars", params={"symbol": "NVDA", "limit": 50_000}).json()["bars"]
    highs = body["outputs"]["high"]
    confirmed = [t for t, v in enumerate(highs) if v is not None]
    assert confirmed
    assert all(highs[t] == bars[t - 4]["high"] for t in confirmed)


def test_other_indicators_have_no_display_shift(client: TestClient) -> None:
    body = client.post("/api/indicators/compute", json={"symbol": "AAA", "id": "sma"}).json()
    assert body["display_shift"] == 0


def test_prev_hlc_on_hourly_bars(client: TestClient) -> None:
    bars = client.get("/api/bars", params={"symbol": "AAA", "interval": "1h"}).json()["bars"]
    body = client.post(
        "/api/indicators/compute", json={"symbol": "AAA", "interval": "1h", "id": "prev_hlc"}
    ).json()
    assert body["lookback"] == 10**9
    days = [bar["time"] // 86_400 for bar in bars]
    first_day = [b for b, d in zip(bars, days, strict=True) if d == days[0]]
    second = next(i for i, d in enumerate(days) if d != days[0])
    assert body["outputs"]["high"][:second] == [None] * second
    assert body["outputs"]["high"][second] == max(b["high"] for b in first_day)
    assert body["outputs"]["close"][second] == first_day[-1]["close"]


def test_obv_loads_the_whole_history(client: TestClient) -> None:
    body = client.post(
        "/api/indicators/compute",
        json={"symbol": "AAA", "id": "obv", "start": epoch("2026-02-02")},
    ).json()
    assert body["lookback"] == 10**9
    full = client.post("/api/indicators/compute", json={"symbol": "AAA", "id": "obv"}).json()
    assert body["outputs"]["obv"] == full["outputs"]["obv"][-len(body["time"]) :]


@pytest.mark.parametrize("indicator", sorted(CATALOG))
def test_response_endpoint_serves_every_indicator(client: TestClient, indicator: str) -> None:
    response = client.post("/api/indicators/response", json={"id": indicator})
    assert response.status_code == 200


def test_only_vwap_is_intraday_only(client: TestClient) -> None:
    infos = client.get("/api/indicators").json()
    assert {i["id"] for i in infos if i["intraday_only"]} == {"vwap"}
