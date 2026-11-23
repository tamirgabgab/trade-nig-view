"""API tests in offline mode (fixture provider, test universe, fresh cache per test)."""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient


def test_symbols_lists_universe_in_order(client: TestClient) -> None:
    response = client.get("/api/symbols")
    assert response.status_code == 200
    assert [s["symbol"] for s in response.json()] == ["AAA", "^IDX", "BBB"]


def test_symbols_search_and_group_filter(client: TestClient) -> None:
    assert [s["symbol"] for s in client.get("/api/symbols", params={"query": "beta"}).json()] == [
        "BBB"
    ]
    assert [
        s["symbol"] for s in client.get("/api/symbols", params={"group": "indices"}).json()
    ] == ["^IDX"]


def test_daily_bars_from_fixture(client: TestClient) -> None:
    response = client.get("/api/bars", params={"symbol": "AAA", "adjusted": "false"})
    assert response.status_code == 200
    body = response.json()
    assert (body["symbol"], body["interval"], body["source"], body["stale"]) == (
        "AAA",
        "1D",
        "fixtures",
        False,
    )
    assert len(body["bars"]) == 19
    first = {"time": "2026-01-26", "open": 100.0, "high": 102.0, "low": 99.0, "close": 101.0}
    assert body["bars"][0] == {**first, "volume": 1000.0}


def test_adjusted_bars_apply_dividend_factor(client: TestClient) -> None:
    body = client.get("/api/bars", params={"symbol": "AAA"}).json()
    assert body["adjusted"] is True
    assert body["bars"][0]["close"] == 101.0 * 0.98
    assert body["bars"][-1]["close"] == 119.0  # after the dividend: factor 1


def test_weekly_bars_with_holiday_week(client: TestClient) -> None:
    body = client.get(
        "/api/bars", params={"symbol": "AAA", "interval": "1W", "adjusted": "false"}
    ).json()
    assert [b["time"] for b in body["bars"]] == [
        "2026-01-26",
        "2026-02-02",
        "2026-02-09",
        "2026-02-17",
    ]
    assert body["bars"][-1]["volume"] == sum(1000.0 * i for i in range(16, 20))


def test_limit_and_until(client: TestClient) -> None:
    body = client.get(
        "/api/bars", params={"symbol": "AAA", "limit": 2, "until": "2026-02-03"}
    ).json()
    assert [b["time"] for b in body["bars"]] == ["2026-02-02", "2026-02-03"]
    assert body["has_more_before"] is True


def test_hourly_bars_use_utc_seconds_and_daily_dividend_factor(client: TestClient) -> None:
    raw = client.get("/api/bars", params={"symbol": "AAA", "interval": "1h", "adjusted": "false"})
    assert raw.status_code == 200
    body = raw.json()
    assert body["interval"] == "1h"
    assert body["timezone"] == "America/New_York"
    assert body["adjusted"] is False
    assert len(body["bars"]) == 28
    assert body["bars"][0]["time"] == 1_770_301_800  # 2026-02-05 09:30 New York (14:30 UTC)

    adjusted = client.get("/api/bars", params={"symbol": "AAA", "interval": "1h"}).json()
    assert adjusted["adjusted"] is True
    # Sessions before the 2026-02-09 ex-dividend date carry the daily factor 0.98.
    assert adjusted["bars"][6]["close"] == pytest.approx(106.82)  # = adjusted daily close 02-05
    assert adjusted["bars"][-1]["close"] == pytest.approx(112.0)


def test_four_hour_bars_split_the_session_at_13_30(client: TestClient) -> None:
    body = client.get(
        "/api/bars", params={"symbol": "AAA", "interval": "4h", "adjusted": "false"}
    ).json()
    times = [bar["time"] for bar in body["bars"]]
    assert len(times) == 8
    assert times[1] - times[0] == 4 * 3600  # 09:30 and 13:30
    assert body["bars"][1]["close"] == pytest.approx(109.0)  # daily close of 2026-02-05
    assert body["bars"][0]["volume"] + body["bars"][1]["volume"] == pytest.approx(9002.0)


