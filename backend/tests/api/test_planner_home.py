"""``/api/planner/home``: the apartment on assumed series and on the offline macro fixtures."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.home import months_between
from app.planner.mortgage import annuity

R = 0.04 / 12
BASE: dict[str, Any] = {
    "start": "2026-01-15",
    "end": "2028-01-15",
    "price": 1_000_000,
    "equity": 400_000,
    "tracks": [{"months": 240, "rate_pct": 4}],
    "value": {"mean_pct": 0},
    "inflation": {"mean_pct": 0},
}


def run(client: TestClient, **changes: Any) -> dict[str, Any]:
    response = client.post("/api/planner/home", json={**BASE, **changes})
    assert response.status_code == 200, response.text
    return response.json()


def test_months_between_counts_whole_months() -> None:
    from datetime import date  # noqa: PLC0415

    assert months_between(date(2026, 1, 15), date(2028, 1, 15)) == 24
    assert months_between(date(2026, 1, 15), date(2028, 1, 14)) == 23
    assert months_between(date(2026, 1, 15), date(2026, 1, 14)) < 1
    # A purchase on a month's last days: the month dates are clamped, and so is the count.
    assert months_between(date(2026, 1, 31), date(2026, 2, 28)) == 1
    assert months_between(date(2024, 2, 29), date(2025, 2, 28)) == 12
    assert months_between(date(2015, 1, 31), date(2025, 4, 30)) == 123


def test_one_fixed_track_on_a_constant_value(client: TestClient) -> None:
    body = run(client)
    summary = body["summary"]
    payment = 3635.88  # 600,000 at 4 % over 20 years, as a bank calculator shows it
    assert annuity(600_000, R, 240) == pytest.approx(payment, abs=0.005)
    balance = 600_000 * (1 + R) ** 24 - payment * ((1 + R) ** 24 - 1) / R
    assert (summary["months"], summary["loan"]) == (24, 600_000)
    assert summary["first_payment"] == pytest.approx(payment, abs=0.005)
    assert summary["paid"] == pytest.approx(24 * payment, abs=0.1)
    assert summary["balance"] == pytest.approx(balance, abs=1)
    assert summary["net_worth"] == pytest.approx(1_000_000 - balance, abs=1)
    assert summary["betterment_tax"] == 0.0
    assert len(body["schedule"]) == 240
    assert (body["schedule"][0]["date"], body["schedule"][-1]["date"]) == (
        "2026-02-15",
        "2046-01-15",
    )
    assert body["schedule"][-1]["balance"] == 0.0
    assert [p["date"] for p in body["path"][:2]] == ["2026-01-15", "2026-02-15"]
    assert len(body["path"]) == 25
    assert body["path"][0]["net_worth"] == pytest.approx(400_000)
    (track,) = body["tracks"]
    assert (track["amount"], track["first_rate"]) == (600_000, pytest.approx(0.04))


def test_a_mix_of_tracks_splits_the_loan_and_follows_the_assumed_rates(client: TestClient) -> None:
    body = run(
        client,
        tracks=[
            {"share": 1, "months": 240, "kind": "prime", "rate_pct": -0.5},
            {"share": 1, "months": 180, "kind": "fixed", "rate_pct": 4.5, "linked": True},
            {"share": 1, "months": 120, "kind": "variable", "rate_pct": 3.5, "reset_years": 5,
             "repayment": "grace", "grace_months": 12},
        ],
        rates={"base_pct": 3, "shock_pct": 2, "shock_after_months": 36},
        end="2036-01-15",
        inflation={"mean_pct": 2},
    )  # fmt: skip
    prime, linked, variable = body["tracks"]
    assert [t["amount"] for t in body["tracks"]] == pytest.approx([200_000.0] * 3)
    assert prime["first_rate"] == pytest.approx(0.03 + 0.015 - 0.005)
    assert linked["total_linkage"] > 0
    assert prime["total_linkage"] == 0
    # The shock reaches prime at once and the variable track at its reset (month 60).
    rows = body["schedule"]
    assert rows[36]["payment"] > rows[35]["payment"]
    assert variable["highest_payment"] > variable["first_payment"]
    assert len(rows) == 240
    assert body["summary"]["highest_payment"] >= body["summary"]["first_payment"]


def test_tax_presets_feed_the_purchase_tax(client: TestClient) -> None:
    presets = client.get("/api/planner/tax-presets").json()
    assert [p["id"] for p in presets["purchase"]] == ["single_home_2026", "additional_home_2026"]
    assert [p["id"] for p in presets["betterment"]] == ["single_home", "additional_home"]
    assert presets["betterment"][0]["spec"]["single_home"] is True
    single, additional = (p["brackets"] for p in presets["purchase"])
    assert single[-1] == {"up_to": None, "rate_pct": 10.0}
    assert [b["rate_pct"] for b in single] == [0.0, 3.5, 5.0, 8.0, 10.0]
    plan: dict[str, Any] = {"price": 2_500_000, "equity": 2_500_000, "tracks": []}
    first = run(client, **plan, purchase={"tax_brackets": single})
    assert first["summary"]["purchase_tax"] == pytest.approx(20_538.3, abs=0.1)
    second = run(client, **plan, purchase={"tax_brackets": additional, "lawyer_pct": 1})
    assert second["summary"]["purchase_tax"] == pytest.approx(200_000)
    assert second["summary"]["purchase_costs"] == pytest.approx(225_000)
    assert second["schedule"] == []


def test_growth_rent_and_the_sale_reach_the_net_worth(client: TestClient) -> None:
    body = run(
        client,
        value={"mean_pct": 5},
        rent={"mode": "rent_out", "monthly": 4000, "growth": "fixed", "growth_pct": 3,
              "vacancy_pct": 5, "tax_pct": 10},
        owner={"maintenance_pct": 1.2, "insurance": 1200},
        sale={"costs_pct": 2, "early_repayment_pct": 1,
              "betterment": {"rate_pct": 25, "single_home": False}},
    )  # fmt: skip
    summary = body["summary"]
    assert summary["value"] == pytest.approx(1_000_000 * 1.05**2)
    assert summary["selling_costs"] == pytest.approx(0.02 * summary["value"])
    assert summary["early_repayment_fee"] == pytest.approx(0.01 * summary["balance"])
    gain = summary["value"] * 0.98 - 1_000_000
    assert summary["betterment_tax"] == pytest.approx(0.25 * gain)
    assert summary["net_worth"] == pytest.approx(
        summary["value"] * 0.98 - summary["balance"] * 1.01 - summary["betterment_tax"]
    )
    assert body["path"][1]["rent"] == pytest.approx(4000 * 0.95 * 0.9)
    assert body["path"][13]["rent"] == pytest.approx(4000 * 1.03 * 0.95 * 0.9)
    assert summary["rent"] == pytest.approx(sum(p["rent"] for p in body["path"]))
    assert summary["xirr"] is not None


def test_the_dwelling_index_moves_the_value_inside_its_dates(client: TestClient) -> None:
    # The test index: 580.1 on 2026-06-01, 588.2 on 2026-08-01.
    plan: dict[str, Any] = {
        "start": "2026-06-01",
        "end": "2026-08-01",
        "equity": 1_000_000,
        "tracks": [],
    }
    body = run(client, **plan, value={"mode": "historical"})
    assert body["summary"]["value"] == pytest.approx(1_000_000 * 588.2 / 580.1)
    outside = client.post(
        "/api/planner/home",
        json={**BASE, **plan, "start": "2026-01-01", "value": {"mode": "historical"}},
    )
    assert (outside.status_code, outside.json()["code"]) == (422, "invalid_plan")
    assert "covers 2026-06-01" in outside.json()["detail"]


def test_published_indices_are_used_as_ratios_to_the_purchase_day(client: TestClient) -> None:
    # The test CPI: 104.6, 104.9, 105.2 on the first of 2026-08, -09, -10.
    plan: dict[str, Any] = {
        "start": "2026-08-01",
        "end": "2026-10-01",
        "tracks": [{"months": 240, "rate_pct": 4, "linked": True}],
        "inflation": {"mode": "historical"},
        "owner": {"insurance": 1200},
        "rent": {"mode": "live", "monthly": 4000},
    }
    body = run(client, **plan)
    first, second = body["schedule"][:2]
    assert first["linkage"] == pytest.approx(600_000 * (104.9 / 104.6 - 1))
    assert first["payment"] == pytest.approx(3635.88 * 104.9 / 104.6, abs=0.01)
    assert second["payment"] == pytest.approx(3635.88 * 105.2 / 104.6, abs=0.01)
    assert [p["rent"] for p in body["path"]] == pytest.approx([0, 4000, 4000 * 104.9 / 104.6])
    assert body["path"][1]["costs"] == pytest.approx(100 * 104.9 / 104.6)
    late = run(client, **{**plan, "end": "2027-10-01"})
    assert late["warnings"] == ["After the last published CPI it is held flat"]
    # Sold inside the data, but the linked track's schedule runs past it.
    past = "The schedule after the sale holds the CPI flat past its last published value"
    assert run(client, **{**plan, "end": "2026-09-01"})["warnings"] == [past]
    unlinked = {**plan, "end": "2026-09-01", "tracks": [{"months": 240, "rate_pct": 4}]}
    assert run(client, **unlinked)["warnings"] == []
    # Rent that follows the apartment's index (580.1, 584.0, 588.2 from 2026-06).
    rent = {"mode": "live", "monthly": 4000, "growth": "value"}
    dates = {"start": "2026-06-01", "end": "2026-08-01", "inflation": {"mean_pct": 0}}
    indexed = run(client, **{**plan, **dates, "rent": rent, "value": {"mode": "historical"}})
    assert [p["rent"] for p in indexed["path"]] == pytest.approx([0, 4000, 4000 * 584.0 / 580.1])


@pytest.mark.parametrize(
    ("changes", "detail"),
    [
        ({"equity": 1_200_000}, "equity cannot exceed"),
        ({"tracks": []}, "at least one mortgage track"),
        ({"end": "2026-02-14"}, "at least a month"),
        ({"tracks": [{"months": 12, "repayment": "grace", "grace_months": 12}]}, "grace period"),
        (
            {
                "purchase": {
                    "tax_brackets": [{"up_to": 2e6, "rate_pct": 0}, {"up_to": 1e6, "rate_pct": 5}]
                }
            },
            "must rise",
        ),
        ({"value": {"mode": "historical", "series": "cpi"}}, "not a dwelling"),
        ({"value": {"mode": "historical", "series": "dwelling_mars"}}, "not a dwelling"),
        ({"purchase": {"tax_brackets": [{"up_to": 1e6, "rate_pct": 8}]}}, "no upper bound"),
        ({"start": "9990-01-15", "end": "9995-12-31"}, "after 2200"),
        ({"start": "1900-01-15", "end": "2100-01-15"}, "at most 100 years"),
        ({"inflation": {"mode": "historical"}, "start": "1990-01-01", "end": "1992-01-01"}, "1994"),
    ],
)
def test_plans_that_cannot_run_are_422(
    client: TestClient, changes: dict[str, Any], detail: str
) -> None:
    response = client.post("/api/planner/home", json={**BASE, **changes})
    assert (response.status_code, response.json()["code"]) == (422, "invalid_plan")
    assert detail in response.json()["detail"]


def test_historical_rates_need_the_bank_of_israel_series(client: TestClient) -> None:
    response = client.post("/api/planner/home", json={**BASE, "rates": {"mode": "historical"}})
    assert (response.status_code, response.json()["code"]) == (503, "data_unavailable")


# ---------------------------------------------------------------- the interest stress test


def test_a_higher_bank_of_israel_rate_moves_a_prime_track_from_the_second_month(
    client: TestClient,
) -> None:
    prime = {"months": 240, "kind": "prime", "rate_pct": -0.5}
    body = run(client, tracks=[prime], rates={"base_pct": 4})
    # Prime: 4 % + 1.5 % - 0.5 % = 5 % quoted, known at the start of each month.
    first = annuity(600_000, 0.05 / 12, 240)
    assert body["summary"]["first_payment"] == pytest.approx(first)
    after_first = 600_000 * (1 + 0.05 / 12) - first
    assert [row["rise"] for row in body["stress"]] == pytest.approx([0.01, 0.02, 0.03])
    for row in body["stress"]:
        # The rate of month 1 was already set; from month 2 the annuity is on what is left.
        moved = annuity(after_first, (0.05 + row["rise"]) / 12, 239)
        assert row["highest_payment"] == pytest.approx(moved)
        assert row["paid"] == pytest.approx(first + 23 * moved)
    two = body["stress"][1]
    assert two["highest_payment"] - first == pytest.approx(689.67, abs=0.005)


def test_a_variable_track_moves_only_at_its_reset_so_the_whole_term_is_stressed(
    client: TestClient,
) -> None:
    variable = {"months": 240, "kind": "variable", "rate_pct": 4, "reset_years": 5}
    body = run(client, tracks=[variable])
    summary, (one, _, three) = body["summary"], body["stress"]
    # Sold after two years, before the first reset: nothing paid until the sale changes ...
    assert one["paid"] == pytest.approx(summary["paid"])
    # ... but the loan's highest payment does, and a later sale would meet it.
    assert summary["highest_payment"] < one["highest_payment"] < three["highest_payment"]
    at_reset = 600_000 * (1 + R) ** 60 - annuity(600_000, R, 240) * ((1 + R) ** 60 - 1) / R
    assert one["highest_payment"] == pytest.approx(annuity(at_reset, 0.05 / 12, 180))


def test_fixed_tracks_have_nothing_to_stress(client: TestClient) -> None:
    assert run(client)["stress"] == []
    assert run(client, equity=1_000_000, tracks=[])["stress"] == []
