"""``/api/planner/withdraw`` with an owned apartment in the balance (J1): known answers through
the whole stack, on an assumed return and an assumed apartment."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.api.test_planner_withdraw import FLAT


@pytest.fixture
def client(e2e_client: TestClient) -> TestClient:
    return e2e_client


#: An apartment worth 2,000,000 that does not grow, lived in, with no costs and no loan.
HOME: dict[str, Any] = {
    "value": 2_000_000,
    "growth": "assumed",
    "growth_pct": 0,
    "use": "live",
    "maintenance_pct": 0,
    "insurance": 0,
    "selling_pct": 0,
    "role": "kept",
}


def run(client: TestClient, home: dict[str, Any] | None = None, **changes: Any) -> dict[str, Any]:
    body = {**FLAT, **changes}
    if home is not None:
        body["home"] = {**HOME, **home}
    response = client.post("/api/planner/withdraw", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def refused(client: TestClient, home: dict[str, Any], **changes: Any) -> str:
    body = {**FLAT, **changes, "home": {**HOME, **home}}
    response = client.post("/api/planner/withdraw", json=body)
    assert response.status_code == 422, response.text
    return str(response.json()["detail"])


def test_without_an_apartment_nothing_changes(client: TestClient) -> None:
    body = run(client)
    summary = body["summary"]
    assert summary["balance"] == pytest.approx(400_000)
    assert (summary["home_sold_month"], summary["home_sold_on"], summary["home_sale"]) == (
        None,
        None,
        None,
    )
    assert (summary["home_worth"], summary["home_cash"], summary["invested"]) == (0, 0, 0)
    assert summary["liquidation"] == pytest.approx(400_000)
    assert all(row["home"] == 0 and row["home_cash"] == 0 for row in body["rows"])


def test_a_kept_apartment_is_in_what_is_left(client: TestClient) -> None:
    body = run(client, {"selling_pct": 2})
    summary, rows = body["summary"], body["rows"]
    # Lived in, so it gives no cash: the account runs as without it.
    assert summary["balance"] == pytest.approx(400_000)
    assert rows[0]["home"] == pytest.approx(1_960_000)
    assert summary["home_worth"] == pytest.approx(1_960_000)
    assert summary["liquidation"] == pytest.approx(2_360_000)
    assert summary["liquidation_real"] == pytest.approx(2_360_000)
    assert summary["home_sold_month"] is None


def test_a_rent_that_pays_the_amount_leaves_the_account_untouched(client: TestClient) -> None:
    # 5,000 a month, no vacancy, 10 % tax: 4,500 in hand, the amount asked for.
    home = {"use": "rent_out", "rent": 5_000, "vacancy_pct": 0, "rent_tax_pct": 10}
    body = run(client, home, rule={"kind": "fixed", "amount": 4_500, "indexed": False})
    assert body["summary"]["balance"] == pytest.approx(1_000_000)
    assert body["rows"][1]["home_cash"] == pytest.approx(4_500)
    assert body["summary"]["home_cash"] == pytest.approx(60 * 4_500)
    assert body["summary"]["taken"] == pytest.approx(60 * 4_500)


def test_a_sale_on_a_date_with_its_loan_and_costs(client: TestClient) -> None:
    # A loan of 300,000 at 0 % over 120 months: 2,500 a month, paid from the account with the
    # 10,000. After 24 payments 240,000 is owed; the sale costs 2 % and the early repayment 1 %.
    home = {
        "loan": 300_000,
        "loan_rate_pct": 0,
        "loan_months": 120,
        "selling_pct": 2,
        "early_repayment_pct": 1,
        "role": "on_date",
        "sell_after_months": 24,
    }
    body = run(client, home)
    summary, rows = body["summary"], body["rows"]
    assert rows[1]["home_cash"] == pytest.approx(-2_500)
    assert rows[1]["sold"] == pytest.approx(12_500)
    worth = 2_000_000 * 0.98 - 240_000 * 1.01
    assert rows[24]["invested"] == pytest.approx(worth)
    assert rows[24]["balance"] == pytest.approx(1_000_000 - 23 * 12_500 + worth - 12_500)
    assert rows[25]["home"] == 0
    assert summary["balance"] == pytest.approx(rows[24]["balance"] - 36 * 10_000)
    assert (summary["home_sold_month"], summary["home_sold_on"], summary["home_sale"]) == (
        24,
        "2032-01-15",
        "planned",
    )


def test_sold_when_the_account_is_empty_and_the_bounds_may_sell_on_other_months(
    client: TestClient,
) -> None:
    body = run(
        client,
        {"role": "when_empty"},
        capital=100_000,
        cost_share_pct=50,
        returns={"mode": "assumed", "yearly_pct": 10},
    )
    summary, floor, ceiling = body["summary"], body["floor"], body["ceiling"]
    assert summary["home_sale"] == "empty"
    assert summary["depleted_month"] is None
    # A cost share of 0 pays more tax, so its account is empty sooner.
    assert floor["home_sold_month"] <= summary["home_sold_month"] <= ceiling["home_sold_month"]
    assert floor["home_sold_month"] < ceiling["home_sold_month"]


def test_no_note_on_a_loan_schedule_past_the_plan(client: TestClient) -> None:
    # A linked loan of 15 years beside a plan of 5, on the published CPI: the engine never reads
    # the months after the plan, so their CPI held flat is not worth a warning.
    home = {"loan": 300_000, "loan_months": 180, "loan_linked": True}
    body = run(client, home, start="2020-01-15", inflation={"mode": "historical"})
    assert not any("schedule" in warning for warning in body["warnings"])


def test_the_money_comes_back_after_a_forced_sale(client: TestClient) -> None:
    # The default owner costs (0.5 % of the value and 1,500 a year): month 92 pays its costs but
    # not all of the 10,000; month 93 cannot pay the costs, and the sale pays every month after.
    home = {"maintenance_pct": 0.5, "insurance": 1_500}
    summary = run(client, home, months=120)["summary"]
    assert (summary["home_sold_month"], summary["home_sale"]) == (93, "forced")
    assert summary["depleted_month"] is None
    assert (summary["short_months"], summary["first_short_month"]) == (1, 92)
    assert summary["first_short_on"] == "2037-09-15"
    assert summary["months_paid"] == 119


def test_a_kept_apartment_whose_costs_cannot_be_paid_is_sold(client: TestClient) -> None:
    body = run(client, {"insurance": 12_000}, capital=50_000)
    summary = body["summary"]
    assert summary["home_sale"] == "forced"
    assert any("forced" in warning for warning in body["warnings"])


def test_a_capital_of_zero_needs_an_apartment(client: TestClient) -> None:
    home = {"use": "rent_out", "rent": 5_000, "vacancy_pct": 0, "rent_tax_pct": 0}
    body = run(client, home, capital=0, rule={"kind": "fixed", "amount": 4_000, "indexed": False})
    assert body["summary"]["balance"] == pytest.approx(60 * 1_000)
    response = client.post("/api/planner/withdraw", json={**FLAT, "capital": 0})
    assert response.status_code == 422


def test_betterment_tax_on_the_cost_and_the_day_it_was_bought(client: TestClient) -> None:
    # An additional home: 25 % of the real gain. Bought on the first day for 1,500,000, sold at
    # the end for 2,000,000: 125,000 of tax.
    home = {"betterment": "full", "cost": 1_500_000, "bought": "2030-01-15"}
    body = run(client, home)
    assert body["summary"]["home_worth"] == pytest.approx(2_000_000 - 125_000)
    # Without a cost, its value on the first day is the cost: no gain, no tax.
    assert run(client, {"betterment": "full"})["summary"]["home_worth"] == pytest.approx(2_000_000)
    # The same cost paid years earlier is indexed by the CPI since, so the gain is smaller.
    earlier = run(client, {**home, "bought": "2005-06-01"})["summary"]["home_worth"]
    assert earlier > 2_000_000 - 125_000
    # A single home under the ceiling pays nothing whatever it cost.
    single = run(client, {**home, "betterment": "single_home"})["summary"]["home_worth"]
    assert single == pytest.approx(2_000_000)


def test_an_apartment_over_history_follows_the_dwelling_index(client: TestClient) -> None:
    body = run(client, {"growth": "index"}, start="2010-01-15")
    rows = body["rows"]
    assert rows[0]["home"] == pytest.approx(2_000_000)
    assert rows[-1]["home"] != pytest.approx(rows[0]["home"])


@pytest.mark.parametrize(
    ("home", "changes", "message"),
    [
        ({"loan": 2_500_000}, {}, "mortgage"),
        ({"role": "on_date", "sell_after_months": 61}, {}, "sale"),
        ({"cost": 1_000_000}, {}, "bought"),
        ({"cost": 1_000_000, "bought": "2030-02-01"}, {}, "bought"),
        ({"cost": 1_000_000, "bought": "1900-01-01"}, {}, "CPI"),
        ({"growth": "index"}, {"start": "1980-01-15"}, "index"),
    ],
)
def test_apartments_that_cannot_run_say_why(
    client: TestClient, home: dict[str, Any], changes: dict[str, Any], message: str
) -> None:
    assert message in refused(client, home, **changes)
