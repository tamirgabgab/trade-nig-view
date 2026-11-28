"""``POST /api/backtest`` (B1): the engine behind the API, on the long e2e histories."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
import pytest
from fastapi.testclient import TestClient

from tests.api.test_strategies import SMA_CROSS

EXAMPLE_NAME = "Example: MA 20/50 cross with the weekly trend"


def _run(api: TestClient, strategy: dict[str, Any], **extra: Any) -> Any:
    return api.post("/api/backtest", json={"symbol": "AAPL", "strategy": strategy, **extra})


def _example(api: TestClient) -> dict[str, Any]:
    examples = api.get("/api/strategies").json()["examples"]
    return next(e["strategy"] for e in examples if e["name"] == EXAMPLE_NAME)


def test_an_example_strategy(api: TestClient) -> None:
    response = _run(api, _example(api))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["interval"] == "1D"
    assert (body["capital"], body["max_trades"], body["reversal_window"]) == (100_000, 10, 20)
    n = body["bars"]
    assert len(body["time"]) == len(body["equity"]) == len(body["buy_and_hold_equity"]) == n
    s = body["strategy"]
    assert s["trades"] == len(body["trades"]) > 5
    assert s["net_profit"] == pytest.approx(body["equity"][-1] - 100_000)
    growth = np.prod([1 + t["ret"] for t in body["trades"]])
    assert body["equity"][-1] == pytest.approx(100_000 * growth, rel=1e-9)
    assert body["buy_and_hold"]["trades"] == 1
    assert body["buy_and_hold"]["exposure"] == 1
    assert set(body["hindsight"]) == {"net_profit", "total_return", "cagr"}
    first = body["trades"][0]
    assert first["side"] in ("long", "short")
    assert isinstance(first["entry_time"], str)
    assert first["entry_time"] <= first["exit_time"]
    assert {"reversed", "closed", "held", "scores"} <= set(body["decisions"])


def test_costs_lower_the_net_result(api: TestClient) -> None:
    example = _example(api)
    free = _run(api, example, settings={"cost_pct": 0}).json()["strategy"]["net_profit"]
    paid = _run(api, example, settings={"cost_pct": 0.5}).json()["strategy"]["net_profit"]
    assert paid < free


def test_start_and_until_cut_the_bars(api: TestClient) -> None:
    body = _run(api, SMA_CROSS, start="2015-01-01", until="2020-12-31").json()
    assert body["time"][0] >= "2015-01-01"
    assert body["time"][-1] <= "2020-12-31"
    assert all("2015-01-01" <= t["entry_time"] <= "2020-12-31" for t in body["trades"])


def test_a_python_strategy_and_a_cap(api: TestClient) -> None:
    py = {
        "kind": "python",
        "profile": "position",
        "module": "breakout_weekly_trend",
        "max_trades": 1,
    }
    body = _run(api, py).json()
    assert body["max_trades"] == 1
    months = [t["entry_time"][:7] for t in body["trades"]]
    assert len(months) == len(set(months))  # at most one entry a month


def test_a_day_strategy_is_flat_at_every_close(api: TestClient) -> None:
    day = SMA_CROSS | {"profile": "day", "indicators": [{"id": "sma", "params": {"length": 6}}]}
    response = _run(api, day)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["interval"] == "5m"
    trades = body["trades"]
    assert trades
    zone = ZoneInfo("America/New_York")

    def day_of(ts: int) -> object:
        return datetime.fromtimestamp(ts, UTC).astimezone(zone).date()

    assert all(day_of(t["entry_time"]) == day_of(t["exit_time"]) for t in trades)
    assert "session" in {t["reason"] for t in trades}


@pytest.mark.parametrize(
    ("extra", "status", "code"),
    [
        ({"start": "2099-01-01"}, 422, "too_few_bars"),
        ({"settings": {"cost_pct": -1}}, 422, None),
        ({"interval": "1h"}, 422, "invalid_strategy"),
    ],
)
def test_errors(api: TestClient, extra: dict[str, Any], status: int, code: str | None) -> None:
    response = _run(api, SMA_CROSS, **extra)
    assert response.status_code == status
    if code is not None:
        assert response.json()["code"] == code
