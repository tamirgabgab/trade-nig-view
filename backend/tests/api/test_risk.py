"""``GET /api/risk`` on the synthetic e2e universe (offline), and ``POST /api/learn/risk``."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient


def risk(client: TestClient, status: int = 200, **params: str | int) -> Any:
    response = client.get("/api/risk", params={"symbol": "AAPL", **params})
    assert response.status_code == status, response.text
    return response.json()


def test_var_and_es_per_horizon_method_level_and_tail(e2e_client: TestClient) -> None:
    body = risk(e2e_client)
    keys = {(e["horizon"], e["method"], e["level"], e["tail"]) for e in body["estimates"]}
    assert len(keys) == 3 * 4 * 3 * 2
    for e in body["estimates"]:
        assert 0 < e["var"] < e["es"]
    assert {t["tail"] for t in body["tails"]} == {"long", "short"}
    assert len(body["backtests"]) == 24
    assert all(b["n"] == 1000 for b in body["backtests"])
    breaches = {(b["tail"], b["level"]): b["times"] for b in body["breaches"]}
    assert len(breaches) == 6
    assert all(isinstance(t, str) for t in breaches[("long", 0.95)])


def test_replay_origin_and_short_history(e2e_client: TestClient) -> None:
    bars = e2e_client.get(
        "/api/bars", params={"symbol": "AAPL", "until": "2024-01-10", "limit": 1}
    ).json()["bars"]
    body = risk(e2e_client, origin=1_704_844_800)  # 2024-01-10
    assert body["last_time"] == bars[-1]["time"]
    assert risk(e2e_client, 422, origin=0)["code"] == "not_enough_history"


def test_the_learn_widget(client: TestClient) -> None:
    response = client.post(
        "/api/learn/risk", json={"source": {"kind": "synthetic", "scenario": "shock", "bars": 1500}}
    )
    assert response.status_code == 200, response.text
    assert response.json()["symbol"] == "shock"
