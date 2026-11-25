"""``GET /api/regime`` on the synthetic e2e universe (offline), and ``POST /api/learn/regime``."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient


def regime(client: TestClient, status: int = 200, **params: str | int) -> Any:
    response = client.get("/api/regime", params={"symbol": "AAPL", **params})
    assert response.status_code == status, response.text
    return response.json()


def test_the_regime_report(e2e_client: TestClient) -> None:
    body = regime(e2e_client)
    assert [r["q"] for r in body["ratios"]] == [2, 4, 8, 16]
    assert 0 < body["p_bootstrap"] <= 1
    assert body["label"] in {"trend", "random", "reversion"}
    assert 250 <= body["window"] <= 262
    assert len(body["cells"]) == 6
    assert abs(sum(c["share"] for c in body["cells"]) - 1) < 1e-9
    assert body["forward"] == 10
    assert {r["family"] for r in body["rules"]} == {"trend", "reversion"}
    assert len(body["spectrum_history"]["h"]) == 6


def test_replay_and_short_history(e2e_client: TestClient) -> None:
    bars = e2e_client.get(
        "/api/bars", params={"symbol": "AAPL", "until": "2024-01-10", "limit": 1}
    ).json()["bars"]
    assert regime(e2e_client, origin=1_704_844_800)["last_time"] == bars[-1]["time"]
    assert regime(e2e_client, 422, origin=0)["code"] == "not_enough_history"


def test_the_learn_widget(client: TestClient) -> None:
    response = client.post(
        "/api/learn/regime",
        json={"source": {"kind": "synthetic", "scenario": "regimes", "bars": 2000}},
    )
    assert response.status_code == 200, response.text
    assert response.json()["label"] == "reversion"
