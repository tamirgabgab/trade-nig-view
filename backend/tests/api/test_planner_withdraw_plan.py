"""``/api/planner/withdraw`` from the Market tab's plan (J4): its deposits accumulate until its
end, and the withdrawals start that day with every lot's own cost. On the synthetic e2e data."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(e2e_client: TestClient) -> TestClient:
    return e2e_client


#: Three purchases of AAPL, handed over on 2010-01-15.
MARKET: dict[str, Any] = {
    "assets": [{"symbol": "AAPL"}],
    "use_fx": False,
    "deposits": [
        {"date": "2005-03-01", "amount": 100_000},
        {"date": "2007-06-01", "amount": 50_000},
        {"date": "2009-01-05", "amount": 80_000},
    ],
    "end": "2010-01-15",
    "inflation": {"mean_pct": 0},
}
PLAN: dict[str, Any] = {
    "start": "2010-01-15",
    "months": 120,
    "capital": 0,
    "rule": {"kind": "fixed", "amount": 2_000, "indexed": False},
    "returns": {"mode": "mix"},
    "inflation": {"mean_pct": 0},
    "plan": MARKET,
}


def run(client: TestClient, **changes: Any) -> dict[str, Any]:
    response = client.post("/api/planner/withdraw", json={**PLAN, **changes})
    assert response.status_code == 200, response.text
    return response.json()


def market(client: TestClient, **changes: Any) -> dict[str, Any]:
    response = client.post("/api/planner/market", json={**MARKET, **changes})
    assert response.status_code == 200, response.text
    return response.json()["summary"]


def test_the_withdrawals_start_from_what_the_plan_accumulated(client: TestClient) -> None:
    body = run(client)
    held = market(client)
    got = body["accumulated"]
    assert got["value"] == pytest.approx(held["value"])
    assert got["deposited"] == 230_000
    assert (got["deposits"], got["first"]) == (3, "2005-03-01")
    assert body["rows"][0]["balance"] == pytest.approx(held["value"])
    # Its overall cost share: what the Market tab would tax, turned around.
    cost = held["value"] - held["taxable_gain"]
    assert got["cost_share"] == pytest.approx(cost / held["value"])
    assert body["summary"]["cost_share"] == pytest.approx(got["cost_share"])
    # The tax is known, so there are no bounds.
    assert (body["floor"], body["ceiling"]) == (None, None)
    row = body["rows"][7]
    assert (row["balance_floor"], row["balance_ceiling"]) == (row["balance"], row["balance"])


def test_selling_everything_pays_the_market_tabs_tax(client: TestClient) -> None:
    # A month after the handover everything is sold (1,200 % a year is all of it in a month):
    # what reaches the hand is what the Market tab's plan leaves when it ends on that day.
    body = run(client, months=1, rule={"kind": "percent", "percent": 1200})
    later = market(client, end="2010-02-15")
    assert body["summary"]["taken"] == pytest.approx(later["net_value"])
    assert body["summary"]["tax"] == pytest.approx(later["tax"])
    # With the Market tab's commissions too.
    fees = {"fees": {"buy_pct": 0.2, "sell_pct": 0.5}}
    with_fees = run(
        client, months=1, rule={"kind": "percent", "percent": 1200}, plan={**MARKET, **fees}
    )
    assert with_fees["summary"]["taken"] == pytest.approx(
        market(client, end="2010-02-15", **fees)["net_value"]
    )


def test_the_oldest_lots_go_first(client: TestClient) -> None:
    exact = run(client)
    got = exact["accumulated"]
    # The same capital as one pooled lot at the plan's overall cost share spreads the gain
    # evenly; first in, first out sells the 2005 lot, which gained the most, first.
    account = {"assets": MARKET["assets"], "use_fx": False}
    pooled = run(
        client,
        plan=None,
        market=account,
        capital=got["value"],
        cost_share_pct=100 * got["cost_share"],
    )
    first_year = slice(1, 13)
    assert sum(r["tax"] for r in exact["rows"][first_year]) > 1.05 * sum(
        r["tax"] for r in pooled["rows"][first_year]
    )
    assert pooled["floor"] is not None


def test_history_and_worlds_use_the_plan_as_one_capital(client: TestClient) -> None:
    body = client.post("/api/planner/withdraw/study", json=PLAN)
    assert body.status_code == 200, body.text
    study = body.json()
    got = run(client)["accumulated"]
    assert study["start_worth"] == pytest.approx(got["value"])
    assert [b["cost_share"] for b in study["bounds"]] == pytest.approx([0, got["cost_share"], 1])
    assert any("overall cost share" in note for note in study["warnings"])
    worlds = client.post("/api/planner/withdraw/simulate", json={**PLAN, "runs": 20})
    assert worlds.status_code == 200, worlds.text
    assert worlds.json()["start_worth"] == pytest.approx(got["value"])


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"returns": {"mode": "assumed"}}, "assumed return"),
        ({"start": "2010-03-15"}, "the day the Market tab's plan ends"),
        ({"plan": {**MARKET, "deposits": []}}, "deposit"),
    ],
)
def test_plans_that_cannot_be_handed_over(
    client: TestClient, changes: dict[str, Any], message: str
) -> None:
    response = client.post("/api/planner/withdraw", json={**PLAN, **changes})
    assert response.status_code == 422, response.text
    assert message in response.json()["detail"]
