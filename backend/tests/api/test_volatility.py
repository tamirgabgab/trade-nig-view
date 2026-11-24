"""``GET /api/volatility`` on the synthetic e2e universe (offline), and the learn widget's
``POST /api/learn/volatility``."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi.testclient import TestClient

from app.analysis import volatility as vol
from tests.api.conftest import E2E_DATA


def cone(client: TestClient, status: int = 200, **params: str | int | float) -> Any:
    response = client.get("/api/volatility", params={"symbol": "AAPL", **params})
    assert response.status_code == status, response.text
    return response.json()


def test_the_cone_per_calendar_horizon(e2e_client: TestClient) -> None:
    body = cone(e2e_client)
    assert body["estimator"] == "yang_zhang"
    assert body["levels"] == list(vol.PERCENTILES)
    assert 250 <= body["bars_per_year"] <= 262
    assert [h["label"] for h in body["horizons"]] == ["week", "month", "quarter", "half", "year"]
    for h in body["horizons"]:
        assert h["percentiles"] == sorted(h["percentiles"])
        assert h["percentiles"][0] <= h["current"] <= h["percentiles"][-1]
        assert 0 <= h["rank"] <= 100
        low, high = h["ci"]
        assert low < h["current"] < high
    assert body["main"] == "month"
    squeeze = body["squeeze"]
    assert squeeze["horizon"] == "month"
    assert squeeze["threshold"] == 10
    assert squeeze["factor"] == 1.5
    assert squeeze["events"] >= squeeze["independent"] > 0
    assert 0 <= body["overnight"]["history"] <= 1
    assert 0 <= body["downside"]["history"] <= 1
    assert body["scores"][0]["qlike"] == min(s["qlike"] for s in body["scores"])
    assert body["realized"] is False  # 40 sessions of 1h bars are too few for the scores


def test_settings_reach_the_cone(e2e_client: TestClient) -> None:
    body = cone(e2e_client, estimator="parkinson", horizon="week", threshold=20, factor=1.25)
    assert body["estimator"] == "parkinson"
    assert body["main"] == "week"
    assert body["squeeze"]["threshold"] == 20
    assert body["squeeze"]["factor"] == 1.25
    assert cone(e2e_client, 422, estimator="range")["status"] == 422
    assert cone(e2e_client, 422, threshold=60)["status"] == 422
    assert cone(e2e_client, 422, factor=1)["status"] == 422


def test_other_intervals_use_their_own_bars_per_year(e2e_client: TestClient) -> None:
    weekly = cone(e2e_client, interval="1W")
    assert 52 <= weekly["bars_per_year"] <= 54
    assert weekly["horizons"][0]["label"] == "month"
    hourly = cone(e2e_client, interval="1h")
    assert isinstance(hourly["last_time"], int)
    assert hourly["horizons"][0]["label"] == "week"


def test_replay_ends_the_history(e2e_client: TestClient) -> None:
    body = cone(e2e_client, until="2024-01-02")
    bars = e2e_client.get(
        "/api/bars", params={"symbol": "AAPL", "until": "2024-01-02", "limit": 3}
    ).json()["bars"]
    assert body["last_time"] == bars[-1]["time"]
    middle = bars[1]
    origin = int(datetime.fromisoformat(f"{middle['time']}T00:00:00+00:00").timestamp())
    assert cone(e2e_client, origin=origin)["last_time"] == middle["time"]


def test_too_little_history_is_422(e2e_client: TestClient) -> None:
    rows = (E2E_DATA / "daily" / "AAPL.csv").read_text(encoding="utf-8").splitlines()
    assert cone(e2e_client, 422, until=rows[2].split(",")[0])["code"] == "not_enough_history"
    assert cone(e2e_client, 422, origin=0)["code"] == "not_enough_history"


def test_the_learn_widget_cone_on_a_scenario(client: TestClient) -> None:
    response = client.post(
        "/api/learn/volatility",
        json={"source": {"kind": "synthetic", "scenario": "accumulation", "bars": 1500}},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["symbol"] == "accumulation"
    assert body["squeeze"]["p"] > body["squeeze"]["base_rate"]
