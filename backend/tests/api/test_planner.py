"""``/api/planner``: the depth table and the market account on the offline test fixtures.

AAA: closes 101 .. 119 (one a day from 2026-01-26), a 2 % dividend on 2026-02-09, 1h bars from
2026-02-05. No ``ILS=X`` fixture, so USD/ILS is the Bank of Israel's snapshot.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

BASE: dict[str, Any] = {
    "assets": [{"symbol": "AAA"}],
    "use_fx": False,
    "deposits": [{"date": "2026-01-26", "amount": 1010}],
    "end": "2026-02-20",
    "taxes": {"gains_pct": 0, "dividend_pct": 0},
}


def run(client: TestClient, **changes: Any) -> dict[str, Any]:
    response = client.post("/api/planner/market", json={**BASE, **changes})
    assert response.status_code == 200, response.text
    return response.json()


def test_depth_table_reports_each_ticker_and_its_errors(client: TestClient) -> None:
    body = {"assets": [{"symbol": "aaa"}, {"symbol": "NOPE"}, {"symbol": "A B"}]}
    rows = client.post("/api/planner/assets", json=body).json()
    assert rows[0] == {
        "symbol": "AAA",
        "currency": "USD",
        "first": "2026-01-26",
        "last": "2026-02-20",
        "bars": 19,
        "has_dividends": True,
        "sell_date": None,
        "sell_price": None,
        "sell_fx": None,
        "error": None,
    }
    assert rows[1]["symbol"] == "NOPE"
    assert "No 1D data" in rows[1]["error"]
    assert rows[2]["error"] == "'A B' is not a ticker"


def test_one_deposit_without_fx_fees_or_tax(client: TestClient) -> None:
    body = run(client)
    summary = body["summary"]
    # 10 units at 101; the 2 % dividend is reinvested; sold at 119.
    assert summary["value"] == pytest.approx(10 * 119 / 0.98)
    assert summary["deposited"] == 1010
    assert summary["tax"] == 0
    assert body["earliest_start"] == "2026-01-26"
    assert body["fx_market_from"] is None
    assert body["warnings"] == []
    sold = body["assets"][0]
    assert (sold["sell_date"], sold["sell_price"], sold["sell_fx"]) == ("2026-02-20", 119.0, 1.0)
    (row,) = body["deposits"]
    assert row["lots"] == [
        {"symbol": "AAA", "date": "2026-01-26", "price": 101.0, "fx": 1.0, "units": 10.0,
         "cost": 1010.0, "value": pytest.approx(10 * 119 / 0.98)}
    ]  # fmt: skip
    # One month end (January) and the end of the plan.
    assert [p["date"] for p in body["path"]] == ["2026-01-31", "2026-02-20"]
    assert body["path"][0]["value"] == pytest.approx(10 * 105)


def test_taxes_and_fees_reach_the_summary(client: TestClient) -> None:
    summary = run(
        client,
        taxes={"gains_pct": 25, "dividend_pct": 25},
        fees={"deposit_pct": 1, "buy_pct": 0.5, "sell_pct": 0.5, "monthly_fee": 5},
    )["summary"]
    assert summary["deposit_fees"] == pytest.approx(10.1)
    assert summary["account_fees"] == pytest.approx(5.0)
    assert summary["dividend_tax"] > 0
    assert summary["tax"] == pytest.approx(0.25 * summary["taxable_gain"])
    assert summary["net_value"] == pytest.approx(summary["proceeds"] - summary["tax"])
    assert summary["net_gain"] == pytest.approx(summary["net_value"] - 1010)
    assert summary["xirr_net"] < summary["xirr_gross"]


def test_dollar_assets_use_the_bank_of_israel_rate_when_yahoo_has_none(client: TestClient) -> None:
    body = run(client, use_fx=True)
    (lot,) = body["deposits"][0]["lots"]
    assert lot["fx"] == 3.137  # 2026-01-26
    assert lot["units"] == pytest.approx(1010 / 3.137 / 101)
    assert body["summary"]["value"] == pytest.approx(lot["units"] * 119 / 0.98 * 3.123)
    assert body["fx_market_from"] is None
    assert any("Bank of Israel rate is used" in w for w in body["warnings"])


def test_recurring_deposits_and_the_real_result(client: TestClient) -> None:
    body = run(
        client,
        deposits=[],
        recurring=[{"start": "2026-01-26", "amount": 100, "every_months": 1, "count": 12}],
        inflation={"mean_pct": 10},
    )
    # Only the deposits before the end date count: the February one falls after it.
    assert [d["date"] for d in body["deposits"]] == ["2026-01-26"]
    # Monthly steps over 25 days: about the yearly rate (months differ in length).
    assert body["summary"]["inflation_yearly"] == pytest.approx(0.10, abs=0.01)
    assert body["summary"]["net_value_real"] < body["summary"]["net_value"]


def test_a_deposit_with_a_time_fills_from_the_hourly_bar(client: TestClient) -> None:
    # 17:00 in Israel on 2026-02-05 is 15:00 UTC: inside the 14:30 bar (open 108, close 108.1429).
    timed = [{"date": "2026-02-05", "amount": 1000, "time": "17:00"}]
    close = run(client, deposits=timed)["deposits"][0]["lots"][0]
    assert close["price"] == 108.1429
    linear = run(client, deposits=timed, fill={"mode": "linear"})["deposits"][0]["lots"][0]
    assert linear["price"] == pytest.approx(108.0 + 0.5 * 0.1429)
    # Before the hourly data starts, the time is a position in the daily bar: 17:00 in Israel is
    # 10:00 in New York, half an hour into a 6.5 hour session.
    early = run(
        client,
        deposits=[{"date": "2026-01-27", "amount": 1000, "time": "17:00"}],
        fill={"mode": "linear"},
    )["deposits"][0]["lots"][0]
    assert early["price"] == pytest.approx(101.0 + (0.5 / 6.5) * (102.0 - 101.0))


@pytest.mark.parametrize(
    ("changes", "detail"),
    [
        ({"deposits": []}, "at least one deposit"),
        (
            {"deposits": [{"date": "2026-01-05", "amount": 100}]},
            "AAA has no data before 2026-01-26",
        ),
        ({"end": "2026-01-26"}, "after the first deposit"),
        ({"inflation": {"mode": "historical"}, "deposits": [{"date": "1990-01-01", "amount": 1}]},
         "from 1994"),
        ({"assets": [{"symbol": "A B"}]}, "not a ticker"),
    ],
)  # fmt: skip
def test_plans_that_cannot_run_are_422(
    client: TestClient, changes: dict[str, Any], detail: str
) -> None:
    response = client.post("/api/planner/market", json={**BASE, **changes})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_plan"
    assert detail in response.json()["detail"]


def test_a_timed_deposit_on_a_day_without_trading_buys_at_the_next_open(
    client: TestClient,
) -> None:
    # Saturday 2026-01-31, 20:00 in Israel: the purchase lands on Monday's bar (open 105).
    saturday = [{"date": "2026-01-31", "amount": 1000, "time": "20:00"}]
    lot = run(client, deposits=saturday, fill={"mode": "linear"})["deposits"][0]["lots"][0]
    assert (lot["date"], lot["price"]) == ("2026-02-02", 105.0)


def test_an_end_date_long_after_the_data_or_before_the_first_deposit_is_422(
    client: TestClient,
) -> None:
    late = client.post("/api/planner/market", json={**BASE, "end": "2031-02-20"})
    assert (late.status_code, late.json()["code"]) == (422, "invalid_plan")
    assert "AAA has no data after 2026-02-20" in late.json()["detail"]
    early = client.post(
        "/api/planner/market",
        json={**BASE, "end": "2025-10-01", "inflation": {"sd_pct": 1, "seed": 1}},
    )
    assert (early.status_code, early.json()["code"]) == (422, "invalid_plan")
    assert "after the first deposit" in early.json()["detail"]


def test_an_unknown_time_zone_is_a_validation_error(client: TestClient) -> None:
    bad = client.post("/api/planner/market", json={**BASE, "timezone": "Mars/Phobos"})
    assert (bad.status_code, bad.json()["code"]) == (422, "validation_error")


def test_bad_fields_and_missing_data(client: TestClient) -> None:
    bad = client.post("/api/planner/market", json={**BASE, "taxes": {"gains_pct": 150}})
    assert (bad.status_code, bad.json()["code"]) == (422, "validation_error")
    missing = client.post("/api/planner/market", json={**BASE, "assets": [{"symbol": "NOPE"}]})
    assert (missing.status_code, missing.json()["code"]) == (503, "data_unavailable")
