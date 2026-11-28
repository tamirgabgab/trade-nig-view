"""``/api/strategies``: profiles, the catalog, saved strategies, signals (B0)."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

_CLOSE = {"price": "close"}


def _cond(left: dict[str, Any], op: str, right: dict[str, Any]) -> dict[str, Any]:
    return {"left": left, "op": op, "right": right}


SMA_CROSS: dict[str, Any] = {
    "kind": "rules",
    "profile": "position",
    "indicators": [{"id": "sma", "params": {"length": 20}}],
    "long": {"entry": [[_cond(_CLOSE, "crosses_above", {"indicator": 0, "output": "ma"})]]},
    "short": {"entry": [[_cond(_CLOSE, "crosses_below", {"indicator": 0, "output": "ma"})]]},
}


def _signals(api: TestClient, strategy: dict[str, Any], **extra: Any) -> Any:
    return api.post(
        "/api/strategies/signals", json={"symbol": "AAPL", "strategy": strategy, **extra}
    )


def test_profiles(api: TestClient) -> None:
    body = api.get("/api/strategy-profiles").json()
    assert [p["id"] for p in body] == ["day", "swing", "position", "long_term"]
    position = body[2]
    assert position["decision_intervals"] == ["1D"]
    assert position["context_intervals"] == ["1W"]
    assert (position["cap_period"], position["default_max_trades"]) == ("month", 10)


def test_the_catalog_lists_examples_and_python_files(api: TestClient) -> None:
    body = api.get("/api/strategies").json()
    assert body["saved"] == []
    assert len(body["examples"]) == 2
    files = {f["module"]: f for f in body["python"]}
    assert sorted(files) == ["breakout_weekly_trend", "broken", "cheat"]
    assert files["breakout_weekly_trend"]["error"] is None
    assert [p["name"] for p in files["breakout_weekly_trend"]["params"]] == ["length", "trend"]
    assert "SyntaxError" in files["broken"]["error"]


def test_save_load_list_delete(api: TestClient) -> None:
    put = api.put("/api/strategies/Cross", json={"revision": 0, "strategy": SMA_CROSS})
    assert put.status_code == 200
    assert put.json()["revision"] == 1
    got = api.get("/api/strategies/Cross").json()
    assert got["strategy"]["indicators"] == [
        {"id": "sma", "params": {"length": 20}, "interval": None}
    ]
    assert got["strategy"]["exits"]["on_opposite"] is True  # defaults filled in
    assert got["strategy"]["max_trades"] is None
    saved = api.get("/api/strategies").json()["saved"]
    assert [(s["name"], s["kind"], s["profile"]) for s in saved] == [("Cross", "rules", "position")]
    stale = api.put("/api/strategies/Cross", json={"revision": 0, "strategy": SMA_CROSS})
    assert stale.status_code == 409
    py = {"kind": "python", "profile": "position", "module": "breakout_weekly_trend",
          "params": {"length": 30}, "max_trades": 25}  # fmt: skip
    assert api.put("/api/strategies/Cross", json={"revision": 1, "strategy": py}).status_code == 200
    assert api.get("/api/strategies/Cross").json()["strategy"]["max_trades"] == 25
    assert api.delete("/api/strategies/Cross", params={"revision": 2}).status_code == 204
    assert api.get("/api/strategies/Cross").status_code == 404
    assert api.delete("/api/strategies/Cross", params={"revision": 2}).status_code == 404


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"indicators": [{"id": "nope"}]}, "Unknown indicator"),
        ({"long": {}, "short": {}}, "at least one entry group"),
        ({"profile": "scalper"}, "profile"),
        ({"indicators": [{"id": "sma", "interval": "1D"}]}, "not a context interval"),
    ],
)
def test_invalid_strategies_are_a_422(
    api: TestClient, change: dict[str, Any], message: str
) -> None:
    response = api.put("/api/strategies/Bad", json={"revision": 0, "strategy": SMA_CROSS | change})
    assert response.status_code == 422
    assert message in response.text


def test_signals_of_a_rules_strategy(api: TestClient) -> None:
    body = _signals(api, SMA_CROSS).json()
    assert body["interval"] == "1D"
    assert body["bars"] > 1000
    assert body["long_entry"]
    assert body["short_entry"]
    assert all(isinstance(t, str) and len(t) == 10 for t in body["long_entry"])
    assert body["conflict"] == []  # a cross above and below cannot fire together
    assert body["long_exit"] == []


def test_the_replay_cursor_cuts_the_signals(api: TestClient) -> None:
    full = _signals(api, SMA_CROSS).json()
    cut = full["long_entry"][len(full["long_entry"]) // 2]
    part = _signals(api, SMA_CROSS, until=cut).json()
    assert part["long_entry"] == [t for t in full["long_entry"] if t <= cut]


def test_examples_and_the_python_example_give_signals(api: TestClient) -> None:
    for example in api.get("/api/strategies").json()["examples"]:
        body = _signals(api, example["strategy"]).json()
        assert body["long_entry"] or body["short_entry"], example["name"]
    py = {"kind": "python", "profile": "position", "module": "breakout_weekly_trend"}
    body = _signals(api, py).json()
    assert body["long_entry"]
    assert body["short_entry"]


def test_a_swing_strategy_on_hourly_bars_with_a_daily_context(api: TestClient) -> None:
    swing = SMA_CROSS | {
        "profile": "swing",
        "indicators": [{"id": "sma", "params": {"length": 5}, "interval": "1D"}],
    }
    response = _signals(api, swing)
    assert response.status_code == 200
    body = response.json()
    assert body["interval"] == "1h"
    assert all(isinstance(t, int) for t in body["long_entry"])


@pytest.mark.parametrize(
    ("strategy", "extra", "status", "code"),
    [
        (SMA_CROSS, {"interval": "1h"}, 422, "invalid_strategy"),
        ({"kind": "python", "profile": "position", "module": "cheat"}, {}, 422,
         "strategy_lookahead"),
        ({"kind": "python", "profile": "position", "module": "broken"}, {}, 422,
         "python_strategy_error"),
        ({"kind": "python", "profile": "position", "module": "absent"}, {}, 404,
         "python_strategy_not_found"),
        ({"kind": "python", "profile": "position", "module": "breakout_weekly_trend",
          "params": {"length": 1}}, {}, 422, "invalid_params"),
        ({"kind": "python", "profile": "long_term", "module": "breakout_weekly_trend"},
         {"interval": "1M"}, 422, "python_strategy_error"),
    ],
)  # fmt: skip
def test_signals_errors(
    api: TestClient, strategy: dict[str, Any], extra: dict[str, Any], status: int, code: str
) -> None:
    response = _signals(api, strategy, **extra)
    assert response.status_code == status, response.text
    assert response.json()["code"] == code


def test_a_monthly_context_on_weekly_and_on_monthly_decisions(api: TestClient) -> None:
    monthly = SMA_CROSS | {
        "profile": "long_term",
        "indicators": [{"id": "sma", "params": {"length": 5}, "interval": "1M"}],
    }
    assert _signals(api, monthly).json()["interval"] == "1W"  # 1W decisions, 1M context
    # On 1M decisions the 1M "context" is the decision bars themselves.
    on_months = _signals(api, monthly, interval="1M")
    assert on_months.status_code == 200
    assert on_months.json()["long_entry"]


def test_a_strategy_may_be_named_like_a_route(api: TestClient) -> None:
    for name in ("profiles", "signals"):
        assert (
            api.put(
                f"/api/strategies/{name}", json={"revision": 0, "strategy": SMA_CROSS}
            ).status_code
            == 200
        )
        assert api.get(f"/api/strategies/{name}").json()["strategy"]["kind"] == "rules"
