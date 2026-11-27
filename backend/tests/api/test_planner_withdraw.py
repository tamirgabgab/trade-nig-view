"""``/api/planner/withdraw`` on an assumed return (known answers through the whole stack) and
on the synthetic e2e data (AAPL's bars from 2001-12-24)."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(e2e_client: TestClient) -> TestClient:
    return e2e_client


MARKET: dict[str, Any] = {"assets": [{"symbol": "AAPL"}], "use_fx": False}
FLAT: dict[str, Any] = {
    "start": "2030-01-15",
    "months": 60,
    "capital": 1_000_000,
    "cost_share_pct": 100,
    "rule": {"kind": "fixed", "amount": 10_000, "indexed": False},
    "returns": {"mode": "assumed", "yearly_pct": 0},
    "market": MARKET,
    "inflation": {"mean_pct": 0},
}


def run(client: TestClient, **changes: Any) -> dict[str, Any]:
    response = client.post("/api/planner/withdraw", json={**FLAT, **changes})
    assert response.status_code == 200, response.text
    return response.json()


def test_a_fixed_amount_from_a_capital_that_does_not_grow(client: TestClient) -> None:
    body = run(client)
    summary, rows = body["summary"], body["rows"]
    assert (body["start"], body["end"], body["months"]) == ("2030-01-15", "2035-01-15", 60)
    # A row per month date, the start included; 10,000 a month for five years leaves 400,000.
    assert [row["month"] for row in rows] == list(range(61))
    assert (rows[0]["date"], rows[0]["balance"], rows[0]["net"]) == ("2030-01-15", 1_000_000, 0)
    assert (rows[1]["date"], rows[-1]["date"]) == ("2030-02-15", "2035-01-15")
    assert rows[-1]["balance"] == pytest.approx(400_000)
    assert summary["balance"] == pytest.approx(400_000)
    assert summary["taken"] == pytest.approx(600_000)
    assert (summary["tax"], summary["fees"], summary["commissions"]) == (0, 0, 0)
    assert (summary["depleted_month"], summary["depleted_on"]) == (None, None)
    assert summary["months_paid"] == 60
    assert summary["liquidation"] == pytest.approx(400_000)
    assert body["warnings"] == []


def test_the_month_the_money_ends(client: TestClient) -> None:
    body = run(client, months=120)
    summary = body["summary"]
    # Month 100 takes the last 10,000; month 101 is the first that cannot be paid.
    assert (summary["depleted_month"], summary["depleted_on"]) == (101, "2038-06-15")
    assert summary["months_paid"] == 100
    assert (summary["balance"], summary["lowest_net_real"]) == (0, 0)
    assert summary["taken"] == pytest.approx(1_000_000)
    assert [body["rows"][k]["net"] for k in (100, 101, 120)] == pytest.approx([10_000, 0, 0])


def test_the_two_bounds_of_the_tax_beside_the_plan(client: TestClient) -> None:
    growing = {"returns": {"mode": "assumed", "yearly_pct": 6}, "cost_share_pct": 50, "months": 240}
    fixed = run(client, **growing, rule={"kind": "fixed", "amount": 4_000, "indexed": False})
    floor, plan, ceiling = fixed["floor"], fixed["summary"], fixed["ceiling"]
    assert (floor["cost_share"], plan["cost_share"], ceiling["cost_share"]) == (0, 0.5, 1)
    # A fixed net amount: the more of the capital is gain, the more must be sold for it.
    assert floor["balance"] < plan["balance"] < ceiling["balance"]
    assert floor["tax"] > plan["tax"] > ceiling["tax"] > 0
    last = fixed["rows"][-1]
    assert (last["balance_floor"], last["balance"], last["balance_ceiling"]) == pytest.approx(
        (floor["balance"], plan["balance"], ceiling["balance"])
    )
    # A percent sold: the balance is the same under every cost share, the income is not.
    percent = run(client, **growing, rule={"kind": "percent", "percent": 5})
    floor, plan, ceiling = percent["floor"], percent["summary"], percent["ceiling"]
    assert floor["balance"] == pytest.approx(plan["balance"]) == pytest.approx(ceiling["balance"])
    assert floor["taken"] < plan["taken"] < ceiling["taken"]
    row = percent["rows"][12]
    assert row["net_floor"] < row["net"] < row["net_ceiling"]
    assert row["net_floor"] == pytest.approx(0.75 * row["sold"])  # the floor: 75 % of what is sold
    assert plan["depleted_month"] is None
    assert plan["months_paid"] == 240


def test_an_indexed_amount_rises_with_the_plans_inflation(client: TestClient) -> None:
    body = run(
        client,
        rule={"kind": "fixed", "amount": 4_000, "indexed": True},
        inflation={"mean_pct": 2.5},
    )
    rows = body["rows"]
    assert rows[12]["due"] == pytest.approx(4_000 * 1.025)
    assert rows[60]["due"] == pytest.approx(4_000 * 1.025**5)
    assert [row["net_real"] for row in rows[1:]] == pytest.approx([4_000] * 60)
    assert body["summary"]["lowest_net_real"] == pytest.approx(4_000)
    assert body["summary"]["taken_real"] == pytest.approx(240_000)
    assert body["summary"]["balance_real"] == pytest.approx(body["summary"]["balance"] / 1.025**5)


def test_the_real_base_taxes_less_and_the_currency_base_has_nothing_to_follow(
    client: TestClient,
) -> None:
    plan = {
        "returns": {"mode": "assumed", "yearly_pct": 6},
        "inflation": {"mean_pct": 3},
        "rule": {"kind": "percent", "percent": 4},
    }
    nominal = run(client, **plan)
    real = run(client, **plan, market={**MARKET, "taxes": {"base": "real"}})
    assert 0 < real["summary"]["tax"] < nominal["summary"]["tax"]
    currency = run(client, **plan, market={**MARKET, "taxes": {"base": "currency"}})
    assert currency["summary"]["tax"] == pytest.approx(nominal["summary"]["tax"])
    assert any("assumed return is in shekels" in note for note in currency["warnings"])


def test_the_fees_and_the_commission_of_the_market_tab_apply(client: TestClient) -> None:
    costs = {"sell_pct": 0.5, "management_pct": 1.2, "monthly_fee": 10}
    body = run(client, market={**MARKET, "fees": costs})
    summary = body["summary"]
    assert summary["commissions"] > 0
    assert summary["fees"] > 60 * 10
    assert summary["balance"] < 400_000
    for row in body["rows"]:
        assert row["sold"] == pytest.approx(
            row["commission"] + row["tax"] + row["fee"] + row["net"]
        )


def test_the_market_tabs_mix_over_history(client: TestClient) -> None:
    mix = {"start": "2010-01-15", "months": 120, "returns": {"mode": "mix"}, "cost_share_pct": 50}
    body = run(client, **mix, rule={"kind": "percent", "percent": 4})
    rows = body["rows"]
    assert (body["end"], len(rows)) == ("2020-01-15", 121)
    assert rows[0]["balance"] == 1_000_000
    assert all(row["balance"] > 0 for row in rows)
    # The synthetic AAPL walk moves: the balance is not a smooth curve.
    changes = [rows[k]["balance"] / rows[k - 1]["balance"] for k in range(1, 121)]
    assert min(changes) < 1 < max(changes)
    for row in rows:
        assert row["sold"] == pytest.approx(
            row["commission"] + row["tax"] + row["fee"] + row["net"]
        )
    assert body["summary"]["liquidation"] < body["summary"]["balance"]


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"start": "1999-01-15", "returns": {"mode": "mix"}}, "AAPL has no data before"),
        (
            {"start": "2020-01-15", "months": 120, "returns": {"mode": "mix"}},
            "AAPL has no data after",
        ),
        ({"rule": {"kind": "fixed", "amount": 0}}, "amount"),
        ({"rule": {"kind": "percent", "percent": 0}}, "percent"),
    ],
)
def test_plans_that_cannot_run_are_422(
    client: TestClient, changes: dict[str, Any], message: str
) -> None:
    response = client.post("/api/planner/withdraw", json={**FLAT, **changes})
    assert response.status_code == 422, response.text
    assert message in response.json()["detail"]


def test_the_request_is_checked(client: TestClient) -> None:
    for bad in ({"capital": 0}, {"months": 0}, {"months": 1201}, {"cost_share_pct": 101}):
        assert client.post("/api/planner/withdraw", json={**FLAT, **bad}).status_code == 422


def test_a_ticker_with_no_data_is_unavailable_as_in_the_market_tab(client: TestClient) -> None:
    unknown = {"returns": {"mode": "mix"}, "market": {"assets": [{"symbol": "NOPE"}]}}
    response = client.post("/api/planner/withdraw", json={**FLAT, **unknown, "start": "2010-01-15"})
    assert response.status_code == 503
    assert "NOPE" in response.json()["detail"]
