"""``GET /api/trade-plan`` on the synthetic e2e universe (offline)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient

from tests.api.conftest import E2E_DATA

ROWS = (E2E_DATA / "daily" / "AAPL.csv").read_text(encoding="utf-8").splitlines()[1:]


def epoch(day: str) -> int:
    return int(datetime.fromisoformat(day).replace(tzinfo=UTC).timestamp())


def row(i: int) -> tuple[str, float]:
    cells = ROWS[i].split(",")
    return cells[0], float(cells[4])


def plan(client: TestClient, status: int = 200, **params: str | int | float) -> Any:
    params = {"symbol": "AAPL", "adjusted": "false", **params}  # the CSV closes as they are
    response = client.get("/api/trade-plan", params=params)
    assert response.status_code == status, response.text
    return response.json()


def test_a_long_plan_in_the_past_with_its_outcome(e2e_client: TestClient) -> None:
    day, close = row(-300)
    body = plan(
        e2e_client,
        time=epoch(day),
        entry=close,
        target=close * 1.05,
        stop=close * 0.975,
        h=20,
    )
    assert body["side"] == "long"
    assert body["origin_time"] == day
    assert body["origin_close"] == close
    s = body["summary"]
    assert s["p_fill"] == 1
    assert abs(s["p_target"] + s["p_stop"] + s["p_neither"] - 1) < 1e-9
    assert s["p_target_bounds"][0] <= s["p_target"] <= s["p_target_bounds"][1]
    assert s["loss_r"] <= -0.99
    assert len(body["heat"]) == len(body["multiples"]) == 6
    assert body["calibration"]["n"] > 0
    assert body["actual"] in {"target", "stop", "neither"}


def test_a_short_limit_plan_and_the_replay_cursor(e2e_client: TestClient) -> None:
    day, close = row(-300)
    body = plan(
        e2e_client,
        time=epoch(day),
        entry=close * 1.01,
        target=close * 0.96,
        stop=close * 1.03,
        h=10,
        cursor=epoch(day),
    )
    assert body["side"] == "short"
    assert 0 < body["summary"]["p_fill"] < 1
    assert body["actual"] is None  # the replay hides every bar after the entry


def test_invalid_plans(e2e_client: TestClient) -> None:
    day, close = row(-300)
    common = {"time": epoch(day), "h": 10}
    body = plan(e2e_client, 422, **common, entry=close, target=close * 1.05, stop=close * 1.02)
    assert body["code"] == "invalid_plan"
    assert plan(e2e_client, 422, **common, entry=close, target=close, stop=close)["status"] == 422
    first, c0 = row(5)
    body = plan(e2e_client, 422, time=epoch(first), entry=c0, target=c0 * 1.1, stop=c0 * 0.9, h=10)
    assert body["code"] == "not_enough_history"
    assert plan(e2e_client, 422, time=0, entry=1, target=2, stop=0.5, h=5)["status"] == 422
    after = plan(
        e2e_client,
        422,
        **common,
        entry=close,
        target=close * 1.05,
        stop=close * 0.97,
        cursor=epoch(day) - 86_400,
    )
    assert "after the replay cursor" in after["detail"]
