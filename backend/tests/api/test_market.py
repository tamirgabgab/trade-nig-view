"""API tests in offline mode (fixture provider, test universe, fresh cache per test)."""

from __future__ import annotations

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
    assert aaa == {
        "symbol": "AAA", "time": "2026-02-20", "last": 119.0, "change": 1.0,
        "change_pct": aaa["change_pct"], "stale": False, "error": None,
    }  # fmt: skip
    assert abs(aaa["change_pct"] - 100.0 / 118.0) < 1e-12
    assert idx["last"] == 5040.0
    assert bbb["error"] is not None
    assert nope["error"] == "unknown symbol"