def test_hourly_without_fixture_is_503(client: TestClient) -> None:
    response = client.get("/api/bars", params={"symbol": "IDX", "interval": "1h"})
    assert response.status_code == 503
    assert "1h" in response.json()["detail"]


def test_unknown_symbol_is_problem_json_404(client: TestClient) -> None:
    response = client.get("/api/bars", params={"symbol": "NOPE"})
    assert response.status_code == 404
    assert response.json()["code"] == "symbol_not_found"


def test_symbol_without_data_is_503(client: TestClient) -> None:
    response = client.get("/api/bars", params={"symbol": "BBB"})
    assert response.status_code == 503
    assert response.json()["code"] == "data_unavailable"


def test_bad_interval_is_422(client: TestClient) -> None:
    response = client.get("/api/bars", params={"symbol": "AAA", "interval": "5m"})
    assert response.status_code == 422


def test_quotes_mix_success_and_errors(client: TestClient) -> None:
    response = client.get("/api/quotes", params={"symbols": "AAA, ^IDX,BBB,NOPE"})
    assert response.status_code == 200
    aaa, idx, bbb, nope = response.json()
    assert {k: aaa[k] for k in ("symbol", "time", "last", "change", "stale", "error")} == {
        "symbol": "AAA", "time": "2026-02-20", "last": 119.0, "change": 1.0,
        "stale": False, "error": None,
    }  # fmt: skip
    assert 1 < len(aaa["spark"]) <= 20
    assert aaa["spark"][-1] == 119.0
    assert aaa["day_low"] <= 119.0 <= aaa["day_high"]
    assert aaa["low_52w"] <= aaa["day_low"]
    assert aaa["high_52w"] >= aaa["day_high"]
    assert nope["spark"] == []
    assert nope["low_52w"] is None
    assert abs(aaa["change_pct"] - 100.0 / 118.0) < 1e-12
    assert idx["last"] == 5040.0
    assert bbb["error"] is not None
    assert nope["error"] == "unknown symbol"


def test_before_pages_backwards_without_gaps(client: TestClient) -> None:
    params = {"symbol": "AAA", "adjusted": "false"}
    full = client.get("/api/bars", params=params).json()["bars"]
    newest = client.get("/api/bars", params={**params, "limit": 5}).json()
    assert newest["has_more_before"] is True
    # The oldest loaded daily bar is a date; as a cursor it counts as 00:00 UTC of that day.
    cursor = 86_400 * (np.datetime64(newest["bars"][0]["time"], "D").astype(np.int64))
    older = client.get("/api/bars", params={**params, "limit": 5, "before": int(cursor)}).json()
    assert older["bars"] + newest["bars"] == full[-10:]
    assert older["has_more_before"] is True
    first = 86_400 * int(np.datetime64(full[0]["time"], "D").astype(np.int64))
    rest = client.get("/api/bars", params={**params, "before": first}).json()
    assert rest["bars"] == []
    assert rest["has_more_before"] is False


def test_before_pages_intraday_by_utc_seconds(client: TestClient) -> None:
    params = {"symbol": "AAA", "interval": "1h", "adjusted": "false"}
    full = client.get("/api/bars", params=params).json()["bars"]
    page = client.get("/api/bars", params={**params, "before": full[10]["time"]}).json()
    assert page["bars"] == full[:10]
    assert page["has_more_before"] is False


def test_heikin_ashi_pages_match_full_history(client: TestClient) -> None:
    params = {"symbol": "AAA", "adjusted": "false", "transform": "heikin_ashi"}
    full = client.get("/api/bars", params=params).json()
    assert full["transform"] == "heikin_ashi"
    raw = client.get("/api/bars", params={**params, "transform": "none"}).json()["bars"]
    b0 = raw[0]
    assert full["bars"][0]["close"] == pytest.approx(
        (b0["open"] + b0["high"] + b0["low"] + b0["close"]) / 4
    )
    # A later page continues the recursion from the true history start, not from its own first bar.
    newest = client.get("/api/bars", params={**params, "limit": 4}).json()["bars"]
    assert newest == full["bars"][-4:]
