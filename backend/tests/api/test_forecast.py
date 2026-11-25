"""``GET /api/forecast`` on the synthetic e2e universe (offline)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi.testclient import TestClient

from app.analysis import forecast as fc
from app.api.forecast import EVALUATE_BARS
from tests.api.conftest import E2E_DATA


def forecast(client: TestClient, status: int = 200, **params: str | int | float | bool) -> Any:
    response = client.get("/api/forecast", params={"symbol": "AAPL", **params})
    assert response.status_code == status, response.text
    return response.json()


def test_quantiles_of_the_next_k_bars_and_the_validation(e2e_client: TestClient) -> None:
    body = forecast(e2e_client, k=3, auto=False, window=500, ridge=100, lags=3)
    assert body["model"] == "c"
    assert body["auto"] is False
    assert body["params"] == {"window": 500, "ridge": 100.0, "lags": 3}
    assert body["levels"] == list(fc.LEVELS)
    assert [hz["h"] for hz in body["horizons"]] == [1, 2, 3]
    for hz in body["horizons"]:
        for column in ("open", "high", "low", "close"):
            q = hz[column]
            assert len(q) == len(fc.LEVELS)
            assert q == sorted(q)
        median = fc.LEVELS.index(0.5)
        assert hz["low"][median] <= hz["close"][median] <= hz["high"][median]
        assert len(hz["close_percentiles"]) == 99
        assert hz["close_percentiles"] == sorted(hz["close_percentiles"])
        assert 0 <= hz["p_up"] <= 1
        assert hz["expected_range"] > 0
    # The 95 % interval of the close widens with the horizon.
    widths = [hz["close"][-1] - hz["close"][0] for hz in body["horizons"]]
    assert widths == sorted(widths)
    models = {(v["model"], v["h"]) for v in body["validation"]}
    assert models == {(m, h) for m in ("naive", "a", "c") for h in (1, 2, 3)}
    for v in body["validation"]:
        assert v["n"] == 500
        assert len(v["coverage"]) == 3
        assert len(v["pit"]) == 10
        assert abs(sum(v["pit"]) - 1) < 1e-9
        assert v["hit_rate"] is None or 0.3 < v["hit_rate"] < 0.7  # no model knows the way
    assert len(body["coefficients"]) == len(fc.feature_names(3))
    assert body["tuning"] == []


def test_auto_tunes_and_reports_the_best_grid_points(e2e_client: TestClient) -> None:
    body = forecast(e2e_client, k=1, model="a")
    assert body["auto"] is True
    assert body["model"] == "a"
    assert 1 <= len(body["tuning"]) <= 5
    best = body["tuning"][0]
    assert best["params"] == body["params"]
    assert [t["pinball"] for t in body["tuning"]] == sorted(t["pinball"] for t in body["tuning"])


def test_replay_cursor_ends_the_history(e2e_client: TestClient) -> None:
    body = forecast(e2e_client, k=2, auto=False, until="2024-01-02")
    assert body["last_time"] <= "2024-01-02"
    bars = e2e_client.get(
        "/api/bars", params={"symbol": "AAPL", "until": "2024-01-02", "limit": 1}
    ).json()["bars"]
    assert body["last_time"] == bars[-1]["time"]
    assert body["last_close"] == bars[-1]["close"]


def test_too_little_history_is_422(e2e_client: TestClient) -> None:
    rows = (E2E_DATA / "daily" / "AAPL.csv").read_text(encoding="utf-8").splitlines()
    # until is inclusive: a cursor at the 50th bar of the history leaves too few bars.
    body = forecast(e2e_client, 422, auto=False, until=rows[51].split(",")[0])
    assert body["code"] == "not_enough_history"


def test_parameters_are_validated(e2e_client: TestClient) -> None:
    # A manual window below the minimum training rows is a parameter error, not a data one.
    assert forecast(e2e_client, 422, auto=False, window=30)["code"] == "invalid_params"
    assert forecast(e2e_client, 422, k=0)["status"] == 422
    assert forecast(e2e_client, 422, model="b")["status"] == 422
    assert forecast(e2e_client, 422, lags=11)["status"] == 422


def test_the_cache_follows_the_bars_not_only_their_count(e2e_client: TestClient) -> None:
    """Same request twice: the cached response. Another replay cursor (other bars): recomputed."""
    a = forecast(e2e_client, k=1, auto=False, until="2024-01-02")
    assert forecast(e2e_client, k=1, auto=False, until="2024-01-02") == a
    b = forecast(e2e_client, k=1, auto=False, until="2024-01-03")
    assert b["last_time"] != a["last_time"]
    assert b["horizons"] != a["horizons"]


def test_auto_tuning_is_scored_before_the_validated_bars() -> None:
    """The tuning origins end where the validation origins begin (no in-sample scores)."""
    n = 2000
    validated = fc.eval_origins(n, 1, EVALUATE_BARS)
    tuning = fc.eval_origins(n, 1, EVALUATE_BARS, skip=EVALUATE_BARS)
    assert tuning[-1] + 1 == validated[0]
    assert len(tuning) == len(validated) == EVALUATE_BARS


def test_origin_starts_the_forecast_at_that_bar(e2e_client: TestClient) -> None:
    """Replay: the forecast is made at the cursor bar (its open time), whatever the interval."""
    bars = e2e_client.get(
        "/api/bars", params={"symbol": "AAPL", "until": "2024-01-10", "limit": 3}
    ).json()["bars"]
    middle = bars[1]
    origin = int(datetime.fromisoformat(f"{middle['time']}T00:00:00+00:00").timestamp())
    body = forecast(e2e_client, k=2, auto=False, origin=origin)
    assert body["last_time"] == middle["time"]
    assert body["last_close"] == middle["close"]


def test_the_learn_widget_forecasts_a_synthetic_scenario(client: TestClient) -> None:
    response = client.post(
        "/api/learn/forecast",
        json={
            "source": {"kind": "synthetic", "scenario": "volatility_regime", "bars": 1500},
            "k": 3,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["symbol"] == "volatility_regime"
    assert body["auto"] is True
    assert [hz["h"] for hz in body["horizons"]] == [1, 2, 3]
